/**
 * الموديل الموحّد للكتاب (Unified Book Model)
 * ----------------------------------------------------------------
 * أي مصدر بيانات — Google Books، Open Library، اقتراح AI، ملف مرفوع،
 * أو أي API حقيقي يُضاف لاحقاً — لازم يمرّ من هنا قبل ما يدخل التطبيق.
 *
 * هذا الموديل يمثّل نطاق العمل الخاص بالشركة (business domain)، وليس
 * شكل استجابة Google Books. الحقول أعلى المستوى مباشرة (book.title،
 * book.isbn، ...) بدل تغليفها بـ volumeInfo، لأن التطبيق ما عاد مجرد
 * عميل لـ Google Books API — صار له حقول خاصة به (price، edition، ...).
 *
 * لإضافة مصدر جديد مستقبلاً:
 *   -> نضيف دالة normalizeFromXxx() جديدة هنا فقط
 *   -> باقي التطبيق (InstantBookLookup, BookDetailsView) ما يتغير أبداً
 */

export const BOOK_SOURCE = {
  GOOGLE_BOOKS: 'google_books',
  OPEN_LIBRARY: 'open_library',
  AI_SUGGESTED: 'ai_suggested',
  UPLOADED_FILE: 'uploaded_file',
  MANUAL: 'manual',
};

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

/** نسبة ضريبة القيمة المضافة — ثابتة 15% (قرار عمل مؤكد، بلا أي رسوم أخرى) */
export const VAT_RATE = 0.15;

/** تقريب مالي لمنزلتين عشريتين */
export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * يحسب تفاصيل الضريبة من سعر ما قبل الضريبة المُدخل يدوياً:
 * { base, vat, total } — أو null لو القيمة فاضية/غير صالحة.
 * الإجمالي = الأساس + الضريبة المقرّبة، عشان الأرقام الثلاثة المعروضة
 * تتطابق حسابياً أمام المستخدم دائماً.
 */
