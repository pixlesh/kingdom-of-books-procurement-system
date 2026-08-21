/**
 * ===== كتالوج الناشرين/الموردين (Publisher Catalog) =====
 * المصدر الموثوق الأول لكتب المورد نفسه — مبني للتعدد لا لملف واحد:
 * أي مورد يسلّم قالب "قائمة المورد" الرسمي المعبأ (ترويسة بالصف 7،
 * أعمدة A-J) يُستورد لنفس المخزن مع هوية المورد واسم الملف وطابع
 * زمني للاستيراد (provenance).
 *
 * التخزين: مخزن JSON منظم على القرص (server/data/publisher-catalog.json)
 * — يبقى بعد إعادة تشغيل الخادم، بلا أي اعتماد قواعد بيانات إضافي.
 * الكتابة ذرّية (ملف مؤقت ثم rename) لتفادي التلف عند الانقطاع.
 * SQLite مؤجل عمداً: بأحجام قوائم الموردين الحالية (عشرات/مئات
 * السجلات لكل مورد) لا يضيف إلا تعقيد تبعية native بلا مكسب.
 *
 * قواعد الاستيراد المؤكدة:
 *  - ISBN يُتحقق منه checksum ويُقونن لـ ISBN-13 — الصف بغير ذلك يُرفض
 *    ويُبلَّغ عنه، ولا "يُصلَّح" أبداً.
 *  - سعر القالب شامل ضريبة 15% -> يُخزَّن priceIncludingVat ويُشتق منه
 *    price (ما قبل الضريبة) بتقريب مالي.
 *  - التصنيف الحر يمر عبر خريطة أسماء بديلة إلى معرّفات القائمة
 *    المحكومة؛ غير الممكن تطبيعه بثقة يبقى بقيمته الخام (يلتقطه مسار
 *    مراجعة التصنيفات القائم) — لا تُخترع فئة أبداً.
 *  - رابط الغلاف يبقى كما سلّمه المورد (https مباشر) — بلا أي صور بديلة.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeIsbn } from '../utils/isbn.js';
import { foldArabic, foldedTokens } from '../utils/arabicText.js';
import { findGenreOption } from '../models/bookModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CATALOG_PATH = path.join(DATA_DIR, 'publisher-catalog.json');

/** تقريب مالي لمنزلتين */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * خريطة الأسماء البديلة لتصنيفات الموردين -> معرّفات القائمة المحكومة.
 * تُدرج هنا فقط المرادفات المؤكدة (مرصودة من ملفات موردين حقيقية) —
 * أي قيمة خارجها وخارج تسميات القائمة المعتمدة تبقى خاماً للمراجعة
 * (مثال مرصود: "تربية أطفال" كتاب للكبار عن التربية، وليس كتب أطفال —
 * فلا يُطبَّع تلقائياً).
 */
const GENRE_ALIASES = {
  'رواية': 'novels',
  'روايه': 'novels',
  'روايات': 'novels',
  'رواية مترجمة': 'translated-novels',
  'روايات مترجمه': 'translated-novels',
  'قصص مترجمة': 'translated-novels',
  'تنمية ذاتية': 'self-development',
  'تطوير الذات': 'self-development',
  'ديني': 'religious-books',
  'كتب دينيه': 'religious-books',
};

export function mapSupplierGenre(raw) {
  const value = String(raw || '').trim();
  if (!value) return { genre: '', mapped: false };
  const direct = findGenreOption(value);
  if (direct) return { genre: direct.id, mapped: true };
  const alias = GENRE_ALIASES[value];
  if (alias) return { genre: alias, mapped: true };
  // غير قابل للتطبيع بثقة: تبقى القيمة الخام — مسار المراجعة الحالي يلتقطها
  return { genre: value, mapped: false };
}

// ---------- المخزن ----------
let catalogCache = null;

function loadCatalog() {
  if (catalogCache) return catalogCache;
  try {
    catalogCache = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
    if (!catalogCache.books) catalogCache = { version: 1, books: {} };
  } catch {
    catalogCache = { version: 1, books: {} };
  }
  return catalogCache;
}

function saveCatalog(catalog) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CATALOG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(catalog, null, 1), 'utf-8');
  renameSync(tmp, CATALOG_PATH);
  catalogCache = catalog;
}

/** سجل الكتالوج بالـ ISBN القانوني — أو null */
export function getCatalogRecordByIsbn(canonical13) {
  const catalog = loadCatalog();
  return catalog.books[canonical13] || null;
}

export function catalogSize() {
  return Object.keys(loadCatalog().books).length;
}

/**
 * بحث نصي بالكتالوج (مرحلة استراتيجية البحث بالعنوان/المؤلف):
 * مطابقة رمزية مطوية (تتسامح مع ة/ه، أإآ/ا، ى/ي، التشكيل...) على
 * العنوان + المؤلفين — كل كلمات الاستعلام يجب أن تظهر بالسجل.
 * كتب المورد الموثوقة تظهر بنتائج البحث اليدوي، لا بالـ ISBN فقط.
 */
