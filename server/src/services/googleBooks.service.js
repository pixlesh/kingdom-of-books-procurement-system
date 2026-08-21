import { config } from '../config/env.js';
import { fetchWithRetry } from '../utils/http.js';

/**
 * إعدادات موثوقية Google Books (موثّقة — المرحلة 1):
 * التحقيق الميداني قاس 65% استجابات 503 عابرة بدفعات متتالية، فإعادة
 * المحاولة الواحدة القديمة كانت تخسر المصدر الأغنى كثيراً.
 *  - RETRIES = 3   -> أربع محاولات كحد أقصى (كافية إحصائياً للعواصف
 *                     المرصودة، وغير عدوانية على حصة الطلبات)
 *  - TIMEOUT = 6s  -> لكل محاولة؛ التعليق لا يجمّد البحث
 *  - BUDGET  = 15s -> سقف كلي للمصدر بكل محاولاته
 *  - backoff أسّي بقاعدة 400ms مع jitter (انظر utils/http.js)
 */
const GB_RETRIES = 3;
const GB_TIMEOUT_MS = 6000;
const GB_TOTAL_BUDGET_MS = 15000;
const GB_BASE_DELAY_MS = 400;

/**
 * يمرّر طلب بحث لـ Google Books API (q جاهز مسبقاً بالـ prefix مثل
 * intitle:/inauthor:/isbn:). المفتاح يعيش هنا فقط، أبداً بكود العميل،
 * ولا يظهر بأي رسالة خطأ أو سجل.
 *
 * options.retries: تجاوز ميزانية المحاولات — تستخدمه محاولة استرداد
 * الـ ISBN المؤجلة (المرحلة 2أ) بقيمة 0 لضمان محاولة إضافية واحدة فقط.
 */
export async function searchGoogleBooks(q, maxResults = 12, { retries = GB_RETRIES } = {}) {
  if (!config.googleBooksApiKey) {
    const err = new Error('Google Books search is not configured on the server.');
    err.status = 503;
    err.reason = 'missing API key';
    throw err;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&key=${config.googleBooksApiKey}`;

  const res = await fetchWithRetry(url, {
    timeoutMs: GB_TIMEOUT_MS,
    retries,
    baseDelayMs: GB_BASE_DELAY_MS,
    totalBudgetMs: GB_TOTAL_BUDGET_MS,
  });

  if (!res.ok) {
    // 4xx دائمة (400/401/403...) تصل هنا بلا إعادة محاولة — بتصميم مقصود
    const err = new Error(`Google Books API responded with ${res.status}`);
    err.status = res.status === 429 || res.status >= 500 ? 503 : 502;
    err.reason = `HTTP ${res.status}`;
    throw err;
  }

  try {
    return await res.json();
  } catch {
    const err = new Error('Google Books returned an unparsable response.');
    err.status = 502;
    err.reason = 'invalid JSON';
    throw err;
  }
}
