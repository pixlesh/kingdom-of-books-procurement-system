/**
 * ⭐ منطق البحث الفعلي للمنتج — هذا الملف هو "كيف يعمل البحث" حقيقةً.
 * ----------------------------------------------------------------
 * يستعلم مصدري الكتب الموثوقين (Google Books + Open Library) بالتوازي،
 * يطبّع كل نتيجة للموديل الموحّد، ثم يدمج ويحذف التكرار.
 *
 * قاعدة العمل المؤكدة (لا تُعاد صياغتها بدون قرار عمل جديد):
 *   - بيانات الكتب تأتي من مصادر فهرسية قابلة للتحقق فقط — لا يوجد أي
 *     مصدر AI بهذه المعمارية، ولا يُختلق أي حقل أبداً.
 *   - لو رجّع المصدران صفر نتائج قابلة للاستخدام، النتيجة الصادقة هي
 *     قائمة فاضية (source: "none") — بلا أي احتياطي يخمّن.
 *
 * إضافات المرحلة 1 (موثوقية وصحة):
 *   - استعلام ISBN له مسار مخصص: تطبيع/تحقق checksum، نقطة طبعات
 *     Open Library، وتحقق صارم أن النتيجة تحمل فعلاً الـ ISBN المطلوب.
 *   - أي استعلام "يبدو ISBN" (شكل + checksum) يُوجَّه لمسار الـ ISBN
 *     حتى لو كان الفلتر All Fields — بلا حاجة لاختيار يدوي.
 *   - كاش قصير العمر لنتائج ISBN الناجحة (المسح المتكرر لنفس الباركود).
 *   - فشل المصدر يُسجَّل داخلياً بسببه الفعلي (بلا مفاتيح) بدل الصمت.
 *
 * فشل مصدر واحد ما يمنع الثاني (Promise.allSettled) — تدهور تدريجي،
 * والحالة الفعلية لكل مصدر تُبلَّغ بصراحة عبر meta بدل إخفائها.
 */

import { config } from '../config/env.js';
import { searchGoogleBooks } from './googleBooks.service.js';
import {
  searchOpenLibrary,
  getOpenLibraryEditionByIsbn,
  getOpenLibraryAuthorNames,
} from './openLibrary.service.js';
import {
  normalizeFromGoogleBooks,
  normalizeFromOpenLibrary,
  normalizeFromOpenLibraryEdition,
  normalizeFromPublisherCatalog,
} from '../models/bookModel.js';
import { getCatalogRecordByIsbn, searchCatalogByText } from './catalog.service.js';
import { lookupPublisherLiveSources } from './publisherSources/index.js';
import { normalizeIsbn, looksLikeIsbn } from '../utils/isbn.js';
import { stripArabicNoise, isArabicText, foldArabic, foldedTokens, stripAl } from '../utils/arabicText.js';

const KNOWN_FILTERS = ['All Fields', 'Title', 'Author', 'ISBN'];

/**
 * كاش نتائج الـ ISBN الناجحة فقط — Map بسيطة بلا أي اعتماد خارجي.
 * المفتاح: ISBN-13 القانوني. TTL قصير (10 دقائق) وسعة محدودة (200)،
 * والغرض الوحيد: عدم قصف المصادر بنفس الباركود أثناء المسح/الاختبار
 * المتكرر. الفشل/الفاضي لا يُخزَّن أبداً كنجاح.
 */
const ISBN_CACHE_TTL_MS = 10 * 60 * 1000;
const ISBN_CACHE_MAX_ENTRIES = 200;
const isbnCache = new Map();

function cacheGet(canonical13) {
  const entry = isbnCache.get(canonical13);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    isbnCache.delete(canonical13);
    return null;
  }
  return entry.result;
}

