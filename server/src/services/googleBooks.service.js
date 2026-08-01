import { config } from '../config/env.js';

/**
 * إعادة محاولة واحدة عند 503/429 أو خطأ شبكة — Google Books يرجّع 503 عابرة
 * بشكل متقطع (لوحظ فعلياً بالتحقق الإنتاجي). نفس سلوك fetchWithRetry اللي
 * كان بالفرونت-إند قبل الترحيل (محاولة إضافية واحدة بمهلة 800ms) — لا أكثر.
 */
async function fetchWithSingleRetry(url, retries = 1, delay = 800) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if ((res.status === 503 || res.status === 429) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
    }
  }
}

/**
 * يمرّر طلب بحث لـ Google Books API. نفس بنية الرابط اللي كان الفرونت-إند
 * يبنيها مباشرة (q جاهز مسبقاً بالـ prefix مثل intitle:/inauthor:/isbn:)،
 * فرق الوحيد إن المفتاح الآن يعيش هنا فقط، أبداً بكود العميل.
 *
 * يرجّع استجابة Google الخام كما هي — التطبيع (normalizeFromGoogleBooks)
 * يبقى مسؤولية bookModel.js بالفرونت-إند حالياً، ما تكرر المنطق هنا.
 */
export async function searchGoogleBooks(q, maxResults = 12) {
  if (!config.googleBooksApiKey) {
    const err = new Error('Google Books search is not configured on the server.');
    err.status = 503;
    throw err;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&key=${config.googleBooksApiKey}`;

  const res = await fetchWithSingleRetry(url);
  if (!res.ok) {
    const err = new Error(`Google Books API responded with ${res.status}`);
    err.status = res.status === 429 || res.status === 503 ? res.status : 502;
    throw err;
  }

  return res.json();
}
