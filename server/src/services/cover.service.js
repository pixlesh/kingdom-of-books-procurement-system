/**
 * ===== خدمة الأغلفة الدائمة (Cover Ingestion) =====
 * تحوّل رابط غلاف خارجي (من قائمة مورد/كتالوج) إلى ملف صورة حقيقي محفوظ
 * محلياً تحت server/data/covers/ ويُخدَم عبر GET /covers/<file>.
 *
 * القواعد المؤكدة (قرار المستخدم 2026-08-20):
 *  - يُقبل فقط رد صورة حقيقي (image/* + magic bytes) — صفحات HTML تُرفض
 *    بتصنيف صريح (page_not_image) ولا تُخزَّن أبداً.
 *  - الروابط الموقعة المنتهية تُرفض قبل الجلب (expired_signed).
 *  - رابط المصدر الأصلي يُحفظ دائماً في coverOriginalUrl (provenance).
 *  - لا صور بديلة/stock أبداً — الفشل يترك السجل كما هو ويسجَّل السبب.
 *  - لا يُعاد تنزيل غلاف محلي سليم إلا بـ force أو تغيُّر رابط المصدر.
 *  - محلّلات الصفحات (resolvers) قائمة مسموحة صريحة لكل مضيف — ليست
 *    scraper عاماً: ibb.co (og:image) وkingdomofbook.com (متجرنا نحن —
 *    صفحة المنتج تُصدر رابط تخزين موقّعاً جديداً يُنزَّل فوراً).
 *  - سلوك أغلفة Google Books/Open Library وقت البحث لا يتغير إطلاقاً.
 */

import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const COVERS_DIR = path.resolve(__dirname, '../../data/covers');

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 5 * 1024;
const MIN_SHORT_SIDE = 150;

/** جلب بسيط بمهلة — الأغلفة ليست مسار بحث حرج فلا حاجة لميزانية retry الكاملة */
async function fetchWithTimeout(url, accept = 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'KingdomOfBooks-CoverIngest/1.0', Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** فحص انتهاء توقيع AWS (X-Amz-Date + X-Amz-Expires) — يشمل الرابط الداخلي في _next/image?url= */
export function signedUrlExpiry(rawUrl) {
  try {
    const candidates = [rawUrl];
    const u = new URL(rawUrl);
    const inner = u.searchParams.get('url');
    if (inner) candidates.push(inner);
    for (const c of candidates) {
      const cu = new URL(c, 'https://x/');
      const date = cu.searchParams.get('X-Amz-Date');
      const expires = cu.searchParams.get('X-Amz-Expires');
      if (date && expires) {
        const m = date.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!m) continue;
        const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        const expiresAt = signedAt + Number(expires) * 1000;
        return { signed: true, expiresAt, expired: Date.now() > expiresAt };
      }
    }
  } catch { /* رابط غير قابل للتحليل — يمر لفحوصات لاحقة */ }
  return { signed: false, expired: false };
}

// ---------- التعرف على نوع الصورة وأبعادها من البايتات (لا ثقة بالـ Content-Type وحده) ----------
export function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', ...jpegDims(buf) };
  }
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 4) === 'GIF8') {
    return { ext: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') return { ext: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { ext: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8X') {
      return {
        ext: 'webp',
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
    return { ext: 'webp', width: null, height: null };
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(buf.toString('ascii', 8, 12))) {
    // AVIF: تحليل الأبعاد يتطلب مفكك ISOBMFF — نقبل بالنوع فقط بلا فحص أبعاد
    return { ext: 'avif', width: null, height: null };
  }
  return null;
}

function jpegDims(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: null, height: null };
}

// ---------- محلّلات الصفحات المسموحة (قائمة صريحة — ليست scraper عاماً) ----------

/** ibb.co: رابط صفحة معرض — الصورة المباشرة في og:image (يُسجَّل resolvedFrom) */
async function resolveIbb(url) {
  const res = await fetchWithTimeout(url, 'text/html');
  if (!res.ok) return { error: `ibb page HTTP ${res.status}` };
  const html = await res.text();
  const m = html.match(/property="og:image"\s+content="([^"]+)"/) || html.match(/name="twitter:image"\s+content="([^"]+)"/);
  if (!m) return { error: 'ibb page has no og:image' };
  return { resolvedUrl: m[1], resolvedFrom: url };
}

