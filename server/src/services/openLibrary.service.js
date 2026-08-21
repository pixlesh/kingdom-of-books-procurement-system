import { fetchWithRetry } from '../utils/http.js';

/**
 * إعدادات موثوقية Open Library (موثّقة — المرحلة 1):
 * خدمة مجانية best-effort — إعادة محاولة واحدة فقط (غير عدوانية) مع
 * مهلة أوسع قليلاً لأن استجاباتها أبطأ من Google.
 */
const OL_RETRIES = 1;
const OL_TIMEOUT_MS = 8000;
const OL_BASE_DELAY_MS = 800;

/**
 * 🐞 إصلاح المرحلة 1 (مؤكد بالتحقيق الميداني): search.json ما عاد يرجّع
 * isbn/number_of_pages_median... إلا بطلبها صراحةً عبر fields= — الكود
 * القديم كان يقرأ حقولاً غير موجودة بالاستجابة أصلاً، فكل كتب Open
 * Library كانت تخرج بلا ISBN وبلا عدد صفحات رغم توفرها بالمصدر.
 * الحقول هنا هي بالضبط ما يستهلكه المطبّع + publisher/language للتشخيص
 * ومراحل لاحقة.
 */
const OL_SEARCH_FIELDS = [
  'key',
  'title',
  'author_name',
  'isbn',
  'number_of_pages_median',
  'first_publish_year',
  'publisher',
  'cover_i',
  'language',
].join(',');

function olError(res) {
  const err = new Error(`Open Library API responded with ${res.status}`);
  err.status = res.status === 429 || res.status >= 500 ? 503 : 502;
  err.reason = `HTTP ${res.status}`;
  return err;
}

/**
 * بحث search.json — نفس معاملات الاستدعاء السابقة (q أو title/author)
 * مع طلب الحقول الفعلية صراحةً.
 */
export async function searchOpenLibrary({ q, title, author, limit = 12 }) {
  const params = new URLSearchParams({ limit: String(limit), fields: OL_SEARCH_FIELDS });
  if (title) params.set('title', title);
  else if (author) params.set('author', author);
  else params.set('q', q || '');

  const url = `https://openlibrary.org/search.json?${params.toString()}`;

  const res = await fetchWithRetry(url, {
    timeoutMs: OL_TIMEOUT_MS,
    retries: OL_RETRIES,
    baseDelayMs: OL_BASE_DELAY_MS,
  });
  if (!res.ok) throw olError(res);
  return res.json();
}

/**
 * نقطة الطبعة المباشرة /isbn/{isbn}.json — أغنى من search.json على
 * مستوى الطبعة (عدد صفحات/ناشر/تاريخ/أغلفة فعلية) وأثبت التحقيق أنها
 * تحتوي سجلات لا يظهرها البحث النصي (خصوصاً للكتب العربية المُرومنة).
 * 404 = الطبعة غير مفهرسة (نتيجة صادقة، ليست فشلاً) -> null.
 */
export async function getOpenLibraryEditionByIsbn(isbn) {
  const url = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
  const res = await fetchWithRetry(url, {
    timeoutMs: OL_TIMEOUT_MS,
    retries: OL_RETRIES,
    baseDelayMs: OL_BASE_DELAY_MS,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw olError(res);
  return res.json();
}

/**
 * يفكّ مراجع مؤلفي الطبعة (/authors/OL...A) إلى أسماء — حتى 3 مؤلفين،
 * بالتوازي، وأي فشل فردي يُتجاهل (الاسم رفاهية، ليس شرط نجاح البحث).
 */
export async function getOpenLibraryAuthorNames(authorRefs = []) {
  const keys = (authorRefs || [])
    .map((a) => a?.key)
    .filter((k) => typeof k === 'string' && k.startsWith('/authors/'))
    .slice(0, 3);

  const settled = await Promise.allSettled(
    keys.map(async (key) => {
      const res = await fetchWithRetry(`https://openlibrary.org${key}.json`, {
        timeoutMs: OL_TIMEOUT_MS,
        retries: 0,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.name || null;
    })
  );

  return settled
    .filter((s) => s.status === 'fulfilled' && s.value)
    .map((s) => s.value);
}
