/**
 * الموديل الموحّد للكتاب — نسخة الباك-إند (تطبيع فقط)
 * ----------------------------------------------------------------
 * ⚠️ تكرار مقصود وموثّق (القرار D5 بوثيقة المعمارية): دوال التطبيع هنا
 * منسوخة من my-book-app/src/bookModel.js عشان orchestration.service.js
 * يقدر يرجّع كائنات كتب مطبّعة جاهزة بدل استجابات خام.
 *
 * أي تعديل على قاعدة تطبيع هناك لازم يُطبَّق هنا يدوياً (والعكس) لحد ما
 * ننتقل لحزمة مشتركة (npm workspace) بمرحلة لاحقة من الخارطة.
 *
 * هذه النسخة تحتوي التطبيع فقط — التحقق (validateBookDraft) ومنطق التصدير
 * (bookToExportRow وما حوله) مسؤولية الفرونت-إند وحده ولا تُكرَّر هنا.
 */

export const BOOK_SOURCE = {
  GOOGLE_BOOKS: 'google_books',
  OPEN_LIBRARY: 'open_library',
  AI_SUGGESTED: 'ai_suggested',
  UPLOADED_FILE: 'uploaded_file',
  MANUAL: 'manual',
};

// صورة غلاف احتياطية موحّدة لكل المصادر (نفس قيمة الفرونت-إند حرفياً)
export const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=1000&auto=format&fit=crop';

/** يستخرج أرقام فقط من نص ISBN (يشيل الشرطات/المسافات/حرف X في ISBN-10) */
export function digitsOnly(value) {
  if (!value) return '';
  return String(value).replace(/[^0-9]/g, '');
}

/** يحوّل قيمة إلى رقم صحيح، أو null لو مو رقم صالح */
function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * المصنع الوحيد اللي ينتج كائن "كتاب" بالشكل الموحّد النهائي.
 * نفس عقد الفرونت-إند تماماً — الكائن الراجع من /api/search لازم يكون
 * قابل للاستخدام مباشرة بشاشة المراجعة بدون أي تحويل إضافي.
 */
export function createBook({
  id,
  source = BOOK_SOURCE.MANUAL,
  title,
  description,
  isbn,
  authors,
  pageCount,
  price,
  publishedYear,
  coverImage,
  genre,
  edition,
  unknownAuthorLabel = 'Unknown Author',
} = {}) {
  return {
    id: id || `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    isAiGenerated: source === BOOK_SOURCE.AI_SUGGESTED,

    title: title || 'Untitled',
    // نبذة الكتاب — لا تُختلق أبداً. فاضية لو ما فيه مصدر موثوق يوفرها.
    description: description || '',
    // أرقام فقط دائماً (قرار عمل مؤكد) — نخزنها كنص، والتصدير يحوّلها لرقم
    isbn: digitsOnly(isbn),
    authors: authors && authors.length > 0 ? authors : [unknownAuthorLabel],
    pageCount: pageCount || 0,
    // السعر يُدخل يدوياً دائماً — ما يجي من أي API أبداً
    price: toNumberOrNull(price),
    publishedYear: toNumberOrNull(publishedYear),
    coverImage: coverImage || FALLBACK_COVER,
    genre: genre || '',
    edition: edition || '',
  };
}

/** نتيجة Google Books API -> Book Model الموحّد */
export function normalizeFromGoogleBooks(item, unknownAuthorLabel) {
  const info = item.volumeInfo || {};

  // نفضّل ISBN_13 على ISBN_10 لأنه دائماً أرقام فقط بدون حرف تحقق X
  const identifiers = info.industryIdentifiers || [];
  const isbn13 = identifiers.find((i) => i.type === 'ISBN_13');
  const isbn10 = identifiers.find((i) => i.type === 'ISBN_10');
  const rawIsbn = isbn13?.identifier || isbn10?.identifier || identifiers[0]?.identifier;

  return createBook({
    id: item.id,
    source: BOOK_SOURCE.GOOGLE_BOOKS,
    title: info.title,
    description: info.description,
    authors: info.authors,
    publishedYear: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4), 10) : null,
    pageCount: info.pageCount,
    genre: info.categories?.[0],
    isbn: rawIsbn,
    coverImage: info.imageLinks?.thumbnail
      ? info.imageLinks.thumbnail.replace(/^http:/, 'https:')
      : null,
    unknownAuthorLabel,
  });
}

/** نتيجة Open Library -> Book Model الموحّد */
export function normalizeFromOpenLibrary(doc, unknownAuthorLabel) {
  return createBook({
    id: doc.key,
    source: BOOK_SOURCE.OPEN_LIBRARY,
    title: doc.title,
    // Open Library search endpoint ما يوفر نبذة موثوقة — نتركها فاضية بدل الاختلاق
    authors: doc.author_name,
    publishedYear: doc.first_publish_year || null,
    pageCount: doc.number_of_pages_median,
    genre: doc.subject ? doc.subject[0] : null,
    isbn: doc.isbn ? doc.isbn[0] : null,
    coverImage: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    unknownAuthorLabel,
  });
}

/** اقتراح Gemini AI (عند عدم توفر نتائج حقيقية إطلاقاً) -> Book Model الموحّد */
export function normalizeFromAI(suggestion, index) {
  return createBook({
    id: `gemini-${index}-${Date.now()}`,
    source: BOOK_SOURCE.AI_SUGGESTED,
    title: suggestion.title,
    authors: suggestion.author ? [suggestion.author] : null,
    publishedYear: suggestion.year ? parseInt(suggestion.year, 10) : null,
  });
}