function cacheSet(canonical13, result) {
  if (isbnCache.size >= ISBN_CACHE_MAX_ENTRIES) {
    // أبسط إخلاء ممكن: أقدم مفتاح بترتيب الإدراج
    isbnCache.delete(isbnCache.keys().next().value);
  }
  isbnCache.set(canonical13, { result, expiresAt: Date.now() + ISBN_CACHE_TTL_MS });
}

/** تشخيص فشل مصدر بسببه الفعلي — للسجلات فقط، بلا أي URL/مفاتيح */
function logSourceFailure(sourceName, err, query) {
  const reason = err?.reason || err?.message || 'unknown error';
  console.warn(`[search] ${sourceName} failed: ${reason} (q="${String(query).slice(0, 80)}")`);
}

/**
 * حالات توفر نتيجة الـ ISBN الدقيق (المرحلة 2أ) — تمييز داخلي/سجلات فقط،
 * عقد الاستجابة الخارجي لم يتغير:
 *  - FOUND: مصدر أرجع تطابق ISBN دقيقاً موثّقاً.
 *  - NOT_FOUND: كل المصادر المستشارة أكملت بحثها بنجاح ولا أحد لديه الرقم.
 *  - SOURCE_UNAVAILABLE: تعذّر الحسم لأن مصدراً معنياً فشل (انقطاع/مهلة) —
 *    هذه الحالة لا تُخزَّن بالكاش أبداً.
 */
const AVAILABILITY = {
  FOUND: 'FOUND',
  NOT_FOUND: 'NOT_FOUND',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
};

/**
 * هل فشل المصدر عابر (يستحق محاولة استرداد)؟ 429/5xx/مهلة/خطأ شبكة = نعم.
 * 400/401/403 (طلب/مفتاح/صلاحيات) وغياب المفتاح = فشل دائم، لا استرداد.
 */
function isTransientFailure(err) {
  const reason = String(err?.reason || err?.message || '');
  if (/missing API key/i.test(reason)) return false;
  return /timeout|network error|transient|HTTP (429|5\d\d)/.test(reason);
}

/**
 * مهلة الاسترداد المؤجل (المرحلة 2أ): بعد استنفاد ميزانية المحاولات
 * الطبيعية (backoff داخلي ~1-3 ثوانٍ)، ننتظر مدة إضافية معقولة قبل
 * المحاولة الأخيرة الواحدة — الحالة الواقعية المستهدفة: عاصفة 503 لدى
 * Google تنقشع بعد لحظات (مُوثَّقة بحالة متحف البراءة 9789770933855).
 */
const RECOVERY_DELAY_MS = 2500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** نفس منطق بناء استعلام Google Books (intitle:/inauthor:) للمسارات النصية */
function buildGoogleQuery(query, filter) {
  if (filter === 'Title') return `intitle:${query}`;
  if (filter === 'Author') return `inauthor:${query}`;
  return query;
}

/** نفس منطق بناء معاملات Open Library للمسارات النصية */
function buildOpenLibraryParams(query, filter) {
  if (filter === 'Title') return { title: query };
  if (filter === 'Author') return { author: query };
  return { q: query };
}

/** مفتاح تكرار بديل عند غياب ISBN: العنوان + أول مؤلف (غير حساس لحالة الأحرف) */
function titleAuthorKey(book) {
  const title = (book.title || '').trim().toLowerCase();
  const author = (book.authors?.[0] || '').trim().toLowerCase();
  return `${title}|${author}`;
}

