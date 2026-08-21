/**
 * طبقة HTTP موثوقة مشتركة لكل استدعاءات المصادر الخارجية (المرحلة 1).
 * ----------------------------------------------------------------
 * السياسة الموثقة:
 *  - مهلة صارمة لكل محاولة (AbortController) — التعليق لا يجمّد البحث كله.
 *  - إعادة محاولة محدودة للفشل العابر فقط: 429/500/502/503/504 وأخطاء
 *    الشبكة/المهلة. أخطاء 4xx الدائمة (400/401/403/404) لا يُعاد طلبها.
 *  - backoff أسّي مع jitter متوازن: delay = cap/2 + random(0, cap/2)
 *    حيث cap = min(maxDelayMs, baseDelayMs * 2^(attempt-1)) — نمو مضمون
 *    مع تشتيت يمنع تزامن العواصف، وبلا عدوانية تفاقم الـ rate limiting.
 *  - ميزانية زمنية كلية (totalBudgetMs): لو استُهلكت توقفت المحاولات
 *    مبكراً — فشل رشيق بدل انتظار طويل.
 *  - الأخطاء تحمل reason تشخيصياً (حالة HTTP/مهلة/شبكة) بلا أي URL —
 *    فلا يتسرب مفتاح API لأي سجل.
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch مع إعادة محاولة ومهلة. يرجّع الاستجابة الأخيرة (حتى غير الـ ok
 * غير القابلة للإعادة — قرار معالجتها للمستدعي)، أو يرمي خطأً يحمل
 * reason عند استنفاد المحاولات على فشل عابر.
 */
export async function fetchWithRetry(url, {
  timeoutMs = 6000,
  retries = 1,
  baseDelayMs = 400,
  maxDelayMs = 4000,
  totalBudgetMs = 15000,
  fetchOptions = {},
} = {}) {
  const startedAt = Date.now();
  let lastReason = 'unknown';

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(cap / 2 + Math.random() * (cap / 2));
    }

    // الميزانية الكلية استُهلكت -> نفشل بوضوح بدل محاولة قد تطول
    if (Date.now() - startedAt > totalBudgetMs) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (RETRYABLE_STATUSES.has(res.status) && attempt < retries) {
        lastReason = `transient HTTP ${res.status}`;
        continue;
      }
      return res;
    } catch (err) {
      lastReason = err.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : `network error: ${err.message}`;
      if (attempt >= retries) break;
    } finally {
      clearTimeout(timer);
    }
  }

  const error = new Error(`Request failed after retries (${lastReason})`);
  error.reason = lastReason;
  error.status = 503;
  throw error;
}
