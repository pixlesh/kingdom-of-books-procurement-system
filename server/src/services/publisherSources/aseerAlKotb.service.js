/**
 * ===== مصدر حي: عصير الكتب للترجمة والنشر والتوزيع (aseeralkotb.com) =====
 * أول مصدر ناشر حي (Publisher Live Source) — كتالوجنا المستورد من ملفات
 * إكسل يبقى لقطة ثابتة، بينما هذا المصدر يُستعلَم مباشرة وقت كل بحث ISBN
 * دقيق، فيكتشف كتباً نُشرت بعد آخر ملف مورد استلمناه (لا حاجة لإعادة
 * استيراد يدوية أبداً لهذا المصدر تحديداً).
 *
 * اكتشاف تقني (تحقيق مباشر 2026-08-21، وليس افتراض التقييم السابق):
 * بوابة الموقع ليست تحدي Cloudflare حقيقياً — هي سكربت مموَّه بسيط يضبط
 * كوكي ثابتة (AserElKotb=<hash>) عبر document.cookie ثم يعيد تحميل
 * الصفحة. القيمة الحرفية موجودة كنص صريح داخل مصفوفة التمويه (غير
 * مموَّهة هي نفسها)، فتُستخرج بـ regex مباشر بلا أي محرك JS. إعادة تشغيل
 * الطلب بنفس الكوكي عبر HTTP عادي يرجّع الصفحة الكاملة SSR بما فيها
 * JSON-LD نظيف — **لا حاجة لمتصفح حقيقي بأي خطوة لهذا المصدر**.
 *
 * التحقق الصارم: لا نتيجة تُقبل إلا لو حقل isbn بالـ JSON-LD يطابق حرفياً
 * الـ ISBN-13 القانوني المطلوب — نفس فلسفة GB/OL بالضبط.
 */

import { fetchWithRetry } from '../../utils/http.js';

export const SOURCE_KEY = 'aseeralkotb';
export const PUBLISHER_NAME = 'عصير الكتب للترجمة والنشر والتوزيع';

const BASE = 'https://www.aseeralkotb.com';
const GATE_COOKIE_NAME = 'AserElKotb';
const GATE_COOKIE_TTL_MS = 60 * 60 * 1000; // ساعة — حذر: افتراض تناوب محتمل، ليس تخزيناً دائماً
const TIMEOUT_MS = 8000;
const RETRIES = 1;

let cachedCookie = null; // { value, expiresAt }

/** القيمة الحرفية للكوكي موجودة كنص صريح داخل مصفوفة سكربت البوابة المموَّه */
function extractGateCookie(bodyText) {
  const m = bodyText.match(new RegExp(`${GATE_COOKIE_NAME}=([0-9a-f]{16,64})`, 'i'));
  return m ? `${GATE_COOKIE_NAME}=${m[1]}` : null;
}

/** رد البوابة (stub) قصير جداً وخالٍ من أي محتوى SSR حقيقي — تمييز موثوق بديل عن الاعتماد على الحالة فقط */
function looksLikeGateStub(bodyText) {
  return bodyText.length < 3000 && /document\.cookie|window\[.*?\]\s*=\s*window/.test(bodyText);
}

async function fetchWithGate(url, { forceRefresh = false } = {}) {
  if (forceRefresh || !cachedCookie || Date.now() >= cachedCookie.expiresAt) {
    const gateRes = await fetchWithRetry(`${BASE}/ar`, {
      timeoutMs: TIMEOUT_MS,
      retries: RETRIES,
      fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } },
    });
    if (!gateRes.ok) {
      const err = new Error(`aseeralkotb gate request HTTP ${gateRes.status}`);
      err.reason = `HTTP ${gateRes.status}`;
      throw err;
    }
    const gateBody = await gateRes.text();
    const cookie = extractGateCookie(gateBody);
    if (!cookie) {
      const err = new Error('aseeralkotb gate cookie pattern not found (site structure may have changed)');
      err.reason = 'gate cookie extraction failed';
      throw err;
    }
    cachedCookie = { value: cookie, expiresAt: Date.now() + GATE_COOKIE_TTL_MS };
  }

  const res = await fetchWithRetry(url, {
    timeoutMs: TIMEOUT_MS,
    retries: RETRIES,
    fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cachedCookie.value } },
  });
  if (!res.ok) {
    const err = new Error(`aseeralkotb HTTP ${res.status}`);
    err.reason = `HTTP ${res.status}`;
    throw err;
  }
  const body = await res.text();

  // الكوكي المخزَّنة قد تكون دارت (احتياط) — محاولة تجديد واحدة فقط، بلا حلقات
  if (looksLikeGateStub(body) && !forceRefresh) {
    return fetchWithGate(url, { forceRefresh: true });
  }
  return body;
}

/**
 * يستخرج رابط أول نتيجة منتج حقيقية من صفحة نتائج البحث SSR.
 * ⚠️ الصفحة تحتوي روابط فلترة ثابتة (readable/purchasable/audio) بنفس
 * نمط /ar/books/ تسبق نتائج البحث الفعلية بترتيب HTML — لا تُميَّز بمجرد
 * وجود الرابط. بطاقة المنتج الحقيقية وحدها تحمل خاصية title مباشرة بعد
 * href (قيمتها عنوان الكتاب) — هذا هو المائز الموثوق.
 */
function extractFirstResultUrl(searchHtml) {
  const m = searchHtml.match(
    /<a href="(https:\/\/www\.aseeralkotb\.com\/ar\/books\/[^"?#]+)"\s+title="[^"]+"/
  );
  return m ? m[1] : null;
}

/** يستخرج كتلة JSON-LD من نوع Book من صفحة منتج SSR */
function extractBookJsonLd(pageHtml) {
  const blocks = [...pageHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    try {
      const data = JSON.parse(raw);
      if (data && data['@type'] === 'Book') return data;
    } catch {
      // كتلة JSON-LD غير صالحة — تُتجاهل، لا تُسقط الطلب كله
    }
  }
  return null;
}

/**
 * يبحث بـ ISBN دقيق ويرجّع بيانات الكتاب الخام (JSON-LD) أو null لو
 * لم يُعثر على تطابق ISBN صريح — التحقق الصارم مسؤولية المستدعي
 * (normalizeFromAseerAlKotbLive) لإبقاء هذه الدالة قابلة لإعادة الاستخدام
 * والاختبار المباشر بمعزل عن التطبيع.
 */
export async function lookupByIsbn(canonicalIsbn13) {
  const searchUrl = `${BASE}/ar/search?q=${encodeURIComponent(canonicalIsbn13)}`;
  const searchHtml = await fetchWithGate(searchUrl);
  const productUrl = extractFirstResultUrl(searchHtml);
  if (!productUrl) return null;

  const productHtml = await fetchWithGate(productUrl);
  const ld = extractBookJsonLd(productHtml);
  if (!ld) return null;

  return { raw: ld, sourceUrl: productUrl };
}
