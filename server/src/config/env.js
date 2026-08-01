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
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};

/**
 * تحذير عند الإقلاع فقط — ما نوقف السيرفر لو مفتاح ناقص، لأن كل خدمة
 * (googleBooks.service.js, gemini.service.js) تتعامل مع غياب المفتاح
 * بأمان (خطأ واضح 503، مو انهيار). هذا يطابق سلوك الفرونت-إند الحالي:
 * تدهور تدريجي بدل توقف كامل عند غياب مصدر واحد.
 */
export function warnOnMissingKeys() {
  if (!config.googleBooksApiKey) {
    console.warn('⚠️  GOOGLE_BOOKS_API_KEY is not set — /api/search will skip Google Books (Open Library still works).');
  }
  if (!config.geminiApiKey) {
    console.warn('⚠️  GEMINI_API_KEY is not set — /api/search AI fallback is disabled.');
  }
}
