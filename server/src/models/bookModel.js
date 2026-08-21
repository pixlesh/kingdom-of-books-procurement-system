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
  // كتالوج الناشرين/الموردين — المصدر الموثوق الأول لكتب المورد نفسه
  PUBLISHER_CATALOG: 'publisher_catalog',
  // مصادر الناشرين الحية (موقع الناشر الرسمي وقت البحث) — الطبقة الجديدة
  // بين الكتالوج المستورد وGoogle/Open Library بسلسلة الاحتياط:
  // Local Publisher Catalog -> Approved Publisher Live Sources -> GB -> OL
  PUBLISHER_LIVE_ASEERALKOTB: 'publisher_live_aseeralkotb',
  PUBLISHER_LIVE_ADABBOOK: 'publisher_live_adabbook', // (مستخدم أدناه: normalizeFromAdabBookLive)
  PUBLISHER_LIVE_SHOROUK: 'publisher_live_shorouk', // (مستخدم أدناه: normalizeFromShoroukLive)
  AI_SUGGESTED: 'ai_suggested',
  UPLOADED_FILE: 'uploaded_file',
  MANUAL: 'manual',
};

/**
 * ⚠️ تكرار مقصود وموثّق (القرار D5): نسخة الخادم من قائمة التصنيفات
 * المحكومة — منسوخة من my-book-app/src/bookModel.js لاستخدامها في
 * تطبيع تصنيفات كتالوج الموردين. أي تعديل هناك يُطبَّق هنا يدوياً.
 */
export const GENRE_OPTIONS = [
  { id: 'general-culture', ar: 'ثقافة عامة', en: 'General Culture' },
  { id: 'historical-culture', ar: 'ثقافة تاريخية', en: 'Historical Culture' },
  { id: 'poetry', ar: 'الشعر', en: 'Poetry' },
  { id: 'health-nutrition', ar: 'الصحة والتغذية', en: 'Health & Nutrition' },
  { id: 'scientific-books-encyclopedias', ar: 'كتب علمية وموسوعات', en: 'Scientific Books & Encyclopedias' },
  { id: 'press-media', ar: 'الصحافة والإعلام', en: 'Press & Media' },
  { id: 'texts-reflections', ar: 'نصوص وخواطر', en: 'Texts & Reflections' },
  { id: 'articles', ar: 'مقالات', en: 'Articles' },
  { id: 'economy', ar: 'الاقتصاد', en: 'Economy' },
  { id: 'educational', ar: 'تعليمي', en: 'Educational' },
  { id: 'biography', ar: 'سيرة ذاتية', en: 'Biography' },
  { id: 'travel-literature', ar: 'أدب الرحلات', en: 'Travel Literature' },
  { id: 'theatre', ar: 'مسرح', en: 'Theatre' },
  { id: 'thought-philosophy', ar: 'فكر وفلسفة', en: 'Thought & Philosophy' },
  { id: 'literary-works-collection', ar: 'مجموعة أعمال أدبية', en: 'Collection of Literary Works' },
  { id: 'art-music', ar: 'الفن والموسيقى', en: 'Art & Music' },
  { id: 'translated-novels', ar: 'روايات مترجمة', en: 'Translated Novels' },
  { id: 'novels', ar: 'روايات', en: 'Novels' },
  { id: 'children-books', ar: 'كتب الأطفال', en: "Children's Books" },
  { id: 'self-development', ar: 'تطوير ذات', en: 'Self Development' },
  { id: 'religious-books', ar: 'كتب دينية', en: 'Religious Books' },
  { id: 'young-adult-stories', ar: 'قصص الناشئين واليافعين', en: 'Stories for Young Adults and Teenagers' },
  { id: 'development-psychology', ar: 'تنمية وعلم النفس', en: 'Development and Psychology' },
  { id: 'koran', ar: 'القرآن الكريم', en: 'Koran' },
  { id: 'osama-almuslim-novels', ar: 'روايات أسامة المسلم', en: 'Novels of Osama Al-Muslim' },
  { id: 'comics-manga', ar: 'كوميكس / مانجا', en: 'Comics / Manga' },
  { id: 'card-games', ar: 'ألعاب ورقية', en: 'Card Games' },
  { id: 'sports', ar: 'رياضة', en: 'Sports' },
  { id: 'smart-games', ar: 'ألعاب ذكية', en: 'Smart Games' },
  { id: 'children-movement-games', ar: 'ألعاب الأطفال الحركية', en: "Children's Movement Games" },
  { id: 'english-books', ar: 'English books', en: 'English Books' },
  { id: 'stationery', ar: 'قرطاسية', en: 'Stationery' },
  { id: 'coloring-books', ar: 'دفاتر تلوين', en: 'Coloring Books' },
  { id: 'squishy-clay', ar: 'سكوِشي وصلصال', en: 'Squishies and Modeling Clay' },
];

