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

// صورة غلاف احتياطية موحّدة لكل المصادر (نفس الصورة المستخدمة سابقاً بكل مكان)
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
    // السعر يُدخل يدوياً دائماً — ما يجي من أي API أبداً
    price: toNumberOrNull(price),
    // سنة فقط، كرقم (أو null)
    publishedYear: toNumberOrNull(publishedYear),
    coverImage: coverImage || FALLBACK_COVER,
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

      // Mock: نولّد عنوان معقول من اسم الملف لحد ربط الاستخراج الحقيقي
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      resolve(
        createBook({
          source: BOOK_SOURCE.UPLOADED_FILE,
          title: cleanTitle || 'Untitled Upload',
          publishedYear: new Date().getFullYear(),
          genre: 'Uploaded',
        })
      );
    }, simulatedDelay);
  });
}

/**
 * أعمدة قالب الإكسل الرسمي لمملكة الكتب (الشيت العربي هو المرجع المعتمد،
 * والترتيب/الأسماء هنا مطابقة له حرفياً — عمود J هو "رقم الطبعة"
 * تصحيحاً للخطأ الإملائي الموجود بالقالب الأصلي "رقم الطابعة").
 */
export const EXPORT_COLUMNS = [
  'اسم الكتاب',
  'نبذة عن الكتاب',
  'رقم الباركود',
  'اسم المؤلف',
  'عدد الصفحات',
  'سعر البيع مع الضريبة',
  'تاريخ الإصدار',
  'صورة الغلاف',
  'نوع الكتاب',
  'رقم الطبعة',
];

/**
 * يحوّل كائن كتاب (بالشكل الموحّد) إلى صف جاهز لقالب الإكسل الرسمي.
 * أي مصدر بيانات — بحث، رفع ملف، أو API مستقبلي — يمر من هنا بنفس الطريقة،
 * فعملية التصدير نفسها ما تعرف ولا يهمها مصدر البيانات الأصلي.
 *
 * ملاحظات مطابقة القالب:
 *  - عمود C (ISBN) وعمود G (السنة) يُصدَّران كأرقام فعلية (numeric)، مطابقةً
 *    لتنسيق الخلايا بالقالب الأصلي — وليس كنص.
 *  - عمود J (رقم الطبعة) اختياري بالقالب — فاضي مقبول وليس خطأ.
 */
export function bookToExportRow(book) {
  return {
    'اسم الكتاب': book?.title || '—',
    'نبذة عن الكتاب': book?.description || '—',
    'رقم الباركود': book?.isbn ? toNumberOrNull(book.isbn) : null,
    'اسم المؤلف': book?.authors?.length ? book.authors.join(', ') : '—',
    'عدد الصفحات': book?.pageCount || null,
    'سعر البيع مع الضريبة': typeof book?.price === 'number' ? book.price : null,
    'تاريخ الإصدار': book?.publishedYear || null,
    'صورة الغلاف': book?.coverImage || '—',
    'نوع الكتاب': book?.genre || '—',
    'رقم الطبعة': book?.edition || '',
  };
}

/**
 * نص عنوان البانر أعلى قالب المورد الرسمي — منسوخ حرفياً (بمدّاته) من الملف
 * الحقيقي «قائمة المورد مملكة الكتب.xlsx» عشان الملف المُصدَّر يطابق شكله.
 */
const TEMPLATE_BANNER_TITLE =
  'قائـــــــــــــــــــــــــــمة المـــــــــــــــــــــــــــــــــــــــورد مملكة الكتب';

/** عروض الأعمدة A-J — منسوخة من القالب الحقيقي نفسه */
const TEMPLATE_COLUMN_WIDTHS = [29.6, 74.6, 23.5, 41.7, 14.3, 20.0, 15.5, 20.7, 26.3, 20.7];

/** صف الترويسة بالقالب الحقيقي (الصفوف 1-6 بانر مدموج، البيانات تبدأ من 8) */
const TEMPLATE_HEADER_ROW = 7;

/**
 * يبني ملف الإكسل الفعلي بذاكرة المتصفح — مطابقاً لبنية قالب المورد الرسمي:
 * شيت واحد RTL، بانر مدموج A1:J6، ترويسة بالصف 7 (بمفردات العمل المعتمدة،
 * وليس أخطاء القالب الإملائية — قرار مؤكد)، والبيانات من الصف 8.
 *
 * أنواع الخلايا (قرارات عمل مؤكدة): ISBN رقم فعلي بتنسيق '0'، الصفحات
 * والسعر أرقام، سنة الإصدار خلية تاريخ فعلية تعرض السنة فقط (yyyy)،
 * صورة الغلاف رابط قابل للنقر. القيم الغائبة تبقى خلايا فاضية فعلاً —
 * أبداً لا تُختلق. (مكتبة exceljs تُحمَّل ديناميكياً هنا فقط، عشان حجم
 * حزمة التطبيق الأساسية ما يتأثر إلا عند التصدير الفعلي.)
 */