/**
 * ===== الدمج الحقلي (مرحلة جودة البيانات) =====
 * بدل "السجل الأول يفوز بكامله": السجلات المكررة (نفس ISBN القانوني أو
 * نفس العنوان+المؤلف) تندمج حقلاً-حقلاً — القيمة الفاضية/الصفرية لا
 * تحجب أبداً قيمة صالحة من المصدر الآخر.
 *
 * القواعد الحتمية القابلة للتفسير:
 *  - أولوية المصادر ثابتة كما كانت: Google Books أولاً (الأغنى وصفاً)،
 *    ثم Open Library — القيمة الأولى الصالحة لكل حقل تفوز.
 *  - "صالح" لكل حقل: نص غير فاضٍ؛ صفحات/سنة > 0؛ مؤلفون حقيقيون
 *    (ليس 'Unknown Author' وحده)؛ عنوان ليس 'Untitled' الافتراضي.
 *  - تعارض (قيمتان صالحتان مختلفتان): تُحفظ قيمة الأولوية الحالية كما
 *    كانت، ويُسجَّل التعارض داخلياً (سجلات السيرفر) للحقول القياسية
 *    (صفحات/سنة/ناشر) — تمهيداً لمرحلة الـ provenance، بلا أي نظام ثقة
 *    معقد الآن. (تعارض العنوان/المؤلف بين النص العربي والرومنة اللاتينية
 *    طبيعي ودائم لدى Open Library فلا يُسجَّل — ضجيج بلا فائدة.)
 */
const MERGE_FIELDS = [
  'title', 'subtitle', 'description', 'isbn', 'authors', 'pageCount',
  'publishedYear', 'coverImage', 'publisher', 'language', 'genre', 'edition',
];
const CONFLICT_LOGGED_FIELDS = new Set(['pageCount', 'publishedYear', 'publisher']);

function fieldHasValue(field, value) {
  switch (field) {
    case 'authors':
      return Array.isArray(value) && value.length > 0
        && !(value.length === 1 && value[0] === 'Unknown Author');
    case 'pageCount':
    case 'publishedYear':
      return Number.isFinite(value) && value > 0;
    case 'title':
      return Boolean(value) && value !== 'Untitled';
    default:
      return value != null && value !== '';
  }
}

/** يملأ فراغات target من incoming، ويسجّل التعارضات القياسية داخلياً */
function mergeFieldsInto(target, incoming) {
  for (const field of MERGE_FIELDS) {
    const targetHas = fieldHasValue(field, target[field]);
    const incomingHas = fieldHasValue(field, incoming[field]);
    if (!targetHas && incomingHas) {
      target[field] = incoming[field];
    } else if (targetHas && incomingHas && CONFLICT_LOGGED_FIELDS.has(field)) {
      const kept = String(target[field]).trim();
      const other = String(incoming[field]).trim();
      if (kept !== other) {
        console.warn(`[merge] conflict field=${field} kept="${kept}" (${target.source}) other="${other}" (${incoming.source}) isbn=${target.isbn || 'n/a'}`);
      }
    }
  }
}

function mergeAndDedupe(...lists) {
  const merged = [];
  const byIsbn = new Map();
  const byTitleAuthor = new Map();

  for (const book of lists.flat()) {
    const isbn = book.isbn; // مقونن مسبقاً (ISBN-13 صالح أو '') بواسطة createBook
    const taKey = titleAuthorKey(book);

    const existing = (isbn && byIsbn.get(isbn)) || byTitleAuthor.get(taKey);
    if (existing) {
      mergeFieldsInto(existing, book);
      // اكتمل ISBN السجل من الدمج -> يُفهرس به فتندمج تكراراته اللاحقة
      if (existing.isbn) byIsbn.set(existing.isbn, existing);
      continue;
    }

    const entry = { ...book };
    merged.push(entry);
    if (isbn) byIsbn.set(isbn, entry);
    byTitleAuthor.set(taKey, entry);
  }

  return merged;
}

/**
 * مسار الـ ISBN الدقيق (المرحلة 1) — للماسح ولأي استعلام يبدو ISBN:
 *  1) Google Books بـ isbn:{المدخل المطبّع} (10 يبقى 10 بحرفه X — بعض
 *     الطبعات القديمة مفهرسة به فقط؛ التحقق أدناه يقبل المكافئ 13).
 *  2) Open Library: نقطة الطبعة /isbn/ أولاً (بالقانوني 13 ثم بالـ 10
 *     الأصلي لو 404)، ثم search.json كاحتياط/طبعات بديلة.
 *  3) تحقق تطابق صارم: لا يُقبل كتاب لا يحمل الـ ISBN-13 القانوني
 *     المطلوب — مصدر يرجّع كتاباً آخر لا يُقدَّم كنتيجة ISBN دقيقة.
 */
