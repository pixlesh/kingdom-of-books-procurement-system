/**
 * ===== مصدر حي: مركز الأدب العربي للنشر والتوزيع (adab-book.com) =====
 * ثاني مصدر ناشر حي — منصة Zid (متجر سعودي). تحقيق مباشر (وليس افتراض
 * التقييم السابق) أثبت أمرين مختلفين عمّا افتُرض:
 *  1) عنوان الكتاب سليم بكل صفحة فحصتها (name/<title> يطابقان بعضهما
 *     وصفحة المنتج) — الحقل الفعلي المختلط هو category بصيغة
 *     "اسم المؤلف > التصنيف" (خُلط بالتقييم السابق مع العنوان خطأً).
 *  2) صفحات المنتج نفسها HTML ثابت عادي (لا حاجة متصفح) — الحاجة
 *     الحقيقية الوحيدة للمتصفح المشترك هي خطوة البحث فقط (نتائجها تُرسم
 *     بجافاسكربت العميل، ولا يوجد API JSON موثّق بديل بعد فحص مباشر).
 *
 * الحارسان المطبَّقان (بطلب صريح: "حماية/ضبط قبل قبول النتيجة كموثوقة")
 * يبقيان مفعَّلين رغم أن عيب "العنوان" الأصلي لم يتكرر — نظافة هندسية،
 * ودفاع ضد احتمال تفاوت القالب بين منتجات مختلفة بنفس المتجر:
 *  - حارس العنوان: name يُقارَن بعنوان مُستخرَج من مسار الرابط (slug) —
 *    عدم تطابق معقول = العنوان لا يُقبل، والسجل يُعلَّم needsReview.
 *  - حارس المؤلف/التصنيف: category تُقسَّم فقط لو جزءان بالضبط حول ">"
 *    والجزء الأول (المؤلف المفترض) لا يساوي العنوان حرفياً (دفاع مباشر
 *    ضد نفس نمط الخلط الذي رُصد بين الحقلين).
 */

import { fetchWithRetry } from '../../utils/http.js';
import { withPage } from './renderClient.js';

export const SOURCE_KEY = 'adabbook';
export const PUBLISHER_NAME = 'مركز الأدب العربي للنشر والتوزيع';

const BASE = 'https://adab-book.com';
// ⚠️ ميزانيتان منفصلتان عمداً، لا رقم واحد يُعاد استخدامه: انتظار العنصر
// الداخلي يبدأ بعد انتهاء goto (لا معه)، فلو تشاركتا نفس السقف يفوز
// السباق الخارجي أحياناً بخطأ مهلة حتى بحالة "صفر نتائج" الصادقة تماماً
// (رُصد فعلياً: بحث خوف بالـISBN المطلوب يرجّع صفر روابط منتج حقيقي —
// السلوك الصحيح — لكن كان يخرج كخطأ مهلة بدل null نظيفة قبل هذا الإصلاح)
// ⚠️ رُصد بالاختبار الحي مع دار الشروق: مصدرا المتصفح يتشاركان نسخة
// متصفح واحدة (renderClient.js) ويُستدعيان بالتوازي دائماً — تنافس موارد
// متقطع رفع زمن التنفيذ أحياناً فوق سقف ضيق (رغم أن الطلب المعزول ينجح
// بثبات خلال ثوانٍ قليلة). الهامش هنا امتصاص لهذا التنافس، لا تراخٍ بالتحقق.
const NAV_AND_WAIT_TIMEOUT_MS = 16000; // ميزانية goto + انتظار العنصر الداخلية
const HARD_TIMEOUT_MS = 24000; // سقف خارجي صارم بهامش كافٍ فوق الداخلية
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

/** خطوة المتصفح الوحيدة: ترسم نتائج البحث وتستخرج رابط أول منتج حقيقي */
async function resolveProductUrl(canonicalIsbn13) {
  return withTimeout(
    withPage(async (page) => {
      const searchUrl = `${BASE}/products?q=${encodeURIComponent(canonicalIsbn13)}`;
      const navStart = Date.now();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_AND_WAIT_TIMEOUT_MS });
      const remaining = NAV_AND_WAIT_TIMEOUT_MS - (Date.now() - navStart);
      // ننتظر ظهور رابط منتج حقيقي — عدم ظهوره خلال ما تبقى من الميزانية
      // الداخلية = صفر نتائج صادقة (وليس فشلاً بالضرورة)، فنرجّع null بهدوء
      try {
        await page.waitForSelector('a[href*="/products/"]', { timeout: Math.max(1000, remaining) });
      } catch {
        return null;
      }
      const href = await page.locator('a[href*="/products/"]').first().getAttribute('href');
      if (!href) return null;
      return href.startsWith('http') ? href : `${BASE}${href}`;
    }),
    HARD_TIMEOUT_MS,
    'adabbook search'
  );
}

/** يستخرج كتلة JSON-LD من نوع Product من صفحة منتج SSR عادية */
function extractProductJsonLd(pageHtml) {
  const blocks = [...pageHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
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

/** عنوان من مسار الرابط (بعد فك ترميز URL) — أساس حارس العنوان */
function titleFromSlug(productUrl) {
  try {
    const path = new URL(productUrl).pathname;
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    return last.replace(/-/g, ' ').trim();
  } catch {
    return '';
  }
}

/** تشابه نصي متساهل: تطابق جزئي بأي اتجاه كافٍ (لا حاجة تطابق حرفي تام) */
function looksLikeSameTitle(a, b) {
  const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * يبحث بـ ISBN دقيق ويرجّع { data, sourceUrl, needsReview } أو null.
 * التحقق الصارم (data.sku == الـ ISBN-13 القانوني) مسؤولية المستدعي —
 * نفس الفلسفة المطبَّقة بمصدر عصير الكتب.
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
    const err = new Error(`adabbook product page HTTP ${res.status}`);
    err.reason = `HTTP ${res.status}`;
    throw err;
  }
  const html = await res.text();
  const data = extractProductJsonLd(html);
  if (!data) return null;

  // حارس العنوان: name يجب أن يتشابه مع العنوان المستخرج من مسار الرابط
  const slugTitle = titleFromSlug(productUrl);
  const titleTrusted = looksLikeSameTitle(data.name, slugTitle);

  // حارس المؤلف/التصنيف: category = "مؤلف > [مستويات وسيطة اختيارية] >
  // تصنيف" — رُصد بالبيانات الحية حتى 3 أجزاء (مثال حقيقي: "شهد قربان >
  // احدث الاصدارات > الرواية")، فالقاعدة: أول جزء = المؤلف (فقط لو لا
  // يساوي العنوان — دفاع ضد تبادل الحقول)، وآخر جزء = التصنيف الفعلي
  // (الأكثر تحديداً). لا نفترض عدد أجزاء ثابتاً أبداً.
  let author = null;
  let genre = null;
  if (typeof data.category === 'string') {
    const parts = data.category.split('>').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (!looksLikeSameTitle(parts[0], data.name)) author = parts[0];
      genre = parts[parts.length - 1];
    } else if (parts.length === 1) {
      genre = parts[0];
    }
  }

  return {
    raw: data,
    sourceUrl: productUrl,
    extra: { author, genre, titleTrusted },
  };
}
