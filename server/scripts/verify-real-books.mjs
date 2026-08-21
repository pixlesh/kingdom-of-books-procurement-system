// حزمة التحقق بكتب حقيقية (المرحلة 1) — تضرب السيرفر الشغّال على 3001.
// كل الكتب واقعية وأرقامها موثّقة من التحقيق الميداني (Goodreads/المصادر نفسها).
// تشغيل:  node scripts/verify-real-books.mjs   (والسيرفر شغّال)
const BASE = process.env.API_BASE || 'http://localhost:3001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q, filter) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`);
  return { status: res.status, body: await res.json() };
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

const ISBN13_RE = /^97[89]\d{10}$/;

/** فحص ISBN دقيق: النتيجة موجودة، وكل كتاب راجع يحمل فعلاً الـ ISBN المطلوب */
async function isbnCase(label, rawIsbn, canonical, { filter = 'ISBN', expectFound = true, extra } = {}) {
  const { status, body } = await search(rawIsbn, filter);
  const books = body.books || [];
  const allMatch = books.every((b) => b.isbn === canonical);
  const record = {
    requested: rawIsbn,
    normalized: canonical,
    sources: body.meta ? `gb=${body.meta.googleBooks} ol=${body.meta.openLibrary}` : '?',
    count: books.length,
    returnedIsbn: books[0]?.isbn ?? null,
    title: books[0]?.title ?? null,
    pages: books[0]?.pageCount ?? null,
    cover: books[0]?.coverImage ? books[0].coverImage.slice(0, 48) : '(empty)',
    publisher: books[0]?.publisher || '(empty)',
    language: books[0]?.language || '(empty)',
    matches: allMatch,
  };
  console.log('  ', JSON.stringify(record));
  if (expectFound) {
    check(label, status === 200 && books.length > 0 && allMatch,
      books.length === 0 ? 'no verified result' : (allMatch ? '' : 'returned ISBN mismatch'));
  } else {
    check(label, status === 200 && books.length === 0, `count=${books.length}`);
  }
  if (extra) extra(body);
  await sleep(400);
  return body;
}

console.log('===== كتب عربية حقيقية (ISBN موثّق) =====');
await isbnCase('AR خوف — أسامة المسلم (سعودي)', '9786030167616', '9786030167616', {
  extra: (body) => {
    const b = body.books[0] || {};
    // الدمج الحقلي: صفحات GB=0 تُملأ من طبعة OL (286) والغلاف كذلك
    check('  خوف merge: pages filled from OL edition (286)', b.pageCount === 286, `pages=${b.pageCount}`);
    check('  خوف merge: cover present from a real source', !!b.coverImage, b.coverImage?.slice(0, 40) || '(empty)');
  },
});
await isbnCase('AR ساق البامبو — السنعوسي (بوكر)', '9786140105232', '9786140105232');
await isbnCase('AR لأنك الله (دار الحضارة، سعودي)', '9786038381427', '9786038381427');
await isbnCase('AR الرحيق المختوم', '9789953320991', '9789953320991');
await isbnCase('AR ثلاثية غرناطة (دار الشروق)', '9789770907375', '9789770907375');
await isbnCase('AR فن اللامبالاة (مترجم)', '9786144720196', '9786144720196');
// حالة الانحدار الواقعية للمرحلة 2أ: كتاب موجود لدى Google فقط (لا تملكه
// Open Library) — فشِل فعلياً عند مستخدم حقيقي أثناء عاصفة 503؛ الاسترداد
// المؤجل يجب أن يجعله يُعثر عليه حتى عبر نافذة اضطراب.
// + مرحلة جودة البيانات: صفحات 415، الناشر محفوظ منفصلاً وغير ملوث
// للمؤلفين، والنبذة الدنماركية المرصودة تُرفض وتبقى فاضية بصدق
await isbnCase('AR متحف البراءة (Google-only، حالة الفشل الواقعية)', '9789770933855', '9789770933855', {
  extra: (body) => {
    const b = body.books[0] || {};
    check('  متحف: pages 415', b.pageCount === 415, `pages=${b.pageCount}`);
    check('  متحف: publisher kept separately (دار الشروق)', b.publisher === 'دار الشروق', b.publisher);
    check('  متحف: publisher NOT inside authors', Array.isArray(b.authors) && !b.authors.includes('دار الشروق'), JSON.stringify(b.authors));
    check('  متحف: Danish description rejected (empty)', b.description === '', `desc="${String(b.description).slice(0, 30)}"`);
    check('  متحف: real cover only (google/openlibrary or empty)',
      b.coverImage === '' || /books\.google|covers\.openlibrary/.test(b.coverImage), b.coverImage?.slice(0, 40));
  },
});