async function searchByIsbn(normalized, meta, rawQuery) {
  const cached = cacheGet(normalized.canonical13);
  if (cached) return cached;

  // ===== كتالوج الناشرين أولاً (مرحلة الكتالوج) =====
  // كتب الموردين المستوردة من قوائمهم الرسمية هي المصدر الموثوق الأول:
  // سجل الكتالوج يتصدر ترتيب الدمج، والدمج الحقلي "يملأ الفراغ فقط" —
  // فلا تستطيع Google/Open Library الكتابة فوق أي قيمة مورد صالحة أبداً؛
  // تكمل فقط الحقول الغائبة عن سجل المورد (subtitle/language مثلاً).
  const catalogRecord = getCatalogRecordByIsbn(normalized.canonical13);
  const catalogBook = catalogRecord ? normalizeFromPublisherCatalog(catalogRecord) : null;
  if (catalogBook) {
    console.warn(`[search] publisher catalog hit: ISBN=${normalized.canonical13} supplier="${catalogRecord.supplier}"`);
  }

  const openLibraryLookup = async () => {
    // (أ) نقطة الطبعة المباشرة — القانوني 13 ثم الـ 10 الأصلي إن وُجد
    let edition = await getOpenLibraryEditionByIsbn(normalized.canonical13);
    if (!edition && normalized.isbn10) {
      edition = await getOpenLibraryEditionByIsbn(normalized.isbn10);
    }

    let editionBook = null;
    if (edition) {
      const authorNames = await getOpenLibraryAuthorNames(edition.authors).catch(() => []);
      editionBook = normalizeFromOpenLibraryEdition(edition, {
        canonicalIsbn: normalized.canonical13,
        authorNames,
      });
    }

    // (ب) احتياط search.json — لا يُستبدل، يبقى كآلية طبعات بديلة
    let searchDocs = [];
    try {
      const data = await searchOpenLibrary({ q: `isbn:${normalized.canonical13}` });
      searchDocs = data?.docs || [];
    } catch (err) {
      // فشل الاحتياط وحده لا يفشّل Open Library لو نجحت نقطة الطبعة
      if (!editionBook) throw err;
      logSourceFailure('openLibrary(search fallback)', err, rawQuery);
    }

    const searchBooks = searchDocs.map((doc) => normalizeFromOpenLibrary(doc));
    return editionBook ? [editionBook, ...searchBooks] : searchBooks;
  };

  // مصادر الناشرين الحية (سلسلة الاحتياط: كتالوج -> مصادر حية -> GB -> OL)
  // تُستعلَم بالتوازي مع GB/OL بالضبط — لا تأخير تسلسلي إضافي. مفتاح
  // publisherLiveSourcesEnabled يوقفها فوراً بلا إعادة نشر عند الحاجة.
  const [gbSettled, olSettled, publisherLiveSettled] = await Promise.allSettled([
    config.googleBooksApiKey
      ? searchGoogleBooks(`isbn:${normalized.input}`)
      : Promise.resolve(null), // مفتاح غير مضبوط -> تخطٍّ صريح، مو فشل
    openLibraryLookup(),
    config.publisherLiveSourcesEnabled
      ? lookupPublisherLiveSources(normalized.canonical13)
      : Promise.resolve({ books: [], statuses: {} }),
  ]);

  let googleBooksList = [];
  let gbTransientFailure = false;
  if (!config.googleBooksApiKey) {
    meta.googleBooks = 'skipped';
  } else if (gbSettled.status === 'rejected') {
    meta.googleBooks = 'failed';
    gbTransientFailure = isTransientFailure(gbSettled.reason);
    logSourceFailure('googleBooks', gbSettled.reason, rawQuery);
  } else {
    googleBooksList = (gbSettled.value?.items || []).map((item) => normalizeFromGoogleBooks(item));
  }

  let openLibraryList = [];
  if (olSettled.status === 'rejected') {
    meta.openLibrary = 'failed';
    logSourceFailure('openLibrary', olSettled.reason, rawQuery);
  } else {
    openLibraryList = olSettled.value;
  }

  let publisherLiveList = [];
  if (publisherLiveSettled.status === 'fulfilled') {
    publisherLiveList = publisherLiveSettled.value.books;
    meta.publisherLive = publisherLiveSettled.value.statuses;
  } else {
    // عملياً لا يحدث (lookupPublisherLiveSources لا ترفض أبداً) — احتياط دفاعي فقط
    meta.publisherLive = { error: 'unexpected failure' };
    logSourceFailure('publisherLiveSources', publisherLiveSettled.reason, rawQuery);
  }

  // التحقق الصارم: نتيجة ISBN دقيقة = تحمل الـ ISBN القانوني المطلوب فعلاً.
  // ترتيب الدمج (سلسلة الاحتياط المعتمدة): كتالوج المورد أولاً (موثوق، لا
  // يُكتب فوقه) ثم مصادر الناشرين الحية (موثوقة لملء الفراغ فقط) ثم
  // Google ثم OL — كل طبقة تملأ فقط ما تركته الطبقة الأسبق فاضياً
  const catalogList = catalogBook ? [catalogBook] : [];
  const verifyExact = (lists) =>
    mergeAndDedupe(...lists).filter((book) => book.isbn === normalized.canonical13);
  let verified = verifyExact([catalogList, publisherLiveList, googleBooksList, openLibraryList]);

  // ---- استرداد الـ ISBN الدقيق (المرحلة 2أ) ----
  // فقط عندما: فشل Google عابراً + Open Library أكملت بنجاح بلا تطابق.
  // محاولة واحدة إضافية مؤجلة بعد استنفاد الميزانية الطبيعية — الحالة
  // الواقعية: انقطاع Google لحظي وOL لا تملك الكتاب أصلاً. لا حلقة
  // لا نهائية، ولا استرداد لفشل دائم (400/401/403/مفتاح)، ولا أي أثر
  // على البحث النصي أو على البحث الناجح العادي.
  if (
    verified.length === 0 &&
    gbTransientFailure &&
    meta.openLibrary !== 'failed'
  ) {
    console.warn(`[search] googleBooks recovery scheduled: ISBN=${normalized.canonical13} (delay=${RECOVERY_DELAY_MS}ms, one attempt)`);
    await sleep(RECOVERY_DELAY_MS);
    try {
      const data = await searchGoogleBooks(`isbn:${normalized.input}`, 12, { retries: 0 });
      googleBooksList = (data?.items || []).map((item) => normalizeFromGoogleBooks(item));
      meta.googleBooks = 'ok'; // المصدر أجاب فعلاً هذه المرة — إجابة حاسمة
      gbTransientFailure = false;
      verified = verifyExact([catalogList, publisherLiveList, googleBooksList, openLibraryList]);
      console.warn(`[search] googleBooks recovery ${verified.length > 0 ? 'succeeded' : 'returned no exact match'}: ISBN=${normalized.canonical13}`);
    } catch (err) {
      console.warn(`[search] googleBooks recovery failed: ${err?.reason || err?.message} (ISBN=${normalized.canonical13})`);
    }
  }

  meta.counts = {
    googleBooks: googleBooksList.length,
    openLibrary: openLibraryList.length,
    publisherLive: publisherLiveList.length,
    merged: verified.length,
  };

  // تمييز داخلي (بلا تغيير للعقد الخارجي): وجدنا / غير موجود بشكل حاسم /
  // تعذّر الحسم لفشل مصدر — الأخيرة لا تُخزَّن بالكاش أبداً
  const anySourceFailed = meta.googleBooks === 'failed' || meta.openLibrary === 'failed';
  const availability = verified.length > 0
    ? AVAILABILITY.FOUND
    : anySourceFailed
      ? AVAILABILITY.SOURCE_UNAVAILABLE
      : AVAILABILITY.NOT_FOUND;
  console.warn(`[search] isbn=${normalized.canonical13} availability=${availability} (gb=${meta.googleBooks}, ol=${meta.openLibrary})`);

  const result = verified.length > 0
    ? { books: verified, source: 'merged', meta }
    : { books: [], source: 'none', meta };

  // نجاح موثّق فقط يدخل الكاش — الفشل/الفاضي/تعذّر الحسم لا يُخزَّن أبداً
  if (availability === AVAILABILITY.FOUND && !anySourceFailed) {
    cacheSet(normalized.canonical13, result);
  }

  return result;
}