export function computeVatBreakdown(preVatPrice) {
  if (preVatPrice === '' || preVatPrice == null) return null;
  const base = Number(preVatPrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  const roundedBase = round2(base);
  const vat = round2(roundedBase * VAT_RATE);
  return { base: roundedBase, vat, total: round2(roundedBase + vat) };
}

/**
 * المصنع الوحيد اللي ينتج كائن "كتاب" بالشكل الموحّد النهائي.
 * كل الـ normalizers تحت تستخدم هالدالة، وأي بيانات يدوية (تعديل
 * المستخدم في شاشة المراجعة لاحقاً) لازم تمر من هنا كمان.
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
  humanIntervention = false,
  unknownAuthorLabel = 'Unknown Author',
} = {}) {
  return {
    id: id || `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    // نُبقي هذا الحقل لأن الواجهة الحالية تعتمد عليه لعرض شارة "AI"
    isAiGenerated: source === BOOK_SOURCE.AI_SUGGESTED,

    title: title || 'Untitled',
    // نبذة الكتاب — لا تُختلق أبداً. فاضية لو ما فيه مصدر موثوق يوفرها.
    description: description || '',
    // أرقام فقط دائماً (قرار عمل مؤكد) — نخزنها كنص، والتصدير يحوّلها لرقم
    isbn: digitsOnly(isbn),
    authors: authors && authors.length > 0 ? authors : [unknownAuthorLabel],
    pageCount: pageCount || 0,
    // السعر يُدخل يدوياً دائماً — ما يجي من أي API أبداً.
    // القيمة المخزنة هنا هي سعر "ما قبل الضريبة" الذي يدخله المستخدم.
    price: toNumberOrNull(price),
    // السعر النهائي شامل ضريبة 15% — محسوب آلياً دائماً، لا يُدخل يدوياً.
    // (مرحلة التصدير القادمة ستعتمد عليه لعمود "سعر البيع مع الضريبة".)
    priceIncludingVat: computeVatBreakdown(price)?.total ?? null,
    // علم "يتطلب تدخلاً بشرياً" — يفعّله المستخدم لما تكون بيانات الكتاب
    // مشكوكاً فيها وتحتاج مراجعة يدوية. يبقى مع الكتاب لمرحلة التصدير.
    humanIntervention: Boolean(humanIntervention),
    // سنة فقط، كرقم (أو null)
    publishedYear: toNumberOrNull(publishedYear),
    // غلاف حقيقي فقط — لا صورة بديلة/stock أبداً؛ المفقود يبقى '' بصدق
    // (نفس قاعدة الباك-إند في bookModel.js الخادم)
    coverImage: coverImage || '',
    // اقتراح تلقائي قابل للتعديل الكامل من المستخدم — مو قيمة نهائية موثوقة.
    // فاضي افتراضياً (مو "General") لأن نوع الكتاب أصبح قائمة منسدلة محكومة
    // بمفردات الشركة الفعلية، و"General" مو من ضمنها.
    genre: genre || '',
    // اختياري — كثير من الكتب ما توفر رقم الطبعة، وهذا متوقع وليس خطأ
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

/** اقتراح Gemini AI (عند عدم توفر نتائج حقيقية) -> Book Model الموحّد */
export function normalizeFromAI(suggestion, index) {
  return createBook({
    id: `gemini-${index}-${Date.now()}`,
    source: BOOK_SOURCE.AI_SUGGESTED,
    title: suggestion.title,
    authors: suggestion.author ? [suggestion.author] : null,
    publishedYear: suggestion.year ? parseInt(suggestion.year, 10) : null,
  });
}

/**
 * ملف مرفوع (PDF / TXT / CSV / XLSX) -> Book Model الموحّد
 * ⚠️ Mock مؤقت فقط، لحد ما يتوفر API حقيقي لاستخراج البيانات من الملف.
 * الشكل النهائي المرجَّع مطابق تماماً لنتيجة البحث، عشان شاشة
 * المراجعة والتصدير ما تفرّق بين مصدر وآخر أبداً.
 *
 * لاستبدالها بالـ API الحقيقي مستقبلاً: نفس التوقيع (file) => Promise<Book>،
 * فقط نستبدل الجسم الداخلي بطلب فعلي للسيرفر.
 */
export function parseUploadedFileMock(file) {
  return new Promise((resolve, reject) => {
    const simulatedDelay = 1100 + Math.random() * 700;

    setTimeout(() => {
      const allowedExtensions = ['pdf', 'txt', 'csv', 'xlsx'];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (!file.size || file.size === 0) {
        reject(new Error('EMPTY_FILE'));
        return;
      }
      if (!extension || !allowedExtensions.includes(extension)) {
        reject(new Error('UNSUPPORTED_FORMAT'));
        return;
      }

      // العنوان الوحيد المسموح اقتراحه: مشتق من اسم ملف المستخدم نفسه (تلميح
      // من مصدر حقيقي يراجعه المستخدم فوراً — قرار مؤكد). كل الحقول الأخرى
      // تبقى فاضية فعلاً: لا سنة ولا تصنيف ولا أي قيمة مخترعة، حسب قاعدة
      // "لا اختلاق أبداً" — المستخدم يكمّلها بشاشة المراجعة.
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      resolve(
        createBook({
          source: BOOK_SOURCE.UPLOADED_FILE,
          title: cleanTitle || 'Untitled Upload',
        })
      );
    }, simulatedDelay);
  });
}

/**
 * قوالب الإكسل الرسمية الحقيقية للمنظمة — منسوخة كما هي (بلا أي تعديل)
 * كأصول ثابتة بالتطبيق. القالبان متطابقان بنيوياً (أعمدة A-J، ترويسة
 * بالصف 7، جدول Table_1 على A7:J220، البيانات من الصف 8) ويختلفان فقط
 * بالاتجاه واسم الشيت ونص البانر والترويسات الظاهرة.
 * اختيار القالب قرار صريح من المستخدم وقت التصدير — مستقل تماماً عن
 * لغة واجهة التطبيق الحالية.
 */
export const EXPORT_TEMPLATES = {
  AR: { file: 'supplier-list-ar.xlsx', fileNamePrefix: 'قائمة المورد مملكة الكتب' },
  EN: { file: 'supplier-list-en.xlsx', fileNamePrefix: 'Supplier List' },
};

/** بنية القالب الحقيقي: ترويسة بالصف 7، البيانات من الصف 8، جدول حتى الصف 220 */
const TEMPLATE_HEADER_ROW = 7;
const TEMPLATE_DATA_START_ROW = 8;
const TEMPLATE_TABLE_LAST_ROW = 220;
const TEMPLATE_COLUMN_COUNT = 10;

/**
 * ألوان حالات المراجعة بالملف المُصدَّر (قابلة للقراءة مع نص أسود):
 *  - مراجعة بشرية (مستوى الصف كاملاً) -> أصفر
 *  - اقتراح ذكاء اصطناعي (مستوى الخلية) -> برتقالي
 *  - ناقص/غير صالح (مستوى الخلية) -> أحمر
 * الألوان وسيلة تواصل مراجعة فقط — لا تغيّر البيانات نفسها أبداً.
 */
export const HIGHLIGHT_COLORS = {
  humanReview: 'FFFFEB9C',
  aiSuggestion: 'FFFFC000',
  missingOrInvalid: 'FFFFC7CE',
};

/**
 * خريطة مفاتيح أخطاء validateBookDraft -> رقم عمود القالب (1 = A).
 * عمود J (رقم الطبعة) اختياري بقرار العمل — لا يُظلَّل أبداً لغيابه.
 */
const ERROR_KEY_TO_COLUMN = {
  title: 1,
  description: 2,
  isbn: 3,
  authors: 4,
  pageCount: 5,
  price: 6,
  publishedYear: 7,
  coverImage: 8,
  genre: 9,
};

/**
 * الأعمدة التي يوفرها اقتراح AI بسياسة السيرفر الحالية (كتب كاملة فقط:
 * عنوان + مؤلف + سنة). الإسناد الحالي على مستوى الكتاب (source) — لا يوجد
 * إسناد لكل حقل على حدة، ولا نخترع واحداً.
 */
const AI_PROVIDED_COLUMNS = [1, 4, 7];

/**
 * يحوّل لقطة كتاب من قائمة التصدير للشكل الذي تتوقعه validateBookDraft —
 * نفس أنبوب التحقق الوحيد المستخدم بشاشة المراجعة، بلا أي نظام تحقق ثانٍ.
 */
function bookToValidationDraft(book) {
  return {
    title: book?.title || '',
    description: book?.description || '',
    authors: book?.authors || '',
    isbn: book?.isbn || '',
    pageCount: book?.pageCount ? String(book.pageCount) : '',
    price: book?.price != null ? String(book.price) : '',
    publishedYear: book?.publishedYear != null ? String(book.publishedYear) : '',
    coverImage: book?.coverImage || '',
    // تسمية معتمدة قديمة (عربية/إنجليزية) تُطبَّع لمعرّفها؛ القيمة غير
    // المعتمدة تبقى كما هي فيعلّمها التحقق كقيمة غير صالحة تحتاج مراجعة
    genre: findGenreOption(book?.genre)?.id || book?.genre || '',
    edition: book?.edition || '',
  };
}

/**
 * يحوّل كائن كتاب إلى مصفوفة قيم الأعمدة A-J بترتيب القالب الحقيقي.
 * null = خلية فاضية فعلاً (القيم الغائبة لا تُملأ بأي نص بديل — التظليل
 * الأحمر هو ما يوصل الرسالة).
 *
 * عمود F هو السعر شامل ضريبة 15%: priceIncludingVat المخزّن، أو يُحسب
 * احتياطياً من price (ما قبل الضريبة) للقطات قديمة سبقت مرحلة الضريبة.
 * عمود C: رقم فعلي عند صلاحيته؛ قيمة غير رقمية (لقطة قديمة/فاسدة) تُكتب
 * نصاً كما هي حفاظاً على البيانات — والتظليل الأحمر يعلّمها.
 * عمود I (نوع الكتاب): المعرّف الداخلي الثابت يتحوّل لتسمية التصدير
 * المعتمدة حسب لغة القالب المختار (عربي/إنجليزي)؛ القيم القديمة غير
 * المعتمدة تُكتب كما هي (لا حذف) ويعلّمها التظليل الأحمر للمراجعة.
 */
export function bookToExportCells(book, templateLang = 'AR') {
  const priceIncludingVat =
    typeof book?.priceIncludingVat === 'number'
      ? book.priceIncludingVat
      : computeVatBreakdown(book?.price)?.total ?? null;

  const isbnRaw = book?.isbn || null;
  const isbnValue = isbnRaw ? (/^\d+$/.test(String(isbnRaw)) ? toNumberOrNull(isbnRaw) : String(isbnRaw)) : null;

  return [
    book?.title || null,
    book?.description || null,
    isbnValue,
    book?.authors?.length ? book.authors.join(', ') : null,
    book?.pageCount || null,
    priceIncludingVat,
    book?.publishedYear || null,
    book?.coverImage || null,
    genreLabel(book?.genre, templateLang) || null,
    book?.edition || null,
  ];
}

/**
 * exceljs يشارك كائن الستايل الواحد بين كل الخلايا المتطابقة تنسيقياً
 * بالملفات المحمَّلة — تعديل cell.fill مباشرة يلوّث خلايا أخرى بريئة.
 * الحل المعتمد: استبدال كائن الستايل بالكامل بنسخة جديدة لكل خلية.
 */
function overrideCellStyle(cell, patch) {
  cell.style = { ...cell.style, ...patch };
}

function setCellFill(cell, argb) {
  overrideCellStyle(cell, { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb } } });
}

