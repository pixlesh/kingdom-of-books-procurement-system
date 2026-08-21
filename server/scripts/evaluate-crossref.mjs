/**
 * ===== تقييم Crossref كمصدر ثالث مجاني (قراءة فقط — ليس تكاملاً) =====
 * سكربت معزول تماماً عن خط البحث الإنتاجي. يستعلم Crossref بالـ ISBN
 * لنفس مجموعة الاختبار الحقيقية (كتب قوائم الناشر العربية ذات الحقول
 * الناقصة + عيّنة إنجليزية للمعايرة)، بتحقق ISBN صارم ضد القانوني 13.
 *
 * Crossref: سجل DOIs أكاديمي (مقالات/كتب/فصول أكاديمية) — مجاني بلا مفتاح.
 * نقطة الاستعلام: GET https://api.crossref.org/works?filter=isbn:{isbn}
 *
 * "عنصر تحكم" مضمّن: نحصد من Crossref نفسه كتاباً يفهرسه فعلاً (بحث
 * عنوان بنوع book) ثم نعيد الاستعلام برقمه — فلو رجعت كتب الاختبار صفراً
 * فهذا حكم تغطية مثبت، وليس خطأ بصيغة الاستعلام.
 *
 * التشغيل (من مجلد server):  npm run evaluate:crossref
 */
import { normalizeIsbn } from '../src/utils/isbn.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'KingdomOfBooks-metadata-evaluation/1.0' };

const TEST_SET = [
  { isbn: '9786038455647', label: 'AR إنتامافوبيا (سعودي 2024)', missing: ['description', 'pages', 'cover'] },
  { isbn: '9789776541252', label: 'AR إيكادولي (عصير الكتب)', missing: ['pages', 'cover'] },
  { isbn: '9786140105232', label: 'AR ساق البامبو (ASP)', missing: ['cover'] },
  { isbn: '9789770907375', label: 'AR ثلاثية غرناطة (دار الشروق)', missing: ['subtitle'] },
  { isbn: '9786030167616', label: 'AR خوف (مركز الأدب العربي)', missing: ['description'] },
  { isbn: '9789770933855', label: 'AR متحف البراءة (دار الشروق)', missing: ['description'] },
  { isbn: '9789953320991', label: 'AR الرحيق المختوم', missing: ['description'] },
  { isbn: '9786038381427', label: 'AR لأنك الله (دار الحضارة)', missing: [] },
  { isbn: '9786144720196', label: 'AR فن اللامبالاة (دار التنوير)', missing: [] },
  // معايرة إنجليزية — هل الفشل خاص بالعربية أم عام على الكتب التجارية؟
  { isbn: '9780132350884', label: 'EN Clean Code (Pearson)', missing: [] },
  { isbn: '9780743246392', label: 'EN The Great Gatsby (Scribner)', missing: [] },
  { isbn: '9781649374042', label: 'EN Fourth Wing (2023)', missing: [] },
];