/**
 * ===== استراتيجية البحث بالعنوان/المؤلف (مرحلة البحث النصي) =====
 * مبنية على أدلة التحقيق: الاستعلام العربي المركّب "عنوان + مؤلف" كسلسلة
 * واحدة يغرق بضجيج صلة لدى Google ويرجع صفراً لدى Open Library، بينما
 * التقسيم intitle:/inauthor: يصيب الهدف (حالة "خوف أسامة المسلم" المرصودة).
 *
 * التصميم — محدود وحتمي، بلا أي مساس بمسار الـ ISBN الصارم:
 *  1) أشكال استعلام متوازية محدودة لكل مصدر (الشكل الأساسي بميزانية
 *     المحاولات الكاملة؛ الأشكال المساعدة بمحاولة إعادة واحدة فقط).
 *  2) تنظيف عربي آمن للاستعلام (تشكيل/تطويل/علامات اتجاه) كشكل إضافي.
 *  3) كتب كتالوج الموردين تشارك بالبحث النصي (مطابقة مطوية) وتتصدر.
 *  4) ترتيب حتمي مُعلَّل: تطابق العنوان/المؤلف المطوي + تطابق لغة
 *     الاستعلام + اكتمال البيانات − عقوبة "ملخص/Summary" − سنة مستقبلية.
 */

