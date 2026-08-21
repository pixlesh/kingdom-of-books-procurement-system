/**
 * ===== سجل مصادر الناشرين الحية (Publisher Source Registry) =====
 * نقطة الدخول الوحيدة التي يستدعيها orchestration.service.js — تفصله
 * تماماً عن تفاصيل كل مصدر (بوابات، متصفح مشترك، تحليل HTML مختلف لكل
 * موقع). إضافة مصدر جديد لاحقاً = ملف جديد هنا يصدّر lookupByIsbn +
 * normalizer، وسطر واحد بمصفوفة SOURCES — بلا أي تعديل بمنطق البحث.
 *
 * كل مصدر مستقل تماماً (Promise.allSettled): فشل واحد لا يوقف الباقي،
 * ونفس تصنيف SOURCE_UNAVAILABLE المستخدم مع GB/OL بالضبط.
 */

import * as aseerAlKotb from './aseerAlKotb.service.js';
import * as adabBook from './adabBook.service.js';
import * as shorouk from './shorouk.service.js';
import {
  normalizeFromAseerAlKotbLive,
  normalizeFromAdabBookLive,
  normalizeFromShoroukLive,
} from '../../models/bookModel.js';

// عقد موحّد لكل مصدر: lookupByIsbn(isbn) -> { raw, sourceUrl, extra? } | null
// raw يُمرَّر كما هو لـ normalize(raw, {sourceUrl, ...extra}) — إضافة مصدر
// جديد لاحقاً = ملف جديد بنفس العقد + سطر واحد هنا، بلا لمس البحث الموحّد
const SOURCES = [
  {
    key: aseerAlKotb.SOURCE_KEY,
    publisherName: aseerAlKotb.PUBLISHER_NAME,
    lookupByIsbn: aseerAlKotb.lookupByIsbn,
    normalize: normalizeFromAseerAlKotbLive,
    // بلا متصفح — ميزانية زمن أقصر (نفس فئة OL)
    timeoutMs: 10000,
  },
  {
    key: adabBook.SOURCE_KEY,
    publisherName: adabBook.PUBLISHER_NAME,
    lookupByIsbn: adabBook.lookupByIsbn,
    normalize: normalizeFromAdabBookLive,
    // خطوة متصفح (بحث) + جلب صفحة عادي — ميزانية أوسع، وهامش فوق المهلة
    // الصارمة الداخلية بـ adabBook.service.js (24s) كي لا يقطعها السجل هنا أولاً
    timeoutMs: 28000,
  },
  {
    key: shorouk.SOURCE_KEY,
    publisherName: shorouk.PUBLISHER_NAME,
    lookupByIsbn: shorouk.lookupByIsbn,
    normalize: normalizeFromShoroukLive,
    // نفس فئة مركز الأدب العربي (خطوة متصفح + جلب صفحة) — هامش فوق
    // المهلة الصارمة الداخلية بـ shorouk.service.js (24s)
    timeoutMs: 28000,
  },
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.reason = `timeout after ${ms}ms`;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * يستعلم كل مصادر الناشرين الحية المفعّلة بالتوازي لـ ISBN دقيق واحد.
 * يرجّع { books, statuses } — books مطبّعة ومتحقَّق تطابق ISBN فيها
 * صراحةً (نفس فلسفة verifyExact بـ orchestration.service.js)، وstatuses
 * لكل مصدر ('ok'|'not_found'|'failed') لأغراض meta/السجلات.
 */
export async function lookupPublisherLiveSources(canonicalIsbn13) {
  const settled = await Promise.allSettled(
    SOURCES.map((src) =>
      withTimeout(src.lookupByIsbn(canonicalIsbn13), src.timeoutMs, src.key)
    )
  );

  const books = [];
  const statuses = {};

  settled.forEach((result, i) => {
    const src = SOURCES[i];
    if (result.status === 'rejected') {
      statuses[src.key] = 'failed';
      console.warn(`[search] publisher-live ${src.key} failed: ${result.reason?.reason || result.reason?.message || result.reason}`);
      return;
    }
    if (!result.value) {
      statuses[src.key] = 'not_found';
      return;
    }
    const book = src.normalize(result.value.raw, {
      sourceUrl: result.value.sourceUrl,
      ...result.value.extra,
    });
    if (book.isbn !== canonicalIsbn13) {
      // المصدر رجّع صفحة لكن ISBN المرصود لا يطابق المطلوب — رفض صريح، لا تخمين
      statuses[src.key] = 'not_found';
      console.warn(`[search] publisher-live ${src.key}: ISBN mismatch (requested=${canonicalIsbn13}, got=${book.isbn || 'none'}) — rejected`);
      return;
    }
    statuses[src.key] = 'ok';
    console.warn(`[search] publisher-live hit: source=${src.key} isbn=${canonicalIsbn13} url=${result.value.sourceUrl}`);
    books.push(book);
  });

  return { books, statuses };
}