/** يطابق معرّفاً/تسمية عربية/تسمية إنجليزية معتمدة — أو null */
export function findGenreOption(value) {
  if (!value) return null;
  const v = String(value).trim();
  return GENRE_OPTIONS.find((g) => g.id === v || g.ar === v || g.en === v) || null;
}

import { normalizeIsbn } from '../utils/isbn.js';

/**
 * 🐞 إصلاح مرحلة جودة البيانات: أُلغيت صورة الغلاف البديلة (Unsplash) —
 * كانت صورة زخرفية عامة تُصدَّر كأنها غلاف الكتاب الفعلي. الغلاف المفقود
 * يبقى '' بصدق، فتلتقطه آليات التمييز الحالية (تظليل أحمر بالمراجعة
 * والإكسل) بدل إخفائه خلف صورة لا علاقة لها بالكتاب.
 */

/** فحص متحفظ لاتساق لغة النبذة مع لغة الكتاب (المرحلة: جودة البيانات).
 * الحالة الواقعية المرصودة: Google قدّم نبذة دنماركية لكتاب عربي
 * (متحف البراءة 9789770933855). القاعدة الحتمية الخفيفة (بلا أي مكتبة
 * كشف لغة): لو الكتاب عربي (حقل اللغة أو حروف العنوان) والنبذة تكاد
 * تخلو من الحروف العربية -> نرفضها ونترك النبذة فاضية بصدق.
 * لا نحكم على النصوص القصيرة جداً، ولا نفحص غير الكتب العربية —
 * متحفظ عمداً: يرفض فقط التناقض الواضح، ولا يترجم ولا يولّد شيئاً.
 */
const ARABIC_CHARS_RE = /[؀-ۿ]/g;
const LATIN_CHARS_RE = /[A-Za-z]/g;

function countMatches(text, re) {
  return (String(text || '').match(re) || []).length;
}

export function descriptionConsistentWithBook(description, { title, language } = {}) {
  const bookIsArabic =
    language === 'ar' || countMatches(title, ARABIC_CHARS_RE) > countMatches(title, LATIN_CHARS_RE);
  if (!bookIsArabic) return true;

  const arabic = countMatches(description, ARABIC_CHARS_RE);
  const latin = countMatches(description, LATIN_CHARS_RE);
  if (arabic + latin < 20) return true; // نص قصير جداً — لا نحكم عليه
  return arabic / (arabic + latin) >= 0.3;
}

/**
 * 🐞 إصلاح المرحلة 1: كان الحقل يُنظَّف بـ digitsOnly فقط — فأي معرّف
 * رقمي (باركود مكتبة مثلاً) كان يمر كأنه ISBN. الآن: لا يُخزَّن إلا
 * ISBN صالح checksum بشكله القانوني ISBN-13؛ أي قيمة أخرى = '' (مفقود
 * بصدق — لا يُختلق معرّف أبداً، خصوصاً لأن القيمة تصل ملف الإكسل).
 */
