import 'dotenv/config';

/**
 * نقطة القراءة الوحيدة لمتغيرات البيئة في كل الباك-إند.
 * لا مكان ثاني بالكود يقرأ process.env مباشرة — نفس فلسفة bookModel.js
 * بالفرونت-إند (مصدر واحد للحقيقة)، بس هنا لإعدادات البيئة بدل بيانات الكتاب.
 */
export const config = {
  port: process.env.PORT || 3001,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
  // مرحلة التقييم فقط (Stage 3): يُستخدم حصراً من سكربت التقييم المعزول
  // scripts/evaluate-isbndb.mjs — خط البحث الإنتاجي لا يلمسه إطلاقاً
  isbndbApiKey: process.env.ISBNDB_API_KEY || '',
  // مصادر الناشرين الحية (عصير الكتب/مركز الأدب العربي/دار الشروق) —
  // مفتاح إيقاف فوري بلا إعادة نشر لو أساء مصدر التصرف؛ مفعّل افتراضياً
  publisherLiveSourcesEnabled: process.env.PUBLISHER_LIVE_SOURCES !== 'off',
};

/**
 * تحذير عند الإقلاع فقط — ما نوقف السيرفر لو مفتاح ناقص، لأن الخدمة
 * (googleBooks.service.js) تتعامل مع غياب المفتاح بأمان (خطأ واضح 503،
 * مو انهيار). هذا يطابق سلوك الفرونت-إند الحالي: تدهور تدريجي بدل
 * توقف كامل عند غياب مصدر واحد.
 */
export function warnOnMissingKeys() {
  if (!config.googleBooksApiKey) {
    console.warn('⚠️  GOOGLE_BOOKS_API_KEY is not set — /api/search will skip Google Books (Open Library still works).');
  }
}