console.log('===== كتب قائمة الناشر الواقعية (مرحلة جودة البيانات) =====');
await isbnCase('AR إنتامافوبيا (سعودي 2024 — سجل Google هزيل)', '9786038455647', '9786038455647', {
  extra: (body) => {
    const b = body.books[0] || {};
    check('  إنتامافوبيا: found with title/author/year',
      b.title === 'إنتامافوبيا' && b.authors?.length > 0 && b.publishedYear === 2024, JSON.stringify({ t: b.title, y: b.publishedYear }));
    check('  إنتامافوبيا: description stays missing (no invention)', b.description === '');
    check('  إنتامافوبيا: pages stay missing', b.pageCount === 0, `pages=${b.pageCount}`);
    check('  إنتامافوبيا: cover EMPTY — no Unsplash fallback', b.coverImage === '', b.coverImage || '(empty)');
  },
});
await isbnCase('AR 1984 بالعربية (دار التنوير — سجل كامل)', '9789938886559', '9789938886559', {
  extra: (body) => {
    const b = body.books[0] || {};
    check('  1984: full GB metadata intact (pages/desc/cover)',
      b.pageCount === 328 && b.description.length > 0 && /books\.google/.test(b.coverImage), `pages=${b.pageCount}`);
    check('  1984: publisher/language preserved internally',
      !!b.publisher && b.language === 'ar', JSON.stringify({ pub: b.publisher, lang: b.language }));
  },
});
// مرحلة الكتالوج: إيكادولي الآن من كتالوج المورد (عصير الكتب) —
// بيانات المورد موثوقة: 316 صفحة، غلاف مباشر، نبذة عربية، سعر شامل
// الضريبة 49، تصنيف مطبَّع للقائمة المحكومة — وGoogle لا يكتب فوقها
await isbnCase('AR إيكادولي (كتالوج المورد — موثوق)', '9789776541252', '9789776541252', {
  extra: (body) => {
    const b = body.books[0] || {};
    check('  إيكادولي: source = publisher_catalog', b.source === 'publisher_catalog', b.source);
    check('  إيكادولي: authoritative pages 316 (was 0 from APIs)', b.pageCount === 316, `pages=${b.pageCount}`);
    check('  إيكادولي: direct supplier cover (media.zid.store)', String(b.coverImage).includes('media.zid.store'), b.coverImage?.slice(0, 45));
    check('  إيكادولي: supplier Arabic description (not GB\'s)', b.description.startsWith('رواية خيالية'), String(b.description).slice(0, 25));
    check('  إيكادولي: VAT handled (incl 49 -> pre-VAT 42.61)', b.priceIncludingVat === 49 && b.price === 42.61,
      JSON.stringify({ incl: b.priceIncludingVat, pre: b.price }));
    check('  إيكادولي: genre alias mapped (رواية -> novels)', b.genre === 'novels', b.genre);
    check('  إيكادولي: supplier identity kept as publisher', /عصير الكتب/.test(b.publisher), b.publisher);
  },
});

console.log('===== كتب إنجليزية حقيقية =====');
await isbnCase('EN Case A: Clean Code exact ISBN-13', '9780132350884', '9780132350884');
await isbnCase('EN Case B: Clean Code ISBN-10 -> same edition', '0132350882', '9780132350884');
await isbnCase('EN Case C: hyphenated formatting', '978-0-13-235088-4', '9780132350884');
await isbnCase('EN Case D: Gatsby ISBN-10 with X', '0-7432-4639-X', '9780743246392');
await isbnCase('EN Fourth Wing (2023)', '9781649374042', '9781649374042');
await isbnCase('EN Mythical Man-Month (1995 ed)', '9780132119160', '9780132119160');
// نظير إنجليزي لحالة "لدى Google فقط" (تحقق ميداني: OL بلا طبعة وبلا نتائج)
// — يثبت أن الاسترداد المؤجل مستقل عن اللغة على مستوى البيانات الحية
await isbnCase('EN Clean Code 2nd ed 2025 (Google-only)', '9780135398548', '9780135398548');