export async function buildExportWorkbook(queue) {
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default ?? excelModule;

  const rows = queue.map(bookToExportRow);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('قائمة مورد مملكة الكتب', {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = TEMPLATE_COLUMN_WIDTHS.map((width) => ({ width }));

  // البانر المدموج أعلى القالب
  sheet.mergeCells('A1:J6');
  const banner = sheet.getCell('A1');
  banner.value = TEMPLATE_BANNER_TITLE;
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  banner.font = { bold: true, size: 20 };

  // الترويسة — بمفردات العمل المعتمدة من EXPORT_COLUMNS
  const headerRow = sheet.getRow(TEMPLATE_HEADER_ROW);
  EXPORT_COLUMNS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // عمود الباركود بتنسيق رقمي — نفس تنسيق القالب الحقيقي ('0')
  sheet.getColumn(3).numFmt = '0';

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(TEMPLATE_HEADER_ROW + 1 + rowIndex);
    EXPORT_COLUMNS.forEach((columnKey, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      const value = row[columnKey];

      // null أو '' = خلية فاضية فعلاً بالملف — القاعدة: لا اختلاق أبداً
      if (value == null || value === '') return;

      if (columnKey === 'تاريخ الإصدار') {
        // خلية تاريخ فعلية تعرض السنة فقط (UTC لتفادي انزياح اليوم بالمناطق الزمنية)
        cell.value = new Date(Date.UTC(value, 0, 1));
        cell.numFmt = 'yyyy';
      } else if (columnKey === 'صورة الغلاف' && String(value).startsWith('https://')) {
        // رابط قابل للنقر يفتح الصورة مباشرة (قرار عمل مؤكد)
        cell.value = { text: String(value), hyperlink: String(value) };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      } else {
        cell.value = value; // الأرقام تبقى أرقاماً والنصوص نصوصاً كما أنتجها bookToExportRow
      }
    });
  });

  return { workbook, rows };
}

/**
 * التصدير الفعلي لقائمة الشراء: يبني ملف .xlsx حقيقي وينزّله بالمتصفح.
 * نفس عقد الـ mock السابق تماماً — (queue) => Promise<{rows, fileName, exportedAt}>
 * ويرفض بـ EMPTY_QUEUE لو القائمة فاضية — فالمستدعي ما تغيّر إلا باسم الدالة.
 */
export async function exportQueueToExcel(queue) {
  if (!queue || queue.length === 0) {
    throw new Error('EMPTY_QUEUE');
  }

  const { workbook, rows } = await buildExportWorkbook(queue);

  const exportedAt = new Date().toISOString();
  const fileName = `قائمة المورد مملكة الكتب - ${exportedAt.slice(0, 10)}.xlsx`;

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

  return { rows, fileName, exportedAt };
}

/**
 * القائمة المحكومة لتصنيف الكتاب (نوع الكتاب) — قرار عمل مؤكد: قائمة منسدلة
 * بدل نص حر، عشان تبقى البيانات المصدَّرة متسقة بين كل الموردين.
 * التصنيف المستخرج من المصادر الخارجية (Google Books مثلاً) هو مجرد اقتراح
 * أولي وقد لا يطابق أي خيار هنا — يبقى قابل للتعديل الكامل من المستخدم دائماً.
 */
export const GENRE_OPTIONS = ['رواية', 'فلسفة', 'تطوير ذات', 'أدب', 'تاريخ', 'علوم', 'أخرى'];

/**
 * يتحقق من صحة نموذج تعديل كتاب (Draft) قبل الحفظ.
 * الفلسفة: نمنع تنسيقات غير صالحة، لكن ما نمنع سير العمل بسبب حقول فاضية
 * يديرها المستخدم يدوياً (السعر، الطبعة). يرجّع كائن أخطاء بمفاتيح رمزية
 * (مو نصوص مترجمة) عشان المكوّن هو من يقرر الترجمة المناسبة للعرض.
 *
 * القيم المتوقعة بـ draft: نصوص خام من حقول الإدخال (قبل التحويل لأنواع
 * الموديل النهائية)، عدا authors اللي ممكن يكون مصفوفة أو نص.
 */
export function validateBookDraft(draft = {}) {
  const errors = {};

  if (!draft.title || !String(draft.title).trim()) {
    errors.title = 'required';
  }

  const authorsText = Array.isArray(draft.authors)
    ? draft.authors.join(', ')
    : draft.authors || '';
  if (!authorsText.trim()) {
    errors.authors = 'required';
  }

  if (draft.isbn && !/^\d+$/.test(String(draft.isbn))) {
    errors.isbn = 'digitsOnly';
  }

  if (draft.pageCount !== '' && draft.pageCount != null) {
    const n = Number(draft.pageCount);
    if (!Number.isFinite(n) || n <= 0) errors.pageCount = 'positiveNumber';
  }

  // السعر: حقل عمل يدوي بالكامل. فاضي مقبول دائماً — فقط نتحقق من الصيغة لو أُدخل.
  if (draft.price !== '' && draft.price != null) {
    const n = Number(draft.price);
    if (!Number.isFinite(n) || n <= 0) errors.price = 'positiveNumber';
  }

  if (draft.publishedYear !== '' && draft.publishedYear != null) {
    if (!/^\d{4}$/.test(String(draft.publishedYear))) {
      errors.publishedYear = 'fourDigits';
    }
  }

  if (draft.coverImage && !String(draft.coverImage).startsWith('https://')) {
    errors.coverImage = 'httpsRequired';
  }

  return errors;
}