/**
 * يملأ نسخة محمَّلة من القالب الرسمي ببيانات قائمة التصدير ويطبّق تظليل
 * حالات المراجعة. لا يلمس البانر ولا الترويسة ولا أي تنسيق موجود —
 * القالب هو مصدر الحقيقة.
 *
 * التظليل بالترتيب المعتمد:
 *  1) مراجعة بشرية -> الصف كاملاً A-J أصفر (حالة على مستوى الكتاب).
 *  2) خلايا AI (العنوان/المؤلف/السنة لكتاب مصدره AI) -> برتقالي،
 *     فقط عندما تحمل الخلية قيمة فعلاً.
 *  3) ناقص/غير صالح -> أحمر للخلية المعنية وحدها — وله الأولوية النهائية:
 *     الخلية الفاضية لا يمكن أن تكون "قيمة من AI"، والأحمر يطغى على الأصفر.
 */
export function fillExportWorkbook(workbook, queue, templateLang = 'AR') {
  const sheet = workbook.worksheets[0];

  queue.forEach((book, index) => {
    const rowNumber = TEMPLATE_DATA_START_ROW + index;
    const row = sheet.getRow(rowNumber);
    const values = bookToExportCells(book, templateLang);
    const errors = validateBookDraft(bookToValidationDraft(book));
    const isAiBook = book?.source === BOOK_SOURCE.AI_SUGGESTED || book?.isAiGenerated === true;

    values.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      if (value == null || value === '') return; // فاضية فعلاً — لا نص بديل أبداً

      if (columnIndex === 6) {
        // تاريخ الإصدار: خلية تاريخ فعلية تعرض السنة فقط — نفس تنسيق القالب.
        // (UTC لتفادي انزياح اليوم بالمناطق الزمنية؛ نضبط numFmt صراحةً
        // للصفوف الممتدة خارج نطاق تنسيق القالب الأصلي بعد الصف 220)
        cell.value = new Date(Date.UTC(Number(value), 0, 1));
        overrideCellStyle(cell, { numFmt: 'yyyy' });
      } else if (columnIndex === 2 && typeof value === 'number') {
        cell.value = value;
        overrideCellStyle(cell, { numFmt: '0' }); // نفس تنسيق عمود الباركود بالقالب
      } else if (columnIndex === 7 && String(value).startsWith('https://')) {
        // رابط غلاف قابل للنقر — نفس السلوك الحالي، بخط أزرق مسطّر
        cell.value = { text: String(value), hyperlink: String(value) };
        overrideCellStyle(cell, {
          font: { ...(cell.style.font || {}), color: { argb: 'FF0563C1' }, underline: true },
        });
      } else {
        cell.value = value;
      }
    });

    // 1) مراجعة بشرية: الصف كاملاً — حالة على مستوى الكتاب وليست خلية واحدة
    if (book?.humanIntervention === true) {
      for (let col = 1; col <= TEMPLATE_COLUMN_COUNT; col++) {
        setCellFill(row.getCell(col), HIGHLIGHT_COLORS.humanReview);
      }
    }

    // 2) خلايا AI: فقط الأعمدة التي يوفرها AI فعلاً وعندما تحمل قيمة
    if (isAiBook) {
      AI_PROVIDED_COLUMNS.forEach((col) => {
        if (values[col - 1] != null && values[col - 1] !== '') {
          setCellFill(row.getCell(col), HIGHLIGHT_COLORS.aiSuggestion);
        }
      });
    }

    // 3) ناقص/غير صالح: الخلية المعنية وحدها — يطغى على الأصفر والبرتقالي
    Object.entries(ERROR_KEY_TO_COLUMN).forEach(([errorKey, col]) => {
      if (errors[errorKey]) {
        setCellFill(row.getCell(col), HIGHLIGHT_COLORS.missingOrInvalid);
      }
    });
  });

  // لو تجاوزت القائمة سعة جدول القالب (الصفوف 8-220) نمدّ نطاق Table_1
  // ليشمل كل الصفوف — بلا كسر بنية القالب للأحجام الاعتيادية
  const lastDataRow = TEMPLATE_DATA_START_ROW + queue.length - 1;
  if (lastDataRow > TEMPLATE_TABLE_LAST_ROW && sheet.tables && sheet.tables.Table_1) {
    const model = sheet.tables.Table_1.table || sheet.tables.Table_1;
    const extendedRef = `A${TEMPLATE_HEADER_ROW}:J${lastDataRow}`;
    model.tableRef = extendedRef;
    if (model.autoFilterRef) model.autoFilterRef = extendedRef;
  }

  return workbook;
}