/** أشكال استعلامات Google المحدودة لهذا البحث (الأساسي أولاً) */
function buildGoogleQueryShapes(query, filter) {
  const shapes = [buildGoogleQuery(query, filter)];
  const cleaned = stripArabicNoise(query);
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  if (filter === 'Title') {
    shapes.push(query); // احتياط نص حر — حالة العنوان الفرعي الكامل المرصودة
  } else if (filter === 'All Fields' && tokens.length >= 2) {
    shapes.push(`intitle:${cleaned}`);
    if (tokens.length >= 3) {
      // تقسيم "عنوان قصير + اسم مؤلف": الحالة العربية المرصودة الأهم.
      // دليل ميداني: فهرس Google لا يطابق "ال" التعريف بأسماء المؤلفين
      // (inauthor:المسلم = صفر بينما inauthor:مسلم يصيب) — فنضيف شكلاً
      // منزوع الأداة من كلمات المؤلف.
      const authorTokens = tokens.slice(1);
      shapes.push(`intitle:${tokens[0]} inauthor:${authorTokens.join(' ')}`);
      const stripped = authorTokens.map(stripAl);
      if (stripped.join(' ') !== authorTokens.join(' ')) {
        shapes.push(`intitle:${tokens[0]} inauthor:${stripped.join(' ')}`);
      }
      if (tokens.length >= 4) {
        shapes.push(`intitle:${tokens.slice(0, 2).join(' ')} inauthor:${tokens.slice(2).map(stripAl).join(' ')}`);
      }
    }
  }
  if (cleaned !== query.trim() && !shapes.includes(cleaned)) shapes.push(cleaned);
  return [...new Set(shapes)].slice(0, 5); // سقف صارم: 5 أشكال (المساعدة بمحاولة واحدة)
}