function canonicalIsbnOrEmpty(value) {
  const normalized = normalizeIsbn(value);
  return normalized.valid ? normalized.canonical13 : '';
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
  subtitle,
  description,
  isbn,
  authors,
  pageCount,
  price,
  priceIncludingVat,
  publishedYear,
  coverImage,
  genre,
  edition,
  publisher,
  language,
  unknownAuthorLabel = 'Unknown Author',
  // provenance إضافية اختيارية (مصادر الناشرين الحية) — حقول جديدة تُضاف
  // بأمان لأن أي مستهلك حالي (فرونت-إند/تصدير) يتجاهل الحقول غير المعروفة
  sourceUrl,
  fetchedAt,
  needsReview,
} = {}) {
  return {
    id: id || `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    isAiGenerated: source === BOOK_SOURCE.AI_SUGGESTED,

    title: title || 'Untitled',
    // حقول جودة/تحقق داخلية (مرحلة الدمج الحقلي): تُحفظ ولا تُهدر —
    // بلا أي أعمدة إكسل جديدة وبلا تغيير بواجهة المستخدم
    subtitle: subtitle || '',
    // نبذة الكتاب — لا تُختلق أبداً. فاضية لو ما فيه مصدر موثوق يوفرها.
    description: description || '',
    // ISBN-13 قانوني صالح checksum أو '' — أبداً لا معرّفات أخرى (المرحلة 1)
    isbn: canonicalIsbnOrEmpty(isbn),
    authors: authors && authors.length > 0 ? authors : [unknownAuthorLabel],
    pageCount: pageCount || 0,
    // السعر: يدوي، أو موثوق من كتالوج المورد (سعر القالب شامل الضريبة
    // يُشتق منه ما قبل الضريبة عند الاستيراد) — لا يجي من أي API عام أبداً
    price: toNumberOrNull(price),
    priceIncludingVat: toNumberOrNull(priceIncludingVat),
    publishedYear: toNumberOrNull(publishedYear),
    // غلاف حقيقي من مصدر كتب فقط — الغلاف المفقود يبقى '' بصدق،
    // لا صورة بديلة عامة أبداً (تلتقطه آليات التمييز الحالية)
    coverImage: coverImage || '',
    genre: genre || '',
    edition: edition || '',
    publisher: publisher || '',
    language: language || '',
    // فاضية/غائبة لكل المصادر القديمة (GB/OL/catalog) — لا تغيّر شكلها؛
    // تُملأ فقط من مصادر الناشرين الحية للتشخيص والمراجعة المستقبلية
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(fetchedAt ? { fetchedAt } : {}),
    ...(needsReview ? { needsReview: true } : {}),
  };
}

/** نتيجة Google Books API -> Book Model الموحّد */
export function normalizeFromGoogleBooks(item, unknownAuthorLabel) {
  const info = item.volumeInfo || {};

  // 🐞 إصلاح المرحلة 1: نقبل نوعي ISBN_13/ISBN_10 حصراً. النوع OTHER
  // (باركودات مكتبات جامعية مثل UOM:39015...) كان يتسرب سابقاً عبر
  // identifiers[0] ويتحول لأرقام تُخزَّن كـ ISBN مزيف — ممنوع نهائياً.
  // لا ISBN صالح = يبقى الحقل مفقوداً بصدق.
  const identifiers = info.industryIdentifiers || [];
  const isbn13 = identifiers.find((i) => i.type === 'ISBN_13');
  const isbn10 = identifiers.find((i) => i.type === 'ISBN_10');
  const rawIsbn = isbn13?.identifier || isbn10?.identifier || null;

  // 🐞 تنقية تلوث المؤلفين (حالة مرصودة: "أورهان باموق، دار الشروق" —
  // اسم الناشر داخل مصفوفة المؤلفين). حذف متحفظ بالتطابق الحرفي فقط
  // مع حقل الناشر المتاح منفصلاً — ولا نفرّغ القائمة أبداً.
  const publisher = (info.publisher || '').trim();
  let authors = info.authors || null;
  if (authors && publisher) {
    const filtered = authors.filter((a) => String(a).trim() !== publisher);
    if (filtered.length > 0) authors = filtered;
  }

  // نبذة بلغة تناقض لغة الكتاب بوضوح (حالة مرصودة: نبذة دنماركية لكتاب
  // عربي) = تُرفض وتبقى فاضية بصدق — لا نص غير ذي صلة يصل التصدير
  const rawDescription = info.description || '';
  const description = descriptionConsistentWithBook(rawDescription, {
    title: info.title,
    language: info.language,
  })
    ? rawDescription
    : '';
  if (rawDescription && !description) {
    console.warn(`[quality] dropped language-inconsistent description (googleBooks, title="${String(info.title).slice(0, 40)}")`);
  }

  return createBook({
    id: item.id,
    source: BOOK_SOURCE.GOOGLE_BOOKS,
    title: info.title,
    subtitle: info.subtitle,
    description,
    authors,
    publishedYear: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4), 10) : null,
    pageCount: info.pageCount,
    genre: info.categories?.[0],
    isbn: rawIsbn,
    coverImage: info.imageLinks?.thumbnail
      ? info.imageLinks.thumbnail.replace(/^http:/, 'https:')
      : null,
    publisher,
    language: info.language,
    unknownAuthorLabel,
  });
}

/**
 * يختار أفضل ISBN من مصفوفة Open Library (خليط 10/13 بترتيب اعتباطي):
 * أول ISBN-13 صالح، وإلا أول ISBN-10 صالح — createBook يقونن الناتج.
 */
function pickBestOpenLibraryIsbn(isbns) {
  if (!Array.isArray(isbns) || isbns.length === 0) return null;
  let firstValid10 = null;
  for (const candidate of isbns) {
    const normalized = normalizeIsbn(candidate);
    if (!normalized.valid) continue;
    if (!normalized.isbn10) return candidate; // ISBN-13 صالح — الأفضل مباشرة
    if (!firstValid10) firstValid10 = candidate;
  }
  return firstValid10;
}

/**
 * سجل كتالوج الموردين المخزَّن -> الموديل الموحّد.
 * بيانات المورد موثوقة كما هي (قرار عمل): النبذة العربية، الصفحات،
 * الغلاف المباشر، السعر شامل الضريبة (مع ما قبل الضريبة المشتق عند
 * الاستيراد)، والتصنيف الممرَّر عبر خريطة الأسماء البديلة — التصنيف غير
 * الممكن تطبيعه بثقة يبقى بقيمته الخام فتلتقطه مراجعة التصنيفات الحالية.
 */
export function normalizeFromPublisherCatalog(record) {
  return createBook({
    id: `catalog-${record.isbn13}`,
    source: BOOK_SOURCE.PUBLISHER_CATALOG,
    title: record.title,
    description: record.description,
    isbn: record.isbn13,
    authors: record.authors,
    pageCount: record.pageCount,
    price: record.price,
    priceIncludingVat: record.priceIncludingVat,
    publishedYear: record.publishedYear,
    coverImage: record.coverImage,
    genre: record.genre,
    edition: record.edition,
    publisher: record.publisher,
    language: record.language,
  });
}

/** نتيجة Open Library (search.json — مع fields المطلوبة صراحةً) -> الموديل الموحّد */
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
    isbn: pickBestOpenLibraryIsbn(doc.isbn),
    coverImage: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    publisher: doc.publisher?.[0],
    language: doc.language?.[0],
    unknownAuthorLabel,
  });
}

/**
 * سجل طبعة Open Library (/isbn/{isbn}.json) -> الموديل الموحّد.
 * بيانات مستوى الطبعة (صفحات/تاريخ/غلاف فعلي) — أثبت التحقيق أنها أدق
 * وأغنى من نتائج البحث النصي، وأحياناً السبيل الوحيد للسجل العربي.
 */
export function normalizeFromOpenLibraryEdition(edition, { canonicalIsbn, authorNames = [] } = {}) {
  const yearMatch = String(edition.publish_date || '').match(/\d{4}/);
  const language = edition.languages?.[0]?.key
    ? String(edition.languages[0].key).replace('/languages/', '')
    : null;

  // نبذة الطبعة (نص مباشر أو {value}) — بنفس فحص اتساق اللغة المتحفظ
  const rawDescription = edition.description
    ? String(edition.description.value || edition.description)
    : '';
  const description = descriptionConsistentWithBook(rawDescription, {
    title: edition.title,
    language: language === 'ara' ? 'ar' : language,
  })
    ? rawDescription
    : '';
  if (rawDescription && !description) {
    console.warn(`[quality] dropped language-inconsistent description (openLibrary edition, title="${String(edition.title).slice(0, 40)}")`);
  }

  return createBook({
    id: edition.key || `ol-edition-${canonicalIsbn}`,
    source: BOOK_SOURCE.OPEN_LIBRARY,
    title: edition.title,
    subtitle: edition.subtitle,
    description,
    authors: authorNames,
    publishedYear: yearMatch ? Number(yearMatch[0]) : null,
    pageCount: edition.number_of_pages || null,
    isbn: canonicalIsbn,
    coverImage: edition.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-M.jpg`
      : null,
    publisher: edition.publishers?.[0],
    language,
  });
}

