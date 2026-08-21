// حزمة تحقق استراتيجية البحث بالعنوان/المؤلف — حالات الفشل الحقيقية من
// التحقيق الميداني، ضد السيرفر الشغّال. (تسامح عاصفة Google: إعادة
// المحاولة مرة واحدة لو فشل المصدر بالكامل.)
// تشغيل (من مجلد server، والسيرفر شغّال):  npm run verify:search
const BASE = process.env.API_BASE || 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fold = (s) => String(s || '')
  .replace(/[ً-ْٰ]/g, '').replace(/ـ/g, '').replace(/[‎‏]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

async function search(q, filter = 'All Fields') {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`);
    const body = await res.json();
    if (body.meta?.googleBooks !== 'failed' || attempt === 1) return body;
    await sleep(3000); // تسامح عاصفة 503 الموثقة — محاولة ثانية واحدة
  }
}

const topTitles = (body, n = 5) => (body.books || []).slice(0, n).map((b) => b.title);

// ---- الحالة الرائدة المرصودة: عنوان + مؤلف عربي بسلسلة واحدة ----
{
  const body = await search('خوف أسامة المسلم');
  const hit = (body.books || []).slice(0, 5).find((b) =>
    fold(b.title).includes('خوف') && fold((b.authors || []).join(' ')).includes('مسلم'));
  check('AR "خوف أسامة المسلم" (كان صفراً) — الكتاب بأعلى 5', Boolean(hit),
    hit ? `"${hit.title}" ${hit.isbn}` : JSON.stringify(topTitles(body), null, 0).slice(0, 120));
  await sleep(600);
}

// ---- كتاب كتالوج المورد يظهر بالبحث النصي ويتصدر ----
{
  const body = await search('إيكادولي');
  const top = body.books?.[0];
  check('AR "إيكادولي" — سجل الكتالوج الموثوق يتصدر',
    top?.source === 'publisher_catalog' && top?.pageCount === 316,
    top ? `${top.source} "${top.title.slice(0, 25)}"` : 'no results');
  await sleep(600);
}

// ---- تهجئة متكافئة (ه/ا بدل ة/إ) ----
{
  const body = await search('موسم الهجره الى الشمال');
  const hit = (body.books || []).slice(0, 5).find((b) => fold(b.title).includes('موسم الهجره'));
  check('AR تهجئة متكافئة "موسم الهجره الى الشمال" — يجد الرواية', Boolean(hit),
    hit ? `"${hit.title}"` : JSON.stringify(topTitles(body)).slice(0, 100));
  await sleep(600);
}

// ---- عنوان عربي بسيط ما زال يعمل ويتصدر صاحبه ----
{
  const body = await search('ساق البامبو');
  const hit = (body.books || []).slice(0, 3).find((b) => fold(b.title).includes('ساق البامبو'));
  check('AR "ساق البامبو" — العنوان الصحيح بأعلى 3', Boolean(hit),
    JSON.stringify(topTitles(body, 3)).slice(0, 110));
  await sleep(600);
}

// ---- العنوان الفرعي الكامل (كان صفراً بفلتر Title) ----
{
  const body = await search('Clean Code A Handbook of Agile Software Craftsmanship', 'Title');
  const hit = (body.books || []).slice(0, 5).find((b) => /clean code/i.test(b.title));
  check('EN subtitle-full Title search (كان صفراً) — Clean Code يظهر', Boolean(hit),
    hit ? `"${hit.title}"` : JSON.stringify(topTitles(body)).slice(0, 100));
  await sleep(600);
}

// ---- ترتيب: النسخة الأصلية قبل الملخصات/الترجمات غير المطلوبة ----
{
  const body = await search('Atomic Habits James Clear');
  const top = body.books?.[0];
  const topOk = top && /atomic habits/i.test(top.title) && !/summary/i.test(top.title);
  check('EN "Atomic Habits James Clear" — الأصلي يتصدر (لا ملخصات)', Boolean(topOk),
    top ? `"${top.title}" lang=${top.language}` : 'no results');
  const summariesAboveOriginal = (body.books || []).findIndex((b) => /summary/i.test(b.title));
  check('EN الملخصات لا تتصدر (إن وُجدت فهي بعد الأصلي)',
    summariesAboveOriginal !== 0, `firstSummaryIndex=${summariesAboveOriginal}`);
  await sleep(600);
}

// ---- فلتر المؤلف العربي ----
{
  const body = await search('أسامة المسلم', 'Author');
  const his = (body.books || []).filter((b) => fold((b.authors || []).join(' ')).includes('مسلم'));
  check('AR Author filter "أسامة المسلم" — كتبه تظهر', his.length > 0,
    JSON.stringify(his.slice(0, 3).map((b) => b.title)).slice(0, 110));
  await sleep(600);
}

// ---- انحدار: بحث عنوان اعتيادي ما انكسر ----
{
  const body = await search('الرحيق المختوم');
  const hit = (body.books || []).slice(0, 3).find((b) => fold(b.title).includes('الرحيق المختوم'));
  check('AR انحدار "الرحيق المختوم" ما زال يعمل', Boolean(hit), JSON.stringify(topTitles(body, 3)).slice(0, 100));
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