/** أشكال معاملات Open Library (الأساسي أولاً + احتياط q عام) */
function buildOpenLibraryParamShapes(query, filter) {
  const shapes = [buildOpenLibraryParams(query, filter)];
  const cleaned = stripArabicNoise(query);
  if (filter !== 'All Fields') shapes.push({ q: query }); // احتياط عام
  if (cleaned !== query.trim()) shapes.push({ q: cleaned });
  return shapes.slice(0, 3);
}

/** درجة ترتيب حتمية قابلة للتفسير — أعلى = أصلح كنتيجة أولى */
function rankScore(book, queryTokens, queryIsArabic) {
  let score = 0;

  const titleHay = foldArabic(`${book.title} ${book.subtitle || ''}`);
  const authorHay = foldArabic((book.authors || []).join(' '));
  // مطابقة متسامحة مع أداة التعريف: "المسلم" تطابق "مسلم" والعكس
  const hitsIn = (hay, t) => hay.includes(t) || (stripAl(t) !== t && hay.includes(stripAl(t)));
  let titleHits = 0;
  let authorHits = 0;
  for (const t of queryTokens) {
    if (hitsIn(titleHay, t)) titleHits++;
    else if (hitsIn(authorHay, t)) authorHits++;
  }
  const total = queryTokens.length || 1;
  score += (titleHits / total) * 40;
  score += (authorHits / total) * 25;
  if ((titleHits + authorHits) === total) score += 10; // كل الكلمات وُجدت

  // نمط "عنوان قصير + مؤلف": الاستعلام يحتوي عنوان الكتاب كاملاً -> دفعة قوية
  const pureTitle = foldArabic(book.title);
  const queryFold = foldArabic(queryTokens.join(' '));
  if (pureTitle.length >= 3 && queryFold.includes(pureTitle)) score += 20;

  // تطابق لغة الاستعلام مع لغة السجل/نصه
  const bookIsArabic = ['ar', 'ara'].includes(book.language) || isArabicText(book.title);
  if (queryIsArabic === bookIsArabic) score += 8;

  // اكتمال البيانات (يخدم هدف المنتج: سجل قابل للاعتماد)
  if (book.isbn) score += 6;
  if (book.description) score += 4;
  if (book.coverImage) score += 4;
  if (book.pageCount > 0) score += 2;

  // كتب كتالوج الموردين موثوقة — تتصدر عند التطابق
  if (book.source === 'publisher_catalog') score += 25;

  // عقوبات الضجيج المرصود: ملخصات/دراسات مستنسخة (بالعنوان أو العنوان
  // الفرعي — حالة "Summary" المرصودة عنوانها الفرعي هو الحامل)، وتواريخ مستقبلية
  const junkHay = `${book.title} ${book.subtitle || ''}`;
  if (/ملخص|خلاصة كتاب|\bsummary\b|\banalysis of\b|study guide|workbook for/i.test(junkHay)) score -= 30;
  if (book.publishedYear && book.publishedYear > new Date().getFullYear() + 1) score -= 10;

  return score;
}