/**
 * نتيجة JSON-LD من عصير الكتب (aseeralkotb.com، مصدر ناشر حي) -> الموديل
 * الموحّد. التحقق الصارم (isbn == الـ ISBN-13 القانوني المطلوب حرفياً)
 * مسؤولية الاستدعاء بـ orchestration.service.js — نفس فلسفة verifyExact
 * المطبَّقة على GB/OL تماماً؛ هذه الدالة تطبّع فقط ولا تفترض تطابقاً.
 */
export function normalizeFromAseerAlKotbLive(ld, { sourceUrl } = {}) {
  const authors = Array.isArray(ld.author)
    ? ld.author.map((a) => a?.name).filter(Boolean)
    : ld.author?.name
      ? [ld.author.name]
      : null;

  return createBook({
    id: `aseeralkotb-${ld.isbn || Date.now()}`,
    source: BOOK_SOURCE.PUBLISHER_LIVE_ASEERALKOTB,
    title: ld.name,
    description: typeof ld.description === 'string' ? ld.description.replace(/<[^>]+>/g, '').trim() : '',
    isbn: ld.isbn,
    authors,
    pageCount: ld.numberOfPages ? Number(ld.numberOfPages) : null,
    publishedYear: ld.datePublished ? parseInt(String(ld.datePublished).slice(0, 4), 10) : null,
    coverImage: typeof ld.image === 'string' ? ld.image : null,
    genre: Array.isArray(ld.genre) ? ld.genre[0] : ld.genre,
    publisher: ld.publisher?.name,
    language: ld.inLanguage === 'Arabic' ? 'ar' : ld.inLanguage,
    // السعر من موقع الناشر حقيقي وبالريال (offers.priceCurrency == SAR
    // على هذا الموقع تحديداً) — لكن نتركه عرضاً فقط (لا نملأ price
    // اليدوي قصداً؛ قرار عمل: السعر يُدخله المستخدم يدوياً دائماً)
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * نتيجة JSON-LD (Product) من مركز الأدب العربي (adab-book.com، مصدر
 * ناشر حي) -> الموديل الموحّد. التحقق الصارم (sku == الـ ISBN-13
 * القانوني المطلوب حرفياً) مسؤولية orchestration.service.js — نفس فلسفة
 * verifyExact بالضبط. حارسا العنوان والمؤلف طُبِّقا مسبقاً بـ
 * adabBook.service.js (extra.titleTrusted, extra.author, extra.genre) —
 * هذه الدالة تطبّع فقط نتيجة الحراسة، ولا تعيد تطبيقها.
 */
const PUBLISHER_NAME_ADABBOOK = 'مركز الأدب العربي للنشر والتوزيع';

export function normalizeFromAdabBookLive(data, { sourceUrl, author, genre, titleTrusted } = {}) {
  // data.image رُصد كسلسلة نصية أو كمصفوفة صور (بترتيب اعتباطي) بالبيانات
  // الحية — نأخذ العنصر الأول بأي من الحالتين
  const image = Array.isArray(data.image) ? data.image[0] : data.image;
  return createBook({
    id: `adabbook-${data.sku || Date.now()}`,
    source: BOOK_SOURCE.PUBLISHER_LIVE_ADABBOOK,
    // حارس العنوان: name غير موثوق -> يبقى فاضياً بصدق بدل عنوان مشكوك فيه
    title: titleTrusted ? String(data.name || '').trim() : null,
    isbn: data.sku,
    authors: author ? [author] : null,
    coverImage: typeof image === 'string' ? image : null,
    genre,
    publisher: PUBLISHER_NAME_ADABBOOK,
    // السعر SAR فعلاً هنا لكن يبقى عرضاً فقط (قرار عمل: السعر يدوي دائماً)
    needsReview: !titleTrusted,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * نتيجة JSON-LD (Product) + حقول موسومة من دار الشروق (shoroukbookstores.com،
 * مصدر ناشر حي) -> الموديل الموحّد. التحقق الصارم (gtin13 == الـ ISBN-13
 * القانوني المطلوب حرفياً) مسؤولية orchestration.service.js — نفس فلسفة
 * verifyExact بالضبط.
 * ⚠️ قرار تصميم مؤكد بالعقد: أسعار هذا الموقع EGP وليست SAR — لا تُمرَّر
 * أبداً لـ price/priceIncludingVat هنا (تبقى null دائماً من هذا المصدر)،
 * تفادياً لتلويث حقل سعر سعودي بقيمة جنيه مصري بصمت.
 */
export function normalizeFromShoroukLive(ld, {
  sourceUrl, author, pageCount, publishedYear, genre, publisherFallback,
} = {}) {
  const image = Array.isArray(ld.image) ? ld.image[0] : ld.image;
  return createBook({
    id: `shorouk-${ld.gtin13 || ld.sku || Date.now()}`,
    source: BOOK_SOURCE.PUBLISHER_LIVE_SHOROUK,
    title: ld.name,
    description: ld.description,
    isbn: ld.gtin13 || ld.sku,
    authors: author ? [author] : null,
    pageCount,
    publishedYear,
    coverImage: typeof image === 'string' ? image : null,
    genre,
    publisher: ld.brand?.name || publisherFallback,
    // لا price/priceIncludingVat من هذا المصدر أبداً — عملة الموقع EGP
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  });
}

// ملاحظة: قيمة BOOK_SOURCE.AI_SUGGESTED وعلم isAiGenerated يبقيان بالموديل
// الموحّد لمطابقة عقد الفرونت-إند (القرار D5) — لكن لا يوجد بهذه المعمارية
// أي مصدر AI يولّد كتباً: بيانات الكتب تأتي من مصادر فهرسية موثوقة فقط.
