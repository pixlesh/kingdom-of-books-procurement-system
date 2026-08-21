/**
 * ===== CLI استيعاب الأغلفة الدائم =====
 * تشغيل من مجلد server:
 *   npm run covers:ingest                 ← dry-run (تقرير فقط، لا كتابة)
 *   npm run covers:ingest -- --execute    ← تنفيذ فعلي (نسخة احتياطية + كتابة ذرّية)
 *   خيارات: --refresh (إعادة تنزيل حتى للمحلي السليم) --only isbn1,isbn2
 *
 * لا يغيّر إلا حقول الغلاف في سجلات الكتالوج التي نجح استيعابها —
 * الفشل يترك السجل كما هو تماماً مع الإبلاغ. لا صور بديلة أبداً.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ingestCover, buildResolverRegistry, buildKobIsbnMap, signedUrlExpiry, localCoverIsValid, COVERS_DIR,
} from '../src/services/cover.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const CATALOG_PATH = path.join(DATA_DIR, 'publisher-catalog.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SERVE_BASE = process.env.COVER_SERVE_BASE || `http://localhost:${process.env.PORT || 3001}`;

const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--refresh');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((process.argv[process.argv.indexOf(onlyArg) + 1] || onlyArg.split('=')[1] || '').split(',').filter(Boolean)) : null;

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
const books = catalog.books;

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ---------- التخطيط ----------
const plan = [];
for (const [isbn, rec] of Object.entries(books)) {
  if (ONLY && !ONLY.has(isbn)) continue;
  const url = rec.coverImage || '';
  let kind;
  if (!FORCE && localCoverIsValid(rec.coverFile) && rec.coverOriginalUrl === url) kind = 'skip_existing_local';
  else if (!url) kind = 'empty';
  else if (!/^https:\/\//i.test(url)) kind = 'not_https';
  else if (hostOf(url) === 'ibb.co') kind = 'resolve_ibb';
  else if (hostOf(url) === 'kingdomofbook.com') kind = 'kob_refresh';
  else if (signedUrlExpiry(url).expired) kind = 'expired_signed_no_resolver';
  else kind = 'direct';
  plan.push({ isbn, title: rec.title, publisher: rec.publisher, url, kind });
}

const byKind = {};
for (const p of plan) byKind[p.kind] = (byKind[p.kind] || 0) + 1;

console.log('=== covers-ingest plan ===');
console.log(`catalog records: ${Object.keys(books).length} | in scope: ${plan.length}`);
console.log(JSON.stringify(byKind, null, 1));

// ---------- dry-run: فحص خفيف للروابط المباشرة (HEAD) لتقدير الصلاحية والحجم ----------
if (!EXECUTE) {
  const directs = plan.filter((p) => p.kind === 'direct');
  let knownBytes = 0; let unknownCount = 0; let headOk = 0; let headBad = [];
  const BATCH = 6;
  for (let i = 0; i < directs.length; i += BATCH) {
    await Promise.all(directs.slice(i, i + BATCH).map(async (p) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let res = await fetch(p.url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        if (!res.ok || !res.headers.get('content-type')) {
          res = await fetch(p.url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { Range: 'bytes=0-0' } });
        }
        clearTimeout(timer);
        const ct = res.headers.get('content-type') || '';
        const range = res.headers.get('content-range');
        const len = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') || 0);
        p.probe = { status: res.status, contentType: ct, bytes: len || null };
        if ((res.status === 200 || res.status === 206) && /^image\//i.test(ct)) {
          headOk++;
          if (len) knownBytes += len; else unknownCount++;
        } else {
          headBad.push({ isbn: p.isbn, title: p.title.slice(0, 25), status: res.status, contentType: ct.slice(0, 30) });
        }
      } catch (e) {
        p.probe = { error: String(e.message || e).slice(0, 60) };
        headBad.push({ isbn: p.isbn, title: p.title.slice(0, 25), error: p.probe.error });
      }
    }));
  }
  const AVG = 200 * 1024;
  const estimate = knownBytes + (unknownCount + (byKind.resolve_ibb || 0) + (byKind.kob_refresh || 0)) * AVG;
  console.log('\n--- dry-run probe (direct URLs) ---');
  console.log(`direct probed OK (real image/*): ${headOk}/${directs.length}`);
  if (headBad.length) console.log('direct FAILING probes:', JSON.stringify(headBad, null, 1));
  console.log(`known bytes: ${(knownBytes / 1024 / 1024).toFixed(1)} MB + ~${unknownCount + (byKind.resolve_ibb || 0) + (byKind.kob_refresh || 0)} unknown @200KB avg`);
  console.log(`TOTAL STORAGE ESTIMATE: ~${(estimate / 1024 / 1024).toFixed(1)} MB`);
  console.log('\n--- records that would change (kind != skip/empty) ---');
  for (const p of plan) {
    if (['skip_existing_local', 'empty'].includes(p.kind)) continue;
    console.log(`${p.kind.padEnd(26)} ${p.isbn} ${p.title.slice(0, 34)} [${p.publisher?.slice(0, 18)}]`);
  }
  console.log('\n(dry-run only — rerun with --execute to ingest)');
  process.exit(0);
}

// ---------- execute ----------
const kobTargets = plan.filter((p) => p.kind === 'kob_refresh').map((p) => p.isbn);
let kobMap = new Map();
if (kobTargets.length) {
  console.log(`building kingdomofbook isbn map for ${kobTargets.length} books (own storefront, throttled)...`);
  kobMap = await buildKobIsbnMap(kobTargets, {
    onProgress: ({ scanned, total, found }) => {
      if (scanned % 100 === 0 || found === kobTargets.length) console.log(`  scanned ${scanned}/${total} pages, found ${found}/${kobTargets.length}`);
    },
  });
  console.log(`kob map ready: ${kobMap.size}/${kobTargets.length} found`);
}
const resolvers = buildResolverRegistry({ kobIsbnMap: kobMap });

mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = path.join(BACKUP_DIR, `publisher-catalog.pre-covers-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
copyFileSync(CATALOG_PATH, backupPath);
console.log(`backup: ${backupPath}`);

const results = { ok: 0, failed: {}, skipped: 0 };
const failures = [];
const actionable = plan.filter((p) => !['skip_existing_local', 'empty', 'not_https'].includes(p.kind));
const BATCH = 4;
for (let i = 0; i < actionable.length; i += BATCH) {
  await Promise.all(actionable.slice(i, i + BATCH).map(async (p) => {
    const rec = books[p.isbn];
    const r = await ingestCover({
      isbn13: p.isbn,
      url: rec.coverImage,
      existingCoverFile: rec.coverFile,
      existingOriginalUrl: rec.coverOriginalUrl,
      force: FORCE,
      resolvers,
      serveBase: SERVE_BASE,
    });
    if (r.status === 'ok') {
      Object.assign(rec, r.patch);
      results.ok++;
    } else if (r.status === 'skipped_existing') {
      results.skipped++;
    } else {
      // فشل: السجل يبقى كما هو تماماً — فقط توثيق الحالة للفحص اللاحق
      rec.coverIngest = { status: r.status, detail: r.detail || null, httpStatus: r.httpStatus || null, attemptedAt: new Date().toISOString() };
      if (!rec.coverOriginalUrl) rec.coverOriginalUrl = rec.coverImage;
      results.failed[r.status] = (results.failed[r.status] || 0) + 1;
      failures.push({ isbn: p.isbn, title: p.title.slice(0, 30), kind: p.kind, status: r.status, detail: (r.detail || '').slice(0, 80) });
    }
  }));
  console.log(`  progress ${Math.min(i + BATCH, actionable.length)}/${actionable.length}`);
}

// كتابة ذرّية واحدة
const tmp = `${CATALOG_PATH}.tmp`;
writeFileSync(tmp, JSON.stringify(catalog, null, 1), 'utf-8');
renameSync(tmp, CATALOG_PATH);

console.log('\n=== covers-ingest result ===');
console.log(JSON.stringify({ ingested: results.ok, skippedExistingLocal: results.skipped, failed: results.failed }, null, 1));
if (failures.length) {
  console.log('failures (records left untouched, status recorded):');
  for (const f of failures) console.log(` ${f.kind} ${f.isbn} ${f.title} -> ${f.status} ${f.detail}`);
}
console.log(`covers dir: ${COVERS_DIR}`);
console.log('⚠ أعد تشغيل الخادم ليقرأ الكتالوج المحدّث (الكاش بالذاكرة).');
