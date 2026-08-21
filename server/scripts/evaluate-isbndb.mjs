/**
 * ===== المرحلة 3: تقييم ISBNdb كمصدر ثالث (تقييم فقط — ليس تكاملاً) =====
 * سكربت معزول تماماً عن خط البحث الإنتاجي: لا يستدعيه أي مسار إنتاجي،
 * ولا يعدّل أي سلوك قائم. يقارن ISBNdb ضد Google Books + Open Library
 * حقلاً-حقلاً على كتب حقيقية من قوائم الناشر، ويقيس "القيمة الإضافية":
 * الحقول التي يوفرها ISBNdb ولا يوفرها المصدران الحاليان معاً.
 *
 * التشغيل (من مجلد server):  npm run evaluate:isbndb
 * يتطلب ISBNDB_API_KEY في .env (اشتراك مدفوع — تجربة 7 أيام متاحة).
 * المفتاح لا يُطبع أبداً بأي سجل أو مخرجات.
 *
 * الالتزامات:
 *  - تحقق ISBN صارم: سجل ISBNdb يُحتسب فقط لو ISBN-13 القانوني لسجله
 *    يطابق المطلوب (لا تطابق عناوين فضفاض، لا معرّفات غير ISBN).
 *  - إيقاع ≤ 1 طلب/ثانية (حد خطة Basic الموثق) — بلا منطق إنتاجي.
 *  - جودة لا وجود: نفحص لغة النبذة، تلوث المؤلفين بالناشر، وصلاحية
 *    روابط الأغلفة فعلياً (حالة HTTP ونوع المحتوى) — رابط ≠ غلاف صحيح.
 */
import { config } from '../src/config/env.js';
import { searchGoogleBooks } from '../src/services/googleBooks.service.js';
import {
  getOpenLibraryEditionByIsbn,
  getOpenLibraryAuthorNames,
  searchOpenLibrary,
} from '../src/services/openLibrary.service.js';
import {
  normalizeFromGoogleBooks,
  normalizeFromOpenLibrary,
  normalizeFromOpenLibraryEdition,
  descriptionConsistentWithBook,
} from '../src/models/bookModel.js';
import { normalizeIsbn } from '../src/utils/isbn.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** مجموعة الاختبار — كلها كتب حقيقية بأرقام موثّقة من مراحل التحقيق السابقة */
const TEST_SET = [
  // ---- العربية: كتب قوائم الناشر والحالات المرجعية ----
  { isbn: '9786038455647', label: 'AR إنتامافوبيا (سعودي 2024) — أقوى حالة فجوة', lang: 'ar' },
  { isbn: '9789776541252', label: 'AR إيكادولي (عصير الكتب، مصر)', lang: 'ar' },
  { isbn: '9786140105232', label: 'AR ساق البامبو (ASP، بوكر)', lang: 'ar' },
  { isbn: '9789770907375', label: 'AR ثلاثية غرناطة (دار الشروق، مصر)', lang: 'ar' },
  { isbn: '9786030167616', label: 'AR خوف (مركز الأدب العربي، سعودي)', lang: 'ar' },
  { isbn: '9789770933855', label: 'AR متحف البراءة (دار الشروق)', lang: 'ar' },
  { isbn: '9789953320991', label: 'AR الرحيق المختوم (لبنان)', lang: 'ar' },
  { isbn: '9786038381427', label: 'AR لأنك الله (دار الحضارة، سعودي)', lang: 'ar' },
  { isbn: '9786144720196', label: 'AR فن اللامبالاة (دار التنوير)', lang: 'ar' },
  { isbn: '9789938886559', label: 'AR 1984 بالعربية (تونس)', lang: 'ar' },
  { isbn: '9781527330368', label: 'AR ميرامار — نجيب محفوظ (هنداوي)', lang: 'ar' },
  // ---- الإنجليزية ----
  { isbn: '9780132350884', label: 'EN Clean Code (2008)', lang: 'en' },
  { isbn: '9780135398548', label: 'EN Clean Code 2nd ed (2025) — Google-only حالياً', lang: 'en' },
  { isbn: '9780743246392', label: 'EN The Great Gatsby (Scribner 2003)', lang: 'en' },
  { isbn: '9780192832696', label: 'EN The Great Gatsby (Oxford 1998)', lang: 'en' },
  { isbn: '9781649374042', label: 'EN Fourth Wing (2023)', lang: 'en' },
  { isbn: '9780132119160', label: 'EN Mythical Man-Month (1995)', lang: 'en' },
  // دعم ISBN-10 لدى ISBNdb — نفس طبعة Clean Code برقمها القديم
  { isbn: '0132350882', label: 'EN Clean Code عبر ISBN-10 (فحص دعم 10)', lang: 'en' },
];