async function crossrefByIsbn(canonical13) {
  const started = Date.now();
  try {
    const res = await fetch(`https://api.crossref.org/works?filter=isbn:${canonical13}&rows=5`, {
      headers: UA,
      signal: AbortSignal.timeout(15000),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { status: `http-${res.status}`, ms, items: [] };
    const data = await res.json();
    return { status: 'ok', ms, total: data?.message?.['total-results'] ?? 0, items: data?.message?.items || [] };
  } catch (err) {
    return { status: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : `network:${err.message}`, ms: Date.now() - started, items: [] };
  }
}

/** يحوّل عنصر Crossref لصف حقول قابل للمقارنة — بتحقق ISBN صارم */
function extractFields(item, canonical13) {
  const isbns = (item.ISBN || []).map((i) => normalizeIsbn(i)).filter((n) => n.valid).map((n) => n.canonical13);
  const exact = isbns.includes(canonical13);
  return {
    exact,
    doi: item.DOI,
    type: item.type,
    title: item.title?.[0] || null,
    subtitle: item.subtitle?.[0] || null,
    description: item.abstract ? String(item.abstract).replace(/<[^>]+>/g, '').slice(0, 80) : null,
    authors: item.author?.map((a) => [a.given, a.family].filter(Boolean).join(' ')) || null,
    pages: item.page || null,
    year: item.issued?.['date-parts']?.[0]?.[0] || null,
    publisher: item.publisher || null,
    language: item.language || null,
    cover: null, // Crossref لا يوفر أغلفة إطلاقاً (حقيقة بنيوية بالسجل)
  };
}

// ---- عنصر التحكم: كتاب يفهرسه Crossref فعلاً (يُحصد منه لا من الذاكرة) ----
console.log('== عنصر التحكم: التقاط كتاب مفهرس لدى Crossref ثم إعادة الاستعلام برقمه ==');
let controlOk = false;
try {
  const res = await fetch('https://api.crossref.org/works?query.title=deep+learning&filter=type:book&rows=20', { headers: UA, signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  const withIsbn = (data?.message?.items || []).find((it) => (it.ISBN || []).some((i) => normalizeIsbn(i).valid));
  if (withIsbn) {
    const harvested = normalizeIsbn(withIsbn.ISBN.find((i) => normalizeIsbn(i).valid)).canonical13;
    await sleep(600);
    const round = await crossrefByIsbn(harvested);
    const back = round.items.map((it) => extractFields(it, harvested)).find((f) => f.exact);
    controlOk = Boolean(back);
    console.log(`  حُصد: "${withIsbn.title?.[0]?.slice(0, 50)}" isbn=${harvested} -> round-trip: ${controlOk ? 'نجح (فلتر isbn يعمل)' : 'فشل!'}`);
  } else {
    console.log('  لم يُعثر على كتاب بمعرّف ISBN بحصاد التحكم');
  }
} catch (e) {
  console.log('  فشل عنصر التحكم:', e.message);
}
console.log('='.repeat(70));

// ---- مجموعة الاختبار الفعلية ----
const rows = [];
for (const t of TEST_SET) {
  const canonical = normalizeIsbn(t.isbn).canonical13;
  const r = await crossrefByIsbn(canonical);
  const fields = r.items.map((it) => extractFields(it, canonical));
  const exact = fields.find((f) => f.exact) || null;
  const row = {
    label: t.label,
    isbn: canonical,
    status: r.status,
    ms: r.ms,
    totalResults: r.total ?? 0,
    exactMatch: Boolean(exact),
    rejectedNonMatching: fields.filter((f) => !f.exact).length,
    record: exact,
    fillsCurrentGaps: exact
      ? t.missing.filter((m) => (m === 'pages' ? exact.pages : m === 'cover' ? exact.cover : exact[m]))
      : [],
  };
  rows.push(row);
  console.log(JSON.stringify(row, null, 1));
  console.log('-'.repeat(70));
  await sleep(600);
}

// ---- الملخص ----
const ar = rows.filter((r) => r.label.startsWith('AR'));
const en = rows.filter((r) => r.label.startsWith('EN'));
console.log('\n===== ملخص Crossref =====');
console.log(`control round-trip: ${controlOk ? 'PASS' : 'FAIL'}`);
console.log(`exact matches: AR ${ar.filter((r) => r.exactMatch).length}/${ar.length} · EN ${en.filter((r) => r.exactMatch).length}/${en.length}`);
console.log(`gap fields filled anywhere: ${rows.reduce((n, r) => n + r.fillsCurrentGaps.length, 0)}`);
const times = rows.filter((r) => r.status === 'ok').map((r) => r.ms);
if (times.length) console.log(`response time: avg ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms (min ${Math.min(...times)}, max ${Math.max(...times)})`);
console.log(`errors: ${rows.filter((r) => r.status !== 'ok').map((r) => `${r.isbn}:${r.status}`).join(', ') || 'none'}`);
