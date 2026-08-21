/**
 * أدوات نص عربية لاستراتيجية البحث بالعنوان/المؤلف (مرحلة البحث النصي).
 * ----------------------------------------------------------------
 * مبنية على أدلة التحقيق الميداني:
 *  - سجلات Google قد تحمل علامات اتجاه RTL داخل العناوين (‏).
 *  - المستخدمون يكتبون بتهجئات متكافئة شائعة (ة/ه، أإآ/ا، ى/ي)
 *    والمصادر غير متسقة عليها.
 *  - التشكيل والتطويل (ـ) يفسدان المطابقة النصية.
 *
 * قاعدتان صارمتان:
 *  - stripArabicNoise: تنظيف آمن للاستعلام المُرسل للمصادر (تشكيل/تطويل/
 *    علامات اتجاه فقط — لا يغيّر أي حرف).
 *  - foldArabic: طيّ أعمق للمقارنة والترتيب فقط (أإآ→ا، ة→ه، ى→ي) —
 *    لا يُخزَّن أبداً ولا يُرسل للمصادر ولا يظهر للمستخدم.
 */

const DIACRITICS_RE = /[ً-ْٰ]/g; // التشكيل + الألف الخنجرية
const TATWEEL_RE = /ـ/g;
const DIRECTION_MARKS_RE = /[‎‏؜‪-‮]/g;
const ARABIC_RE = /[؀-ۿ]/;

/** تنظيف آمن (يصلح للإرسال للمصادر): تشكيل/تطويل/علامات اتجاه + مسافات */
export function stripArabicNoise(text) {
  return String(text || '')
    .replace(DIACRITICS_RE, '')
    .replace(TATWEEL_RE, '')
    .replace(DIRECTION_MARKS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** هل النص عربي الطابع؟ */
export function isArabicText(text) {
  return ARABIC_RE.test(String(text || ''));
}

/**
 * طيّ للمقارنة فقط: تنظيف + توحيد الهمزات على الألف، والتاء المربوطة
 * على الهاء، والألف المقصورة على الياء، وحروف لاتينية صغيرة.
 */
export function foldArabic(text) {
  return stripArabicNoise(text)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

/** كلمات مطوية غير فارغة للنص — للمطابقة الرمزية */
export function foldedTokens(text) {
  return foldArabic(text).split(/[\s:؛،,.!؟?"'«»()\-–—]+/).filter((t) => t.length > 1);
}

/**
 * نزع أداة التعريف "ال" من أول الكلمة (للمطابقة/الاستعلام فقط، وللكلمات
 * الأطول من 3 حروف كي لا نفسد كلمات قصيرة أصلية) — دليل ميداني: فهرس
 * Google العربي لا يطابق inauthor:المسلم مع "مسلم، أسامة" لكنه يطابق
 * inauthor:مسلم.
 */
export function stripAl(token) {
  const t = String(token || '');
  return t.length > 3 && t.startsWith('ال') ? t.slice(2) : t;
}