const FIELDS = ['title', 'subtitle', 'description', 'isbn', 'authors', 'pageCount', 'publishedYear', 'coverImage', 'publisher', 'language'];

const has = (field, v) => {
  if (field === 'authors') return Array.isArray(v) && v.length > 0 && !(v.length === 1 && v[0] === 'Unknown Author');
  if (field === 'pageCount' || field === 'publishedYear') return Number.isFinite(v) && v > 0;
  if (field === 'title') return Boolean(v) && v !== 'Untitled';
  return v != null && v !== '';
};

// ---------- استعلام المصادر الحالية (قراءة فقط عبر خدماتها القائمة) ----------
async function queryGoogle(canonical) {
  try {
    const data = await searchGoogleBooks(`isbn:${canonical}`, 3);
    const items = (data?.items || []).map((it) => normalizeFromGoogleBooks(it));
    const exact = items.find((b) => b.isbn === canonical);
    return { status: exact ? 'exact' : (items.length ? 'different-isbn' : 'no-record'), book: exact || null };
  } catch (err) {
    return { status: `error:${err.reason || err.message}`, book: null };
  }
}

async function queryOpenLibrary(normalized) {
  try {
    let edition = await getOpenLibraryEditionByIsbn(normalized.canonical13);
    if (!edition && normalized.isbn10) edition = await getOpenLibraryEditionByIsbn(normalized.isbn10);
    if (edition) {
      const authorNames = await getOpenLibraryAuthorNames(edition.authors).catch(() => []);
      return { status: 'exact', book: normalizeFromOpenLibraryEdition(edition, { canonicalIsbn: normalized.canonical13, authorNames }) };
    }
    const data = await searchOpenLibrary({ q: `isbn:${normalized.canonical13}` });
    const docs = (data?.docs || []).map((d) => normalizeFromOpenLibrary(d));
    const exact = docs.find((b) => b.isbn === normalized.canonical13);
    return { status: exact ? 'exact' : (docs.length ? 'different-isbn' : 'no-record'), book: exact || null };
  } catch (err) {
    return { status: `error:${err.reason || err.message}`, book: null };
  }
}