/**
 * يحمّل القالب الرسمي المطلوب (عربي/إنجليزي) من أصول التطبيق الثابتة
 * ويملؤه بقائمة التصدير. القالب الحقيقي هو مصدر الحقيقة — لا يُعاد بناء
 * أي جزء منه برمجياً. (مكتبة exceljs تُحمَّل ديناميكياً هنا فقط، عشان
 * حجم حزمة التطبيق الأساسية ما يتأثر إلا عند التصدير الفعلي.)
 */
export async function buildExportWorkbook(queue, templateLang = 'AR') {
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default ?? excelModule;

  const template = EXPORT_TEMPLATES[templateLang] || EXPORT_TEMPLATES.AR;
  const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const response = await fetch(`${baseUrl}templates/${template.file}`);
  if (!response.ok) {
    throw new Error('TEMPLATE_LOAD_FAILED');
  }
  const templateBuffer = await response.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  fillExportWorkbook(workbook, queue, templateLang);

  return { workbook };
}

/**
 * التصدير الفعلي لقائمة الشراء: يملأ القالب الرسمي المختار وينزّله بالمتصفح.
 * templateLang اختيار صريح من المستخدم ('AR' | 'EN') — مستقل عن لغة الواجهة.
 * يرفض بـ EMPTY_QUEUE لو القائمة فاضية، وبـ TEMPLATE_LOAD_FAILED لو تعذّر
 * تحميل ملف القالب نفسه.
 */
