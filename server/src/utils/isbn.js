/**
 * أدوات ISBN — التحقق والتطبيع القانوني (المرحلة 1 من خطة الـ API).
 * ----------------------------------------------------------------
 * القواعد المؤكدة:
 *  - لا يُوثَق أي ISBN قبل نجاح فحص checksum (ISBN-10 بقاعدة 11 مع X،
 *    وISBN-13 بقاعدة EAN مع بادئة 978/979 حصراً).
 *  - الشكل القانوني الداخلي هو ISBN-13 دائماً: أي ISBN-10 صالح يُشتق له
 *    مكافئه 13 فلا يصبح الرقمان كتابين منفصلين عند الدمج/التكرار.
 *  - ISBN غير صالح لا "يُصلَّح" لرقم آخر أبداً — يُعامل كغير صالح فقط.
 */

/** يزيل الفواصل الشائعة (شرطات بأنواعها/مسافات) ويوحّد X كبيرة */
export function cleanIsbnInput(raw) {
  return String(raw || '')
    .trim()
    .replace(/[-\s‐-―−]/g, '')
    .toUpperCase();
}

/** checksum لـ ISBN-10: مجموع (10-i)*digit ≡ 0 (mod 11)، وX = 10 بخانة التحقق فقط */
export function isValidIsbn10(value) {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(value[i]);
  sum += value[9] === 'X' ? 10 : Number(value[9]);
  return sum % 11 === 0;
}

/** خانة تحقق EAN-13 لأول 12 رقماً */
function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** checksum لـ ISBN-13 — بادئة 978/979 شرط، فلا تُصنَّف باركودات EAN أخرى كـ ISBN */
export function isValidIsbn13(value) {
  if (!/^97[89]\d{10}$/.test(value)) return false;
  return Number(value[12]) === ean13CheckDigit(value.slice(0, 12));
}

/** يشتق ISBN-13 من ISBN-10 صالح (بادئة 978 + إعادة حساب خانة التحقق) */
export function isbn10To13(isbn10) {
  const first12 = `978${isbn10.slice(0, 9)}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}

/**
 * التطبيع الموحّد: ينظّف المدخل ويتحقق منه ويرجّع:
 *  { valid, canonical13, isbn10, input }
 *  - canonical13: الشكل القانوني (لـ 10 الصالح = مكافئه 13).
 *  - isbn10: أصل المدخل عندما كان ISBN-10 (للاستعلام لدى مصادر قد تفهرس
 *    الطبعات القديمة بالـ 10 فقط) — للـ provenance وليس للتخزين.
 *  - غير الصالح: valid=false وcanonical13=null — لا تخمين ولا إصلاح.
 */
export function normalizeIsbn(raw) {
  const cleaned = cleanIsbnInput(raw);
  if (isValidIsbn13(cleaned)) {
    return { valid: true, canonical13: cleaned, isbn10: null, input: cleaned };
  }
  if (isValidIsbn10(cleaned)) {
    return { valid: true, canonical13: isbn10To13(cleaned), isbn10: cleaned, input: cleaned };
  }
  return { valid: false, canonical13: null, isbn10: null, input: cleaned };
}

/**
 * كشف "يبدو ISBN" للتوجيه التلقائي من بحث All Fields:
 * الشكل الصحيح + نجاح checksum معاً — رقم عشوائي بطول مشابه لا يُصنَّف
 * ISBN إلا لو صادف checksum صالحاً (احتمال متعمَّد قبوله لأن سلوك مسار
 * الـ ISBN عندها آمن: تحقق تطابق صارم قبل قبول أي نتيجة).
 */
export function looksLikeIsbn(raw) {
  const cleaned = cleanIsbnInput(raw);
  if (!/^(\d{13}|\d{9}[\dX])$/.test(cleaned)) return false;
  return normalizeIsbn(cleaned).valid;
}