// الحالة B تكميلياً: 10 و13 لنفس الطبعة لا يصبحان كتابين
{
  const { body } = await search('9780132350884', 'ISBN');
  const isbns = (body.books || []).map((b) => b.isbn);
  check('Case B dedupe: single canonical edition record set',
    new Set(isbns).size === isbns.length && isbns.every((i) => i === '9780132350884'),
    isbns.join(','));
}

console.log('===== حالات الانحدار =====');
// الحالة E: checksum فاسد — يُرفض ولا يُوثَق
await isbnCase('Case E: invalid checksum rejected honestly', '9780132350885', null, { expectFound: false });

// الحالة G: لصق ISBN بفلتر All Fields — يُكتشف ويُوجَّه لمسار الـ ISBN
await isbnCase('Case G: All Fields + hyphenated ISBN auto-detected', '978-0-13-235088-4', '9780132350884', { filter: 'All Fields' });

// الحالة H: ISBN صالح الشكل لكنه شاغر فعلاً (تحقق ميداني: لا طبعة ولا
// نتائج لدى المصدرين) — أي نتائج فضفاضة برقم مختلف يجب أن تُسقط كلها
await isbnCase('Case H: vacant ISBN — unrelated loose matches are dropped, honest empty', '9786039999997', '9786039999997', { expectFound: false });
// ملاحظة موثّقة من بناء هذه الحالة: رقمان "شاغران" مرشّحان سابقاً
// (9780000000002 و9789999999991) اتضح أن Open Library يحتوي سجلات
// crowdsourced تدّعيهما فعلاً — التطابق الصارم يقبلها لأن المصدر نفسه
// ينسب الرقم للسجل. الحماية من بيانات مصدر ملوثة = تقاطع المصادر/
// provenance (مرحلة لاحقة بالخطة، ليست المرحلة 1). السيناريو الحتمي
// لإسقاط سجل برقم مختلف مُغطى في verify-retry.mjs (Case H mocked).

// الحالة F: بحث نصي يرجّع سجلات Google بمعرّفات OTHER — يجب ألا يتسرب
// أي معرّف غير ISBN إلى book.isbn (كان يتسرب كباركود مكتبات رقمي)
{
  const { body } = await search('موسم الهجرة إلى الشمال', 'All Fields');
  const books = body.books || [];
  const badIsbns = books.filter((b) => b.isbn !== '' && !ISBN13_RE.test(b.isbn));
  check('Case F: no OTHER/library identifiers leak into isbn',
    books.length > 0 && badIsbns.length === 0,
    badIsbns.length ? JSON.stringify(badIsbns.map((b) => b.isbn)) : `books=${books.length}, all clean`);
  await sleep(400);
}

// الحالة J: إصلاح fields لدى Open Library — كتاب تعرفه OL يرجع بـ ISBN وصفحات
{
  const { body } = await search('The Mythical Man-Month', 'Title');
  const olBooks = (body.books || []).filter((b) => b.source === 'open_library');
  const withIsbn = olBooks.filter((b) => ISBN13_RE.test(b.isbn));
  const withPages = olBooks.filter((b) => b.pageCount > 0);
  check('Case J: OL search results now carry ISBN data',
    olBooks.length === 0 || withIsbn.length > 0,
    `olBooks=${olBooks.length} withIsbn=${withIsbn.length} withPages=${withPages.length}`);
  await sleep(400);
}

// بحث نصي عادي (عربي + إنجليزي) — المسار النصي القديم ما انكسر
{
  const { body } = await search('لأنك الله', 'All Fields');
  check('AR title search still works', (body.books || []).length > 0, `count=${body.books?.length}`);
  await sleep(400);
  const { body: b2 } = await search('Atomic Habits James Clear', 'All Fields');
  check('EN title search still works', (b2.books || []).length > 0, `count=${b2.books?.length}`);
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