export async function exportQueueToExcel(queue, templateLang = 'AR') {
  if (!queue || queue.length === 0) {
    throw new Error('EMPTY_QUEUE');
  }

  const { workbook } = await buildExportWorkbook(queue, templateLang);

  const exportedAt = new Date().toISOString();
  const template = EXPORT_TEMPLATES[templateLang] || EXPORT_TEMPLATES.AR;
  const fileName = `${template.fileNamePrefix} - ${exportedAt.slice(0, 10)}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();

  // التنزيل يتطلب متصفحاً — الحارس يسمح بتشغيل نفس الدالة ببيئة Node للتحقق الآلي
  if (typeof document !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { fileName, exportedAt };
}

/**
 * القائمة المحكومة لتصنيفات مملكة الكتب (نوع الكتاب) — قرار عمل مؤكد:
 * اختيار من قائمة فقط، بلا نص حر وبلا خيار "أخرى"، لتوحيد بيانات التصنيف
 * بالتصدير ومنع القيم غير المتسقة (روايه/رواية/روايات/Novel...).
 *
 * كل تصنيف له معرّف داخلي ثابت (id) هو القيمة المخزَّنة فعلياً بالكتاب —
 * تسميات العرض العربية/الإنجليزية تسميات محكومة معتمدة، وتغيير لغة الواجهة
 * لا يغيّر البيانات المخزنة أبداً.
 *
 * التصنيف القادم من المصادر الخارجية (Google Books مثلاً) مجرد اقتراح خام:
 * إن طابق تسمية معتمدة انعكس تلقائياً على معرّفه، وإلا اعتُبر قيمة قديمة
 * غير معتمدة تحتاج مراجعة — لا تُستبدل بصمت ولا تُحذف.
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

/**
 * يبحث عن تصنيف معتمد بأي شكل مخزَّن: المعرّف الثابت، أو التسمية العربية،
 * أو التسمية الإنجليزية (لترحيل بيانات قديمة سبقت القائمة المحكومة).
 * يرجّع كائن التصنيف أو null لو القيمة غير معتمدة.
 */
export function findGenreOption(value) {
  if (!value) return null;
  const v = String(value).trim();
  return GENRE_OPTIONS.find((g) => g.id === v || g.ar === v || g.en === v) || null;
}

/**
 * تسمية العرض/التصدير لتصنيف بأي لغة — للقيم غير المعتمدة (بيانات قديمة)
 * نرجّع القيمة الخام كما هي: لا نحذف بيانات أبداً، والتحقق يعلّمها للمراجعة.
 */
export function genreLabel(value, lang = 'AR') {
  const option = findGenreOption(value);
  if (!option) return value || '';
  return lang === 'EN' ? option.en : option.ar;
}

/**
 * يتحقق من صحة نموذج تعديل كتاب (Draft) قبل الحفظ.
 * قرار عمل مؤكد: كل الحقول مطلوبة عدا "رقم الطبعة" (اختياري).
 * يرجّع كائن أخطاء بمفاتيح رمزية (مو نصوص مترجمة) عشان المكوّن هو من
 * يقرر الترجمة المناسبة للعرض — وكذلك يقرر أي المفاتيح توقف الحفظ فعلياً
 * (الحقول اليدوية) وأيها مجرد تنبيه (حقول المصدر الثابتة اللي ما يقدر
 * المستخدم يصلحها من الواجهة — علم "التدخل البشري" هو أداة معالجتها).
 *
 * القيم المتوقعة بـ draft: نصوص خام من حقول الإدخال (قبل التحويل لأنواع
 * الموديل النهائية)، عدا authors اللي ممكن يكون مصفوفة أو نص.
 */
export function validateBookDraft(draft = {}) {
  const errors = {};

  if (!draft.title || !String(draft.title).trim()) {
    errors.title = 'required';
  }

  if (!draft.description || !String(draft.description).trim()) {
    errors.description = 'required';
  }

  const authorsText = Array.isArray(draft.authors)
    ? draft.authors.join(', ')
    : draft.authors || '';
  if (!authorsText.trim()) {
    errors.authors = 'required';
  }

  if (!draft.isbn || !String(draft.isbn).trim()) {
    errors.isbn = 'required';
  } else if (!/^\d+$/.test(String(draft.isbn))) {
    errors.isbn = 'digitsOnly';
  }

  if (draft.pageCount === '' || draft.pageCount == null) {
    errors.pageCount = 'required';
  } else {
    const n = Number(draft.pageCount);
    if (!Number.isFinite(n) || n <= 0) errors.pageCount = 'positiveNumber';
  }

  // السعر (ما قبل الضريبة): يدوي ومطلوب — الضريبة والإجمالي يُحسبان آلياً منه
  if (draft.price === '' || draft.price == null) {
    errors.price = 'required';
  } else {
    const n = Number(draft.price);
    if (!Number.isFinite(n) || n <= 0) errors.price = 'positiveNumber';
  }

  if (draft.publishedYear === '' || draft.publishedYear == null) {
    errors.publishedYear = 'required';
  } else if (!/^\d{4}$/.test(String(draft.publishedYear))) {
    errors.publishedYear = 'fourDigits';
  }

  if (!draft.coverImage || !String(draft.coverImage).trim()) {
    errors.coverImage = 'required';
  } else if (!String(draft.coverImage).startsWith('https://')) {
    errors.coverImage = 'httpsRequired';
  }

  // نوع الكتاب: مطلوب ومن القائمة المحكومة GENRE_OPTIONS حصراً —
  // قيمة قديمة/حرة لا تطابق أي تصنيف معتمد = غير صالحة وتحتاج مراجعة
  if (!draft.genre || !String(draft.genre).trim()) {
    errors.genre = 'required';
  } else if (!findGenreOption(draft.genre)) {
    errors.genre = 'invalidOption';
  }

  // رقم الطبعة: الاستثناء الوحيد — اختياري ويجوز تركه فاضياً

  return errors;
}
