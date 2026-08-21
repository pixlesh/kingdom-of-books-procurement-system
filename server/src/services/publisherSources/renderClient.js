/**
 * ===== عميل عرض مشترك (Shared Render Client) =====
 * غير خاص بأي ناشر — يُستخدمه أي مصدر ناشر حي يحتاج خطوة بحث/تحليل تُرسم
 * فعلياً بـ JS (وليس تحليل HTML ثابت). ثبت بالتحقيق المباشر أن اثنين فقط
 * من الثلاثة يحتاجانه لخطوة البحث تحديداً (مركز الأدب العربي: نتائج
 * البحث تُرسم بالمتصفح؛ دار الشروق: مربع بحث جوجل المُضمَّن) — استخراج
 * بيانات المنتج نفسه بكلا الموقعين HTML ثابت عادي (لا حاجة لمتصفح هناك).
 *
 * قرارات تصميم مؤكدة:
 *  - نسخة متصفح واحدة مشتركة تُطلَق كسولاً (أول استخدام) وتبقى حيّة بين
 *    الطلبات — إطلاق متصفح جديد لكل طلب كلفته ~1-2 ثانية إضافية بلا داعٍ
 *    على خادم يعمل كعملية دائمة أصلاً (نفس فلسفة المشروع).
 *  - كل استدعاء يفتح صفحة (tab) جديدة منعزلة ويغلقها دائماً (finally) —
 *    لا تسرّب موارد حتى عند الخطأ.
 *  - مهلة صارمة واحدة بلا إعادة محاولة لخطوة المتصفح (باهظة السعر) —
 *    نفس فلسفة عدم الحلقات اللانهائية بالمشروع؛ فشل = SOURCE_UNAVAILABLE
 *    يُعالَج بمستوى الاستدعاء (publisherSources/index.js) لا هنا.
 *  - انهيار المتصفح نفسه (نادر) يُعاد إطلاقه تلقائياً بالاستدعاء التالي.
 */

import { chromium } from 'playwright';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null; // فشل الإطلاق -> محاولة جديدة بالمرة القادمة
      throw err;
    });
  }
  try {
    const browser = await browserPromise;
    if (!browser.isConnected()) {
      browserPromise = null;
      return getBrowser();
    }
    return browser;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

/**
 * يفتح صفحة معزولة، يشغّل fn(page)، ويغلق الصفحة دائماً — بلا أي تسرّب
 * موارد حتى لو رمى fn خطأً. fn تستلم صفحة Playwright جاهزة (بدون تنقّل
 * مسبق) — التنقّل وانتظار العناصر مسؤولية المستدعي (خاص بكل موقع).
 */
export async function withPage(fn) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

/** إغلاق نظيف صريح (اختباري بالأساس) — الإنتاج يبقي المتصفح حياً طبيعياً */
export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}