export function searchCatalogByText(query, limit = 5) {
  const tokens = foldedTokens(query);
  if (tokens.length === 0) return [];
  const catalog = loadCatalog();
  const hits = [];
  for (const record of Object.values(catalog.books)) {
    const haystack = foldArabic(`${record.title} ${(record.authors || []).join(' ')}`);
    if (tokens.every((t) => haystack.includes(t))) {
      hits.push(record);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

// ---------- الاستيراد من قالب المورد الرسمي ----------
const TEMPLATE_HEADER_ROW = 7;
const TEMPLATE_FIRST_DATA_ROW = 8;

/** قيمة خلية exceljs كنص مسطّح (تتعامل مع الروابط/النص الغني) */
function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.hyperlink) return String(v.hyperlink).trim();
    if (v.text) return String(v.text).trim();
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.result != null) return String(v.result).trim();
    if (v instanceof Date) return String(v.getUTCFullYear());
  }
  return String(v).trim();
}

const toPositiveInt = (s) => {
  const n = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * يستورد ملف قالب مورد معبأ إلى الكتالوج.
 * upsert بالـ ISBN القانوني: إعادة استيراد لنفس المورد تحدّث سجلاته؛
 * تصادم بين مورديْن على نفس الرقم يُسجَّل تحذيراً ويفوز الأحدث.
 * يرجّع ملخصاً: {imported, updated, rejected: [{row, reason}], genres}
 */
export async function importSupplierWorkbook(filePath, { supplier }) {
  if (!supplier || !String(supplier).trim()) {
    throw new Error('supplier name is required for catalog import');
  }
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default ?? excelModule;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  // تحقق أن الملف فعلاً بقالب المورد الرسمي (ترويسة الصف 7)
  const headA = cellText(ws.getCell(`A${TEMPLATE_HEADER_ROW}`));
  if (!/اسم الكتاب|Book Title/i.test(headA)) {
    throw new Error(`not a supplier template: A7="${headA.slice(0, 30)}" (expected اسم الكتاب / Book Title)`);
  }

  const catalog = loadCatalog();
  const summary = {
    supplier: String(supplier).trim(),
    file: path.basename(filePath),
    imported: 0,
    updated: 0,
    rejected: [],
    genreMapping: {},
  };
  const importedAt = new Date().toISOString();

  for (let r = TEMPLATE_FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: 10 }, (_, i) => cellText(row.getCell(i + 1)));
    if (cells.every((c) => !c)) continue; // صف فاضٍ

    const [title, description, isbnRaw, authorsRaw, pagesRaw, priceInclRaw, yearRaw, coverRaw, genreRaw, editionRaw] = cells;

    // ISBN: تحقق صارم + تقنين — الصف الفاسد يُرفض ولا "يُصلَّح"
    const normalized = normalizeIsbn(isbnRaw);
    if (!normalized.valid) {
      summary.rejected.push({ row: r, reason: `invalid ISBN "${String(isbnRaw).slice(0, 20)}"`, title: title.slice(0, 30) });
      continue;
    }
    if (!title) {
      summary.rejected.push({ row: r, reason: 'missing title', isbn: normalized.canonical13 });
      continue;
    }

    const priceIncludingVat = (() => {
      const n = Number(String(priceInclRaw).replace(/[^\d.]/g, ''));
      return Number.isFinite(n) && n > 0 ? round2(n) : null;
    })();

    const yearMatch = String(yearRaw).match(/\d{4}/);
    const cover = /^https?:\/\//i.test(coverRaw) ? coverRaw : '';
    const { genre, mapped } = mapSupplierGenre(genreRaw);
    summary.genreMapping[genreRaw || '(فارغ)'] = mapped ? genre : '⚠ خام — يحتاج مراجعة';

    const record = {
      isbn13: normalized.canonical13,
      title,
      description: description || '',
      authors: authorsRaw ? authorsRaw.split(/[,،؛;]+/).map((a) => a.trim()).filter(Boolean) : [],
      pageCount: toPositiveInt(pagesRaw) || 0,
      priceIncludingVat,
      // سعر القالب شامل الضريبة (قرار عمل) -> نشتق ما قبل الضريبة 15%
      price: priceIncludingVat != null ? round2(priceIncludingVat / 1.15) : null,
      publishedYear: yearMatch ? Number(yearMatch[0]) : null,
      coverImage: cover,
      genre,
      genreRaw: genreRaw || '',
      genreMapped: mapped,
      edition: editionRaw || '',
      publisher: summary.supplier,
      supplier: summary.supplier,
      language: '',
      sourceFile: summary.file,
      importedAt,
    };

    const existing = catalog.books[record.isbn13];
    if (existing && existing.supplier !== record.supplier) {
      console.warn(`[catalog] supplier collision on ${record.isbn13}: "${existing.supplier}" -> "${record.supplier}" (newest wins)`);
    }
    if (existing) summary.updated++;
    else summary.imported++;
    catalog.books[record.isbn13] = record;
  }

  saveCatalog(catalog);
  return summary;
}
