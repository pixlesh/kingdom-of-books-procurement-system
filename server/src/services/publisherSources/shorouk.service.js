/**
 * ===== مصدر حي: دار الشروق (shoroukbookstores.com) =====
 * ثالث وأخير مصدر ناشر حي بهذه المرحلة. تحقيق مباشر (وليس افتراض
 * التقييم السابق) أثبت أن "البحث" بالموقع هو مربع بحث جوجل المخصص
 * المُضمَّن حرفياً (Google Programmable Search Engine —
 * cx=010379068525541404458:jpymbbxm_74)، لا محرك بحث داخلي حقيقي —
 * يحتاج نفس عميل العرض المشترك (renderClient.js، بلا أي إطار متصفح ثانٍ
 * أو تطبيق خاص بالمصدر) لخطوة الحل فقط؛ صفحة المنتج نفسها HTML ثابت
 * عادي بلا حاجة متصفح على الإطلاق — نفس نمط مركز الأدب العربي بالضبط.
 *
 * ثروة بيانات غير متوقعة بالتحقيق المباشر: الصفحة تحمل schema.org
 * Product JSON-LD كامل (gtin13/sku/name/description/image/brand/offers)
 * لم يُرصدها التقييم السابق (اكتفى بتحليل حقول HTML موسومة يدوياً) — وهو
 * أوثق مصدر بيانات هنا؛ المؤلف تحديداً غير موجود بالـJSON-LD (Product
 * العام لا يحمل حقل مؤلف) فيُستخرج من وسم meta مخصص
 * (product:custom_label_0) رُصد يحمله حرفياً. الصفحات/سنة النشر/التصنيف
 * من حقول HTML موسومة بنمط ثابت جداً: <div class="right">التسمية</div>
 * <div class="left">القيمة</div>.
 *
 * ⚠️ الأسعار EGP لا SAR — لا تُدمَج أبداً بحقول price/priceIncludingVat
 * السعودية (قرار تصميم مؤكد بالعقد)؛ تُهمَل كلياً هنا، لا تُخزَّن حتى
 * للعرض، تفادياً لأي التباس مستقبلي.
 *
 * سنة النشر: الموقع يميّز "سنة النشر" (الطبعة الأصلية) عن "أحدث طبعة" —
 * نأخذ الأولى حصراً (تطابق باقي المصادر: سنة النشر الأصلية، لا الطبعة
 * الحالية)، ونتجاهل الثانية عمداً بلا دمج (تفادي لبس حقل واحد بقيمتين).
 */

import { fetchWithRetry } from '../../utils/http.js';
import { withPage } from './renderClient.js';

export const SOURCE_KEY = 'shorouk';
export const PUBLISHER_NAME = 'دار الشروق';