// ---------- استعلام ISBNdb (مباشر، بلا أي منطق إنتاجي) ----------
async function queryIsbndb(normalized) {
  const started = Date.now();
  try {
    const res = await fetch(`https://api2.isbndb.com/book/${normalized.input}`, {
      headers: { Authorization: config.isbndbApiKey },
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - started;
    const rate = {
      limit: res.headers.get('ratelimit-limit') || res.headers.get('x-ratelimit-limit'),
      remaining: res.headers.get('ratelimit-remaining') || res.headers.get('x-ratelimit-remaining'),
    };
    if (res.status === 404) return { status: 'no-record', ms, rate, book: null };
    if (res.status === 429) return { status: 'rate-limited', ms, rate, book: null };
    if (!res.ok) return { status: `http-${res.status}`, ms, rate, book: null };

    const data = await res.json();
    const b = data?.book;
    if (!b) return { status: 'empty-body', ms, rate, book: null };

    // التحقق الصارم: ISBN السجل نفسه يجب أن يطابق القانوني المطلوب
    const recordIsbn = normalizeIsbn(b.isbn13 || b.isbn || '');
    const exact = recordIsbn.valid && recordIsbn.canonical13 === normalized.canonical13;

    const year = String(b.date_published || '').match(/\d{4}/)?.[0];
    const book = {
      title: b.title || '',
      subtitle: b.title_long && b.title_long !== b.title ? b.title_long : '',
      description: b.synopsis || b.overview || '',
      isbn: recordIsbn.valid ? recordIsbn.canonical13 : '',
      authors: Array.isArray(b.authors) ? b.authors : [],
      pageCount: Number(b.pages) || 0,
      publishedYear: year ? Number(year) : null,
      coverImage: b.image || '',
      publisher: b.publisher || '',
      language: b.language || '',
      binding: b.binding || '',
      subjects: b.subjects || null,
      msrp: b.msrp ?? null,
    };
    return { status: exact ? 'exact' : 'different-isbn', ms, rate, book: exact ? book : null, rejected: exact ? null : book.title };
  } catch (err) {
    return { status: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : `network:${err.message}`, ms: Date.now() - started, book: null };
  }
}

/** فحص صلاحية رابط غلاف فعلياً: حالة/نوع/حجم — رابط ≠ صورة صحيحة تلقائياً */
async function probeCover(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const buf = await res.arrayBuffer();
    return { status: res.status, type: res.headers.get('content-type'), bytes: buf.byteLength, host: new URL(res.url).host };
  } catch (err) {
    return { status: 'error', type: err.message?.slice(0, 40) };
  }
}

// ---------- التنفيذ ----------
if (!config.isbndbApiKey) {
  console.log('⛔ EVALUATION BLOCKED: ISBNDB_API_KEY غير مضبوط في server/.env');
  console.log('   ISBNdb خدمة مدفوعة (تجربة مجانية 7 أيام): https://isbndb.com/isbn-database');
  console.log('   بعد إضافة المفتاح شغّل:  npm run evaluate:isbndb');
  // فحص خلوّ المفتاح تجريبياً: النقطة حية وترفض غير الموثق كما هو موثّق
  const res = await fetch('https://api2.isbndb.com/book/9780132350884', { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (res) await res.arrayBuffer().catch(() => {});
  console.log(`   (تحقق حي: GET /book بدون مفتاح -> ${res ? 'HTTP ' + res.status : 'network error'})`);
} else {
  await runEvaluation();
}

async function runEvaluation() {
console.log(`تقييم ISBNdb على ${TEST_SET.length} كتاباً حقيقياً — بإيقاع ≤ 1 طلب/ثانية\n`);
const rows = [];
const incremental = Object.fromEntries(FIELDS.map((f) => [f, 0]));
let isbndbTimes = [];

for (const t of TEST_SET) {
  const normalized = normalizeIsbn(t.isbn);
  if (!normalized.valid) { console.log(`SKIP invalid ${t.isbn}`); continue; }

  const [gb, ol] = [await queryGoogle(normalized.canonical13), await queryOpenLibrary(normalized)];
  const db = await queryIsbndb(normalized);
  if (typeof db.ms === 'number' && db.status !== 'timeout') isbndbTimes.push(db.ms);

  const row = { label: t.label, isbn: normalized.canonical13, gbStatus: gb.status, olStatus: ol.status, dbStatus: db.status, dbMs: db.ms, rate: db.rate, fields: {}, quality: [] };

  for (const f of FIELDS) {
    const g = gb.book ? gb.book[f] : null;
    const o = ol.book ? ol.book[f] : null;
    const d = db.book ? db.book[f] : null;
    const gHas = has(f, g);
    const oHas = has(f, o);
    const dHas = has(f, d);
    row.fields[f] = {
      google: gHas ? (f === 'description' ? String(g).slice(0, 40) + '…' : g) : null,
      openLibrary: oHas ? (f === 'description' ? String(o).slice(0, 40) + '…' : o) : null,
      isbndb: dHas ? (f === 'description' ? String(d).slice(0, 40) + '…' : d) : null,
      incremental: dHas && !gHas && !oHas,
    };
    if (row.fields[f].incremental) incremental[f]++;
  }

  // فحوص الجودة على سجل ISBNdb
  if (db.book) {
    if (db.book.description && !descriptionConsistentWithBook(db.book.description, { title: db.book.title, language: t.lang })) {
      row.quality.push(`وصف بلغة مناقضة: "${String(db.book.description).slice(0, 50)}"`);
    }
    if (db.book.publisher && db.book.authors?.some((a) => String(a).trim() === db.book.publisher.trim())) {
      row.quality.push('الناشر داخل المؤلفين');
    }
    if (db.book.coverImage) {
      row.cover = await probeCover(db.book.coverImage);
    }
  }
  if (db.rejected) row.quality.push(`سجل برقم مختلف رُفض: "${db.rejected}"`);

  console.log(JSON.stringify(row, null, 1));
  console.log('-'.repeat(70));
  await sleep(1100); // حد خطة Basic الموثق: 1 طلب/ثانية
  rows.push(row);
}

// ---------- الملخص ----------
const dbExact = rows.filter((r) => r.dbStatus === 'exact').length;
const arRows = rows.filter((r) => r.label.startsWith('AR'));
const enRows = rows.filter((r) => r.label.startsWith('EN'));
console.log('\n===== الملخص =====');
console.log(`ISBNdb exact matches: ${dbExact}/${rows.length} (AR: ${arRows.filter((r) => r.dbStatus === 'exact').length}/${arRows.length}, EN: ${enRows.filter((r) => r.dbStatus === 'exact').length}/${enRows.length})`);
console.log('القيمة الإضافية لكل حقل (ISBNdb يملك والاثنان الحاليان لا):');
for (const [f, n] of Object.entries(incremental)) if (n > 0) console.log(`  ${f}: ${n} كتاباً`);
if (isbndbTimes.length) {
  const avg = Math.round(isbndbTimes.reduce((a, b) => a + b, 0) / isbndbTimes.length);
  console.log(`زمن استجابة ISBNdb: متوسط ${avg}ms (min ${Math.min(...isbndbTimes)}, max ${Math.max(...isbndbTimes)})`);
}
console.log('أخطاء/حدود:', rows.filter((r) => !['exact', 'no-record', 'different-isbn'].includes(r.dbStatus)).map((r) => `${r.isbn}:${r.dbStatus}`).join(', ') || 'لا شيء');
}