/**
 * kingdomofbook.com: الروابط المخزنة تلف عبر ‎_next/image‎ حول رابط S3 موقّع
 * ينتهي خلال 12 ساعة — لا يُحيا الرابط القديم أبداً؛ الحل المعتمد: صفحة
 * المنتج بمتجرنا تُصدر JSON-LD فيه رابطاً موقعاً جديداً يُنزَّل فوراً.
 * يتطلب خريطة isbn→صفحة تُبنى مرة عبر sitemap (انظر buildKobIsbnMap).
 */
function makeKobResolver(isbnToImage) {
  return async (url, { isbn13 } = {}) => {
    const fresh = isbn13 && isbnToImage.get(isbn13);
    if (!fresh) return { error: `no fresh kingdomofbook image found for ${isbn13 || '(no isbn)'}` };
    return { resolvedUrl: fresh.image, resolvedFrom: fresh.page };
  };
}

/**
 * يبني خريطة isbn→{page, image} من متجر kingdomofbook.com (متجرنا):
 * sitemap → صفحات ‎/book/{id}‎ تنازلياً → JSON-LD @type=Book.
 * يتوقف مبكراً عند إيجاد كل الأرقام المطلوبة. throttled (دفعات صغيرة + مهلة).
 */
export async function buildKobIsbnMap(targetIsbns, { onProgress } = {}) {
  const wanted = new Set(targetIsbns);
  const found = new Map();
  const smRes = await fetchWithTimeout('https://kingdomofbook.com/sitemap.xml', 'application/xml,text/xml');
  if (!smRes.ok) throw new Error(`kingdomofbook sitemap HTTP ${smRes.status}`);
  const xml = await smRes.text();
  const ids = [...xml.matchAll(/<loc>https:\/\/kingdomofbook\.com\/book\/(\d+)<\/loc>/g)]
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a);
  const BATCH = 4;
  for (let i = 0; i < ids.length && wanted.size > 0; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (id) => {
      if (wanted.size === 0) return;
      try {
        const page = `https://kingdomofbook.com/book/${id}`;
        const res = await fetchWithTimeout(page, 'text/html');
        if (!res.ok) return;
        const html = await res.text();
        for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
          try {
            const ld = JSON.parse(m[1]);
            if (ld['@type'] === 'Book' && ld.isbn && wanted.has(String(ld.isbn).trim())) {
              const isbn = String(ld.isbn).trim();
              found.set(isbn, { page, image: Array.isArray(ld.image) ? ld.image[0] : ld.image });
              wanted.delete(isbn);
            }
          } catch { /* ld+json غير صالح — تجاهل */ }
        }
      } catch { /* صفحة فاشلة — تجاهل */ }
    }));
    if (onProgress) onProgress({ scanned: Math.min(i + BATCH, ids.length), total: ids.length, found: found.size });
    await new Promise((r) => setTimeout(r, 150));
  }
  return found;
}

/** سجل المحلّلات: مضيف → دالة. الإضافة هنا فقط — لا استنتاج عام. */
export function buildResolverRegistry({ kobIsbnMap } = {}) {
  const registry = new Map();
  registry.set('ibb.co', resolveIbb);
  if (kobIsbnMap) registry.set('kingdomofbook.com', makeKobResolver(kobIsbnMap));
  return registry;
}

// ---------- التحقق والجلب والتخزين ----------