const BASE = 'https://www.shoroukbookstores.com';
// نفس درس الميزانيتين المنفصلتين المستفاد من مركز الأدب العربي: انتظار
// العنصر الداخلي يبدأ بعد goto لا معه — ميزانيتان منفصلتان تفادياً لخطأ
// مهلة زائف بحالة "صفر نتائج" الصادقة (مربع جوجل المضمَّن أبطأ نسبياً).
// ⚠️ رُصد بالاختبار الحي: مصدرا المتصفح (هذا + مركز الأدب العربي)
// يتشاركان نسخة متصفح واحدة (renderClient.js) ويُستدعيان بالتوازي دائماً
// (Promise.allSettled بمستوى السجل) — تنافس موارد حقيقي متقطع (وليس خللاً
// منطقياً: نفس الطلب المعزول ينجح بثبات خلال 4-6 ثوانٍ) رفع زمن التنفيذ
// أحياناً فوق سقف ضيق. الهامش هنا امتصاص لهذا التنافس، لا تراخٍ بالتحقق.
const NAV_AND_WAIT_TIMEOUT_MS = 16000;
const HARD_TIMEOUT_MS = 24000;
const FETCH_TIMEOUT_MS = 8000;
const RETRIES = 1;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.reason = `timeout after ${ms}ms`;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** خطوة المتصفح المشتركة الوحيدة: تحل رابط صفحة المنتج فقط — لا تُستخدم لاستخراج أي بيانات */
async function resolveProductUrl(canonicalIsbn13) {
  return withTimeout(
    withPage(async (page) => {
      const searchUrl = `${BASE}/search/?q=${encodeURIComponent(canonicalIsbn13)}`;
      const navStart = Date.now();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_AND_WAIT_TIMEOUT_MS });
      const remaining = NAV_AND_WAIT_TIMEOUT_MS - (Date.now() - navStart);
      try {
        await page.waitForSelector('a[href*="/books/view.aspx"]', { timeout: Math.max(1000, remaining) });
      } catch {
        return null; // صفر نتائج صادقة — وليس فشلاً بالضرورة
      }
      const href = await page.locator('a[href*="/books/view.aspx"]').first().getAttribute('href');
      if (!href) return null;
      const absolute = href.startsWith('http') ? href : `${BASE}${href}`;
      // تنظيف معامل تتبّع جوجل (srsltid) — لا قيمة له لهويّة المنتج، ويجعل
      // sourceUrl المخزَّن متقلباً بلا داعٍ بين نفس الكتاب بمحاولات مختلفة
      try {
        const u = new URL(absolute);
        u.searchParams.delete('srsltid');
        return u.toString();
      } catch {
        return absolute;
      }
    }),
    HARD_TIMEOUT_MS,
    'shorouk search'
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** يستخرج قيمة حقل موسوم بنمط الموقع الثابت: <div class="right">التسمية</div><div class="left">القيمة</div> */
function extractLabeledField(html, label) {
  const re = new RegExp(
    `<div class="right">\\s*${escapeRegex(label)}\\s*</div>\\s*<div class="left">([\\s\\S]*?)</div>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return '';
  // القيمة قد تحوي رابطاً (دار النشر) — نزيل الوسوم ونُنظّف المسافات
  return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractProductJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    try {
      const data = JSON.parse(raw);
      if (data && data['@type'] === 'Product') return data;
    } catch {
      // كتلة غير صالحة — تُتجاهل
    }
  }
  return null;
}

function extractAuthorMeta(html) {
  const m = html.match(/<meta[^>]*property="product:custom_label_0"[^>]*content="([^"]*)"/i);
  return m ? m[1].trim() : '';
}

/**
 * يبحث بـ ISBN دقيق ويرجّع { raw, sourceUrl, extra } أو null.
 * raw = كتلة Product JSON-LD + الحقول الموسومة المستخرَجة يدوياً (لا
 * يوجد نظام JSON-LD موحّد بهذا الموقع يغطي المؤلف/الصفحات/السنة).
 * التحقق الصارم (gtin13 == الـ ISBN-13 القانوني) مسؤولية المستدعي —
 * نفس فلسفة verifyExact بالضبط.
 */
export async function lookupByIsbn(canonicalIsbn13) {
  const productUrl = await resolveProductUrl(canonicalIsbn13);
  if (!productUrl) return null;

  const res = await fetchWithRetry(productUrl, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: RETRIES,
    fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } },
  });
  if (!res.ok) {
    const err = new Error(`shorouk product page HTTP ${res.status}`);
    err.reason = `HTTP ${res.status}`;
    throw err;
  }
  const html = await res.text();
  const ld = extractProductJsonLd(html);
  if (!ld) return null;

  const author = extractAuthorMeta(html);
  const pagesRaw = extractLabeledField(html, 'عدد الصفحات');
  const yearRaw = extractLabeledField(html, 'سنة النشر'); // الأصلية — لا "أحدث طبعة" عمداً
  const genre = extractLabeledField(html, 'تصنيفات');
  const publisherLabeled = extractLabeledField(html, 'دار النشر');

  return {
    raw: ld,
    sourceUrl: productUrl,
    extra: {
      author: author || null,
      pageCount: pagesRaw && /^\d+$/.test(pagesRaw) ? Number(pagesRaw) : null,
      publishedYear: yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null,
      genre: genre || null,
      // brand.name بالـJSON-LD هو الناشر الحقيقي عادة — الحقل الموسوم
      // احتياط/تحقق تقاطعي فقط لو غاب الأول
      publisherFallback: publisherLabeled || null,
    },
  };
}