async function searchByText(query, filter, meta) {
  const queryIsArabic = isArabicText(query);
  const queryTokens = foldedTokens(query);

  const gbShapes = config.googleBooksApiKey ? buildGoogleQueryShapes(query, filter) : [];
  const olShapes = buildOpenLibraryParamShapes(query, filter);

  const [gbSettledList, olSettledList] = await Promise.all([
    Promise.allSettled(
      gbShapes.map((shape, i) =>
        // الشكل الأساسي بالميزانية الكاملة؛ المساعدة بمحاولة واحدة إضافية
        searchGoogleBooks(shape, 12, i === 0 ? {} : { retries: 1 })
      )
    ),
    Promise.allSettled(olShapes.map((params) => searchOpenLibrary(params))),
  ]);

  // مصدر يُعد ناجحاً لو أجاب أي شكل من أشكاله — والفشل الكامل يُسجَّل بسببه
  let googleBooksList = [];
  if (!config.googleBooksApiKey) {
    meta.googleBooks = 'skipped';
  } else if (gbSettledList.every((s) => s.status === 'rejected')) {
    meta.googleBooks = 'failed';
    logSourceFailure('googleBooks', gbSettledList[0].reason, query);
  } else {
    for (const s of gbSettledList) {
      if (s.status === 'fulfilled') {
        googleBooksList.push(...(s.value?.items || []).map((item) => normalizeFromGoogleBooks(item)));
      }
    }
  }

  let openLibraryList = [];
  if (olSettledList.every((s) => s.status === 'rejected')) {
    meta.openLibrary = 'failed';
    logSourceFailure('openLibrary', olSettledList[0].reason, query);
  } else {
    for (const s of olSettledList) {
      if (s.status === 'fulfilled') {
        openLibraryList.push(...(s.value?.docs || []).map((doc) => normalizeFromOpenLibrary(doc)));
      }
    }
  }

  // كتب الكتالوج الموثوقة تشارك بالبحث النصي وتتقدم ترتيب الدمج
  const catalogHits = searchCatalogByText(query).map((r) => normalizeFromPublisherCatalog(r));

  const mergedAll = mergeAndDedupe(catalogHits, googleBooksList, openLibraryList);
  const books = mergedAll
    .map((book, index) => ({ book, index, score: rankScore(book, queryTokens, queryIsArabic) }))
    .sort((a, b) => b.score - a.score || a.index - b.index) // حتمي: الدرجة ثم ترتيب الوصول
    .slice(0, 12)
    .map((entry) => entry.book);

  meta.counts = {
    googleBooks: googleBooksList.length,
    openLibrary: openLibraryList.length,
    merged: books.length,
  };

  return books.length > 0
    ? { books, source: 'merged', meta }
    : { books: [], source: 'none', meta };
}

/**
 * نقطة الدخول الوحيدة للبحث الموحّد — GET /api/search تنتهي هنا.
 * ترجع دائماً { books, source: 'merged'|'none', meta } حيث books
 * كائنات مطبّعة بالكامل، جاهزة للعرض بدون أي معالجة إضافية بالفرونت-إند.
 */
export async function searchBooks(rawQuery, rawFilter) {
  const query = String(rawQuery || '').trim();
  const filter = KNOWN_FILTERS.includes(rawFilter) ? rawFilter : 'All Fields';

  const meta = {
    googleBooks: 'ok',
    openLibrary: 'ok',
    counts: { googleBooks: 0, openLibrary: 0, merged: 0 },
  };

  // مسار الـ ISBN: فلتر ISBN صراحةً، أو أي استعلام يبدو ISBN (شكل +
  // checksum) حتى بفلتر All Fields — الماسح واللصق اليدوي سواء
  if (filter === 'ISBN' || looksLikeIsbn(query)) {
    const normalized = normalizeIsbn(query);
    if (normalized.valid) {
      return searchByIsbn(normalized, meta, query);
    }
    if (filter === 'ISBN') {
      // ISBN مطلوب صراحةً لكنه فاشل الـ checksum: لا يُوثَق كمعرّف ولا
      // "يُصلَّح" — نتيجة فاضية صادقة بدل بحث نصي يرجّع كتباً غير معنية
      console.warn(`[search] rejected invalid ISBN (checksum failed): "${query.slice(0, 40)}"`);
      return { books: [], source: 'none', meta };
    }
    // All Fields بقيمة تشبه الرقم لكنها ليست ISBN صالحاً -> بحث نصي عادي
  }

  return searchByText(query, filter, meta);
}