/** يجلب الرابط ويتحقق أنه صورة حقيقية ويرجّع البايتات + البيانات الوصفية */
export async function validateAndFetchImage(url) {
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    return { status: err.name === 'AbortError' ? 'timeout' : 'http_error', detail: String(err.message || err).slice(0, 120) };
  }
  if (!res.ok) return { status: 'http_error', httpStatus: res.status };
  const contentType = res.headers.get('content-type') || '';
  if (/text\/html/i.test(contentType)) return { status: 'page_not_image', httpStatus: res.status, contentType };
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) return { status: 'not_image', detail: `too large (${ab.byteLength} bytes)` };
  const buf = Buffer.from(ab);
  const sniffed = sniffImage(buf);
  if (!sniffed) return { status: 'not_image', httpStatus: res.status, contentType };
  if (buf.length < MIN_BYTES) return { status: 'too_small', detail: `${buf.length} bytes` };
  const shortSide = sniffed.width != null && sniffed.height != null ? Math.min(sniffed.width, sniffed.height) : null;
  if (shortSide != null && shortSide < MIN_SHORT_SIDE) {
    return { status: 'too_small', detail: `${sniffed.width}x${sniffed.height}` };
  }
  return { status: 'ok', buf, ext: sniffed.ext, width: sniffed.width, height: sniffed.height, httpStatus: res.status, contentType };
}

/** يخزّن البايتات باسم ‎<isbn13>-<hash8>.<ext>‎ (كتابة ذرّية) ويرجّع اسم الملف والبصمة */
export function storeCoverFile(isbn13, buf, ext) {
  mkdirSync(COVERS_DIR, { recursive: true });
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const file = `${isbn13}-${sha256.slice(0, 8)}.${ext}`;
  const target = path.join(COVERS_DIR, file);
  if (!existsSync(target)) {
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, target);
  }
  return { file, sha256 };
}

/** غلاف محلي سليم؟ (الملف موجود وبصمته تطابق اسمه) */
export function localCoverIsValid(coverFile) {
  if (!coverFile) return false;
  const target = path.join(COVERS_DIR, coverFile);
  if (!existsSync(target)) return false;
  const m = coverFile.match(/-([0-9a-f]{8})\.\w+$/);
  if (!m) return false;
  const sha = createHash('sha256').update(readFileSync(target)).digest('hex');
  return sha.startsWith(m[1]);
}

/**
 * الاستيعاب الكامل لغلاف سجل واحد — عام لأي مورد (لا منطق خاصاً بدار بعينها
 * خارج سجل المحلّلات). يرجّع {status, patch?} ولا يلمس السجل بنفسه.
 * الفشل لا يمسح قيمة موجودة أبداً — القرار للمستدعي عبر patch فقط.
 */
export async function ingestCover({ isbn13, url, existingCoverFile, existingOriginalUrl, force = false, resolvers = new Map(), serveBase }) {
  if (!url || !/^https:\/\//i.test(url)) return { status: url ? 'not_https' : 'empty' };

  if (!force && localCoverIsValid(existingCoverFile) && existingOriginalUrl === url) {
    return { status: 'skipped_existing' };
  }

  const expiry = signedUrlExpiry(url);
  let fetchUrl = url;
  let resolvedFrom = null;

  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const resolver = resolvers.get(host);
  if (resolver) {
    const r = await resolver(url, { isbn13 });
    if (r.error) return { status: 'resolver_failed', detail: r.error };
    fetchUrl = r.resolvedUrl;
    resolvedFrom = r.resolvedFrom;
  } else if (expiry.expired) {
    // موقّع ومنتهٍ وبلا محلّل لمضيفه — رفض نظيف بلا محاولة إحياء
    return { status: 'expired_signed', detail: `expired ${new Date(expiry.expiresAt).toISOString()}` };
  }

  const v = await validateAndFetchImage(fetchUrl);
  if (v.status !== 'ok') return { status: v.status, detail: v.detail, httpStatus: v.httpStatus, contentType: v.contentType };

  const { file, sha256 } = storeCoverFile(isbn13, v.buf, v.ext);
  return {
    status: 'ok',
    patch: {
      coverImage: `${serveBase}/covers/${file}`,
      coverFile: file,
      coverOriginalUrl: url,
      coverIngest: {
        status: 'ok',
        ...(resolvedFrom ? { resolvedFrom, fetchedUrl: fetchUrl } : {}),
        fetchedAt: new Date().toISOString(),
        httpStatus: v.httpStatus,
        contentType: v.contentType,
        bytes: v.buf.length,
        width: v.width,
        height: v.height,
        sha256,
      },
    },
  };
}
