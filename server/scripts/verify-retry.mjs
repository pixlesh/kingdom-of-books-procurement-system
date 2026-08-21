// تحقق الموثوقية (المرحلة 1) — الحالة I وقياس استقلال المصادر والكاش.
// يعترض global.fetch لمحاكاة فشل Google العابر/الدائم بلا لمس الشبكة
// لغير المطلوب. تشغيل:  node scripts/verify-retry.mjs   (من مجلد server)
//
// مصادر الناشرين الحية (publisherSources) توقَف هنا صراحةً: هذا المسار
// يعترض fetch لمحاكاة GB/OL فقط بأنماط URL محددة سلفاً — طلبات حية حقيقية
// لمواقع الناشرين تكسر الحتمية (عدّاد استدعاءات/توقيت الاسترداد) ولا
// علاقة لها بما يقيسه هذا الملف. تغطيتها الحية مسؤولية اختبار مخصص لاحق.
// ⚠️ import عادي بأعلى الملف يُرفع (hoisted) وينفَّذ قبل أي سطر بينهما —
// فضبط process.env هنا لازم يسبق التحميل عبر import() ديناميكي، لا static.
process.env.PUBLISHER_LIVE_SOURCES = 'off';
const { searchBooks } = await import('../src/services/orchestration.service.js');

const realFetch = global.fetch;
let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

const make503 = () => new Response('{"error":{"code":503}}', { status: 503 });
const isGB = (url) => String(url).includes('googleapis.com/books');

// ---- الحالة I-أ: فشلان عابران 503 ثم نجاح — إعادة المحاولة تنقذ الطلب
// (النجاح الثالث fixture حتمي بقيم سجل Clean Code الحقيقي — الشبكة الحية
// لـ Google متقلبة 503 فلا تصلح لاختبار حتمي)
{
  const gbSuccessFixture = () => new Response(JSON.stringify({
    totalItems: 1,
    items: [{
      id: 'hjEFCAAAQBAJ',
      volumeInfo: {
        title: 'Clean Code',
        authors: ['Robert C. Martin'],
        industryIdentifiers: [
          { type: 'ISBN_13', identifier: '9780132350884' },
          { type: 'ISBN_10', identifier: '0132350882' },
        ],
        pageCount: 464,
        publishedDate: '2009',
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(gbCalls <= 2 ? make503() : gbSuccessFixture());
    }
    return realFetch(url, opts);
  };
  const result = await searchBooks('9780132350884', 'ISBN');
  check('I-a: GB retried past two 503s', result.meta.googleBooks === 'ok' && gbCalls === 3,
    `gbCalls=${gbCalls} meta.googleBooks=${result.meta.googleBooks}`);
  check('I-a: verified exact match returned',
    result.books.length > 0 && result.books.every((b) => b.isbn === '9780132350884'),
    `count=${result.books.length}`);
}

// ---- الحالة I-ب: فشل Google دائم — الحد الأقصى للمحاولات محدود،
//      وOpen Library يعمل رغم ذلك (استقلال المصادر)
{
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(make503());
    }
    return realFetch(url, opts);
  };
  const result = await searchBooks('Fourth Wing', 'Title');
  // مسار نصي بعد مرحلة استراتيجية البحث: شكلان لفلتر العنوان —
  // الأساسي بميزانية كاملة (4 محاولات) + شكل مساعد بمحاولتين = 6 كحد أقصى
  check('I-b: GB attempts bounded (6 = primary 4 + aux 2)', gbCalls === 6, `gbCalls=${gbCalls}`);
  check('I-b: meta reports GB failure honestly', result.meta.googleBooks === 'failed');
  check('I-b: Open Library still ran and returned books',
    result.meta.openLibrary === 'ok' && result.books.length > 0,
    `ol=${result.meta.openLibrary} count=${result.books.length}`);
  check('I-b: OL books carry real ISBNs now (fields fix)',
    result.books.some((b) => /^97[89]\d{10}$/.test(b.isbn)),
    result.books.slice(0, 3).map((b) => b.isbn).join(','));
}

// ---- الكاش: نفس الـ ISBN مرتين — الثانية بلا أي نداء خارجي
{
  let anyCalls = 0;
  global.fetch = (url, opts) => {
    anyCalls++;
    return realFetch(url, opts);
  };
  const first = await searchBooks('9780743246392', 'ISBN'); // Gatsby — غير مكرر أعلاه
  const callsAfterFirst = anyCalls;
  const second = await searchBooks('978-0-7432-4639-2', 'ISBN'); // نفس الكتاب بصيغة مشرطة
  const callsAfterSecond = anyCalls;
  check('cache: first lookup hits upstream', first.books.length > 0 && callsAfterFirst > 0,
    `calls=${callsAfterFirst}`);
  check('cache: second lookup (formatted variant) makes ZERO upstream calls',
    second.books.length > 0 && callsAfterSecond === callsAfterFirst,
    `calls=${callsAfterSecond - callsAfterFirst}`);
  check('cache: same canonical result', second.books[0]?.isbn === '9780743246392');
}

// ---- الحالة H (حتمية): مصدر يرجّع كتاباً برقم مختلف عن المطلوب —
//      يجب إسقاطه، لا يُقدَّم أبداً كنتيجة ISBN دقيقة
{
  const wrongBookFixture = () => new Response(JSON.stringify({
    totalItems: 1,
    items: [{
      id: 'wrong-book',
      volumeInfo: {
        title: 'Some Other Real Book',
        authors: ['Somebody Else'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780132119160' }],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  global.fetch = (url, opts) => {
    if (isGB(url)) return Promise.resolve(wrongBookFixture());
    // نعزل Open Library أيضاً: نتيجة فاضية حتمية
    if (String(url).includes('openlibrary.org/search.json')) {
      return Promise.resolve(new Response('{"numFound":0,"docs":[]}', { status: 200 }));
    }
    if (String(url).includes('openlibrary.org/isbn/')) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return realFetch(url, opts);
  };
  const result = await searchBooks('9781840226881', 'ISBN'); // ISBN صالح الشكل
  check('Case H (mocked): mismatching-ISBN record is dropped',
    result.books.length === 0 && result.source === 'none',
    `count=${result.books.length} source=${result.source}`);
}

// ============================================================
// المرحلة 2أ: استرداد الـ ISBN الدقيق بعد فشل Google العابر
// ============================================================

const isOLSearch = (url) => String(url).includes('openlibrary.org/search.json');
const isOLIsbn = (url) => String(url).includes('openlibrary.org/isbn/');
const olEmptyHandler = (url) => {
  if (isOLSearch(url)) return new Response('{"numFound":0,"docs":[]}', { status: 200 });
  if (isOLIsbn(url)) return new Response('not found', { status: 404 });
  return null;
};
const gbFixture = ({ isbn13, isbn10, title, pages }) => new Response(JSON.stringify({
  totalItems: 1,
  items: [{
    id: `fixture-${isbn13}`,
    volumeInfo: {
      title,
      industryIdentifiers: [
        { type: 'ISBN_13', identifier: isbn13 },
        ...(isbn10 ? [{ type: 'ISBN_10', identifier: isbn10 }] : []),
      ],
      pageCount: pages || 0,
      language: 'ar',
    },
  }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

// ---- 2A-1: نمط عاصفة 503 الواقعي (كان يستخدم متحف البراءة كمثال حي —
//      هذا الكتاب صار بكتالوج الناشرين 2026-08-20 فتخطّاه مسار الكتالوج
//      قبل ما يصل لفرصة الاسترداد أصلاً، فأبطل حتمية هذا الاختبار. ISBN
//      اصطناعي مخصص هنا (بنمط "فارغ للاختبار" الموثّق) يضمن عدم التصادم
//      مع أي استيراد كتالوج مستقبلي — العنوان يبقى نفس القصة للتوثيق) —
//      عاصفة 503 تستهلك الميزانية، OL فاضية، ثم الاسترداد المؤجل ينجح
{
  const ISBN = '9786039999980'; // اصطناعي مخصص لهذا الاختبار — لن يُستورد أبداً
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(gbCalls <= 4
        ? make503()
        : gbFixture({ isbn13: ISBN, isbn10: '9770933856', title: 'متحف البراءة', pages: 415 }));
    }
    const ol = olEmptyHandler(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const t0 = Date.now();
  const result = await searchBooks(ISBN, 'ISBN');
  const elapsed = Date.now() - t0;
  check('2A-1: recovery attempt runs after budget (5 GB calls total)', gbCalls === 5, `gbCalls=${gbCalls}`);
  check('2A-1: متحف البراءة returned by recovery, exact match',
    result.books.length === 1 && result.books[0].isbn === ISBN && result.books[0].title === 'متحف البراءة',
    JSON.stringify({ count: result.books.length, isbn: result.books[0]?.isbn }));
  check('2A-1: meta reports GB ok after successful recovery', result.meta.googleBooks === 'ok');
  check('2A-1: recovery was actually delayed (>=2.4s)', elapsed >= 2400, `${elapsed}ms`);
}

// ---- 2A-2: فشل الاسترداد أيضاً — لا كتاب زائف، لا حلقة لا نهائية،
//      ولا تسميم كاش (المحاولة التالية تصل للمصدر من جديد وتنجح)
//      (كان يستخدم ثلاثية غرناطة — صارت بكتالوج الناشرين 2026-08-20؛
//      ISBN اصطناعي مخصص هنا لنفس السبب الموثَّق بتعليق 2A-1 أعلاه)
{
  const ISBN = '9786039999973'; // اصطناعي مخصص لهذا الاختبار — لن يُستورد أبداً
  let gbCalls = 0;
  let mode = 'always503';
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(mode === 'always503'
        ? make503()
        : gbFixture({ isbn13: ISBN, isbn10: '9770907375', title: 'ثلاثية غرناطة', pages: 701 }));
    }
    const ol = olEmptyHandler(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-2: bounded — exactly 4 budget + 1 recovery = 5 GB calls', gbCalls === 5, `gbCalls=${gbCalls}`);
  check('2A-2: honest empty result, no false book', result.books.length === 0 && result.source === 'none');
  check('2A-2: meta still reports GB failed', result.meta.googleBooks === 'failed');

  mode = 'success';
  const callsBefore = gbCalls;
  const retry = await searchBooks(ISBN, 'ISBN');
  check('2A-2: outage was NOT cached — next request reaches source and succeeds',
    gbCalls > callsBefore && retry.books.length === 1 && retry.books[0].isbn === ISBN,
    `gbCalls=${gbCalls} count=${retry.books.length}`);
}

// ---- 2A-3: الاسترداد مستقل عن اللغة — كتاب إنجليزي بنفس السيناريو
{
  const ISBN = '9780132119160'; // Mythical Man-Month
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(gbCalls <= 4
        ? make503()
        : gbFixture({ isbn13: ISBN, isbn10: '0132119161', title: 'The Mythical Man-Month', pages: 348 }));
    }
    const ol = olEmptyHandler(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-3: English recovery works identically',
    gbCalls === 5 && result.books.length === 1 && result.books[0].isbn === ISBN,
    `gbCalls=${gbCalls} count=${result.books.length}`);
}

// ---- 2A-4: استقلال المصادر — Google ساقط لكن OL تملك الكتاب:
//      يُرجَع فوراً من OL بلا أي محاولة استرداد (لا إبطاء بلا داعٍ).
//      (fixture حتمي بقيم طبعة Fourth Wing الحقيقية المرصودة لدى OL —
//      الشبكة الحية لـ OL قد تمهل فتفسد حتمية الاختبار)
{
  const ISBN = '9781649374042'; // Fourth Wing — لدى Open Library فعلاً
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) { gbCalls++; return Promise.resolve(make503()); }
    if (isOLIsbn(url)) {
      return Promise.resolve(new Response(JSON.stringify({
        key: '/books/OL47654706M',
        title: 'Fourth Wing',
        number_of_pages: 517,
        publish_date: '2023',
        covers: [14605482],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (isOLSearch(url)) return Promise.resolve(new Response('{"numFound":0,"docs":[]}', { status: 200 }));
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-4: GB down + OL has book -> OL returns it',
    result.books.length >= 1 && result.books[0].isbn === ISBN && result.meta.openLibrary === 'ok',
    JSON.stringify({ count: result.books.length, isbn: result.books[0]?.isbn }));
  check('2A-4: no recovery attempt when OL already found it (4 calls only)',
    gbCalls === 4, `gbCalls=${gbCalls}`);
}

// ---- 2A-5: فشل Google دائم (401) — بلا إعادة محاولات وبلا استرداد
{
  const ISBN = '9786030167616'; // خوف
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(new Response('{"error":{"code":401}}', { status: 401 }));
    }
    const ol = olEmptyHandler(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-5: permanent 401 -> single call, no retries, no recovery',
    gbCalls === 1 && result.books.length === 0, `gbCalls=${gbCalls} count=${result.books.length}`);
}

// ---- 2A-6: OL ساقطة + Google يملك الكتاب — النتيجة تصل من Google،
//      ولا تُخزَّن بالكاش (مصدر فشل = تعذّر حسم كامل)
{
  const ISBN = '9789953320991'; // الرحيق المختوم
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      gbCalls++;
      return Promise.resolve(gbFixture({ isbn13: ISBN, isbn10: '9953320993', title: 'الرحيق المختوم' }));
    }
    if (isOLSearch(url) || isOLIsbn(url)) return Promise.resolve(new Response('down', { status: 500 }));
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-6: OL down + GB has book -> returned from GB',
    result.books.length === 1 && result.books[0].isbn === ISBN && result.meta.openLibrary === 'failed',
    JSON.stringify({ count: result.books.length, ol: result.meta.openLibrary }));
  const callsBefore = gbCalls;
  await searchBooks(ISBN, 'ISBN');
  check('2A-6: result with a failed source is NOT cached (second call hits upstream)',
    gbCalls > callsBefore, `gbCalls=${gbCalls}`);
}

// ---- 2A-7: المصدران ساقطان — نتيجة فاضية صادقة، وبلا استرداد
//      (الاسترداد مشروط بأن OL أكملت بنجاح)
{
  const ISBN = '9786144720196'; // فن اللامبالاة
  let gbCalls = 0;
  global.fetch = (url, opts) => {
    if (isGB(url)) { gbCalls++; return Promise.resolve(make503()); }
    if (isOLSearch(url) || isOLIsbn(url)) return Promise.resolve(new Response('down', { status: 500 }));
    return realFetch(url, opts);
  };
  const result = await searchBooks(ISBN, 'ISBN');
  check('2A-7: both sources down -> honest empty, no recovery (4 GB calls)',
    gbCalls === 4 && result.books.length === 0 && result.meta.googleBooks === 'failed' && result.meta.openLibrary === 'failed',
    `gbCalls=${gbCalls}`);
}

// ============================================================
// مرحلة الدمج الحقلي وجودة البيانات — اختبارات محاكاة حتمية
// ============================================================

// fixture أغنى لـ Google (كل الحقول قابلة للتحكم)
const gbRichFixture = (v) => new Response(JSON.stringify({
  totalItems: 1,
  items: [{
    id: `fixture-${v.isbn13}`,
    volumeInfo: {
      title: v.title,
      subtitle: v.subtitle,
      description: v.description,
      industryIdentifiers: [{ type: 'ISBN_13', identifier: v.isbn13 }],
      authors: v.authors,
      pageCount: v.pages ?? 0,
      publishedDate: v.date,
      publisher: v.publisher,
      language: v.language,
      imageLinks: v.cover ? { thumbnail: 'http://books.google.com/books/content?id=x' } : undefined,
    },
  }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const olEditionFixture = (v) => new Response(JSON.stringify({
  key: `/books/${v.isbn13}M`,
  title: v.title,
  number_of_pages: v.pages,
  publish_date: v.date,
  publishers: v.publisher ? [v.publisher] : undefined,
  covers: v.coverId ? [v.coverId] : undefined,
  languages: v.language ? [{ key: `/languages/${v.language}` }] : undefined,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const olDown404 = (url) => {
  if (isOLSearch(url)) return new Response('{"numFound":0,"docs":[]}', { status: 200 });
  if (isOLIsbn(url)) return new Response('nf', { status: 404 });
  return null;
};

// ---- M-1: الدمج يملأ الفراغات — GB (صفحات 0، بلا غلاف) + OL (286 صفحة + غلاف)
{
  const ISBN = '9786030167616'; // خوف — نفس نمط البيانات الواقعي
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      return Promise.resolve(gbRichFixture({ isbn13: ISBN, title: 'خوف', authors: ['أسامة المسلم'], pages: 0, date: '2015', language: 'ar' }));
    }
    if (isOLIsbn(url)) return Promise.resolve(olEditionFixture({ isbn13: ISBN, title: 'خوف', pages: 286, date: '2016', coverId: 12345, publisher: 'مركز الأدب العربي' }));
    if (isOLSearch(url)) return Promise.resolve(new Response('{"numFound":0,"docs":[]}', { status: 200 }));
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  const b = r.books[0] || {};
  check('M-1: pages filled from OL when GB=0', b.pageCount === 286, `pages=${b.pageCount}`);
  check('M-1: cover filled from OL when GB missing', String(b.coverImage).includes('covers.openlibrary.org'), b.coverImage);
  check('M-1: title/authors kept from primary (GB)', b.title === 'خوف' && b.authors?.[0] === 'أسامة المسلم');
  check('M-1: publisher filled from OL', b.publisher === 'مركز الأدب العربي', b.publisher);
  check('M-1: single merged record (no duplicate)', r.books.length === 1, `count=${r.books.length}`);
}

// ---- M-2: GB كامل + OL غائبة — كل القيم من GB بما فيها الحقول الجديدة
{
  const ISBN = '9789938886559'; // 1984 العربية
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      return Promise.resolve(gbRichFixture({
        isbn13: ISBN, title: '1984', subtitle: 'رواية', authors: ['جورج أورويل'],
        description: 'تعتبر رواية 1984 إحدى كلاسيكيات الأدب في العالم وقد قدمت صورة المجتمع الشمولي بأدق تفاصيله',
        pages: 328, date: '2014-01-01', publisher: 'Dar Attanweer', language: 'ar', cover: true,
      }));
    }
    const ol = olDown404(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  const b = r.books[0] || {};
  check('M-2: GB-only keeps all fields incl. new ones',
    b.pageCount === 328 && b.publisher === 'Dar Attanweer' && b.language === 'ar'
    && b.subtitle === 'رواية' && b.description.length > 0 && String(b.coverImage).includes('books.google.com'),
    JSON.stringify({ pages: b.pageCount, pub: b.publisher, lang: b.language, sub: b.subtitle }));
}

// ---- M-3: GB بلا سجل + OL كاملة — القيم من OL
{
  const ISBN = '9786140105232'; // ساق البامبو
  global.fetch = (url, opts) => {
    if (isGB(url)) return Promise.resolve(new Response('{"totalItems":0}', { status: 200 }));
    if (isOLIsbn(url)) return Promise.resolve(olEditionFixture({ isbn13: ISBN, title: 'Sāq al-bāmbū', pages: 396, date: '2012', coverId: 777, publisher: 'ASP', language: 'ara' }));
    if (isOLSearch(url)) return Promise.resolve(new Response('{"numFound":0,"docs":[]}', { status: 200 }));
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  const b = r.books[0] || {};
  check('M-3: OL-only record used fully',
    b.source === 'open_library' && b.pageCount === 396 && b.publisher === 'ASP' && b.language === 'ara',
    JSON.stringify({ src: b.source, pages: b.pageCount }));
}

// ---- M-4: المصدران بلا صفحات/غلاف — يبقيان مفقودين بصدق (بلا Unsplash)
{
  const ISBN = '9786038455647'; // إنتامافوبيا — النمط الواقعي
  global.fetch = (url, opts) => {
    if (isGB(url)) return Promise.resolve(gbRichFixture({ isbn13: ISBN, title: 'إنتامافوبيا', authors: ['سيهاتي، عبد العزيز'], pages: 0, date: '2024', language: 'ar' }));
    const ol = olDown404(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  const b = r.books[0] || {};
  check('M-4: missing stays missing — pages 0, cover EMPTY (no Unsplash)',
    b.pageCount === 0 && b.coverImage === '' && b.description === '',
    JSON.stringify({ pages: b.pageCount, cover: b.coverImage }));
}

// ---- M-5: تعارض (قيمتان صالحتان مختلفتان) — أولوية GB تبقى + تسجيل داخلي
{
  const ISBN = '9780135398548'; // Clean Code 2nd — نمط تعارض الصفحات الواقعي
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); origWarn(...args); };
  global.fetch = (url, opts) => {
    if (isGB(url)) return Promise.resolve(gbRichFixture({ isbn13: ISBN, title: 'Clean Code', authors: ['Robert C. Martin'], pages: 464, date: '2008', publisher: 'Prentice Hall', language: 'en' }));
    if (isOLIsbn(url)) return Promise.resolve(olEditionFixture({ isbn13: ISBN, title: 'Clean Code', pages: 431, date: '2008', publisher: 'Pearson' }));
    if (isOLSearch(url)) return Promise.resolve(new Response('{"numFound":0,"docs":[]}', { status: 200 }));
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  console.warn = origWarn;
  const b = r.books[0] || {};
  check('M-5: conflict keeps deterministic priority (GB pages 464)', b.pageCount === 464, `pages=${b.pageCount}`);
  check('M-5: conflict recorded internally (pages + publisher)',
    warnings.some((w) => w.includes('[merge] conflict field=pageCount') && w.includes('464') && w.includes('431'))
    && warnings.some((w) => w.includes('[merge] conflict field=publisher')),
    warnings.filter((w) => w.includes('[merge]')).join(' | ') || 'no conflict logs');
}

// ---- M-6: جودة البيانات — تنقية الناشر من المؤلفين + رفض نبذة بلغة مناقضة
// (ISBN خارج كتالوج الموردين عمداً — سلوك المصادر العامة الصافي)
{
  const ISBN = '9786144720196'; // فن اللامبالاة — بنمط تلوث متحف البراءة الواقعي
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); origWarn(...args); };
  global.fetch = (url, opts) => {
    if (isGB(url)) {
      return Promise.resolve(gbRichFixture({
        isbn13: ISBN, title: 'فن اللامبالاة',
        authors: ['مارك مانسون', 'دار التنوير'], // الناشر ملوث للمؤلفين
        description: 'Rigmandssonnen Kemal er forlovet med den rigtige pige men moder en fjern og meget smuk kusine som han bliver forelsket i',
        pages: 272, date: '2018', publisher: 'دار التنوير', language: 'ar', cover: true,
      }));
    }
    const ol = olDown404(url);
    if (ol) return Promise.resolve(ol);
    return realFetch(url, opts);
  };
  const r = await searchBooks(ISBN, 'ISBN');
  console.warn = origWarn;
  const b = r.books[0] || {};
  check('M-6: publisher removed from authors (kept as publisher)',
    b.authors?.length === 1 && b.authors[0] === 'مارك مانسون' && b.publisher === 'دار التنوير',
    JSON.stringify({ authors: b.authors, publisher: b.publisher }));
  check('M-6: language-inconsistent description rejected (stays empty)',
    b.description === '' && warnings.some((w) => w.includes('[quality] dropped language-inconsistent description')),
    `desc="${String(b.description).slice(0, 30)}"`);
  check('M-6: author-style name preserved as-is (no aggressive rewriting)', b.authors?.[0] === 'مارك مانسون');
}

// ============================================================
// مرحلة كتالوج الناشرين — الكتالوج موثوق ولا يُكتب فوق قيمه
// ============================================================
{
  const { getCatalogRecordByIsbn } = await import('../src/services/catalog.service.js');
  const ISBN = '9789776541252'; // إيكادولي — مستوردة من ملف عصير الكتب الحقيقي
  const rec = getCatalogRecordByIsbn(ISBN);
  if (!rec) {
    console.log('SKIP CAT-1: catalog empty — شغّل npm run catalog:import أولاً');
  } else {
    // ---- CAT-2 أولاً (قبل أن يملأ CAT-1 الكاش): كتاب الكتالوج يُرجَع
    //      حتى مع سقوط Google التام وخلوّ OL — وبلا أي محاولة استرداد
    {
      let gbCalls = 0;
      global.fetch = (url, opts) => {
        if (isGB(url)) { gbCalls++; return Promise.resolve(make503()); }
        const ol = olDown404(url);
        if (ol) return Promise.resolve(ol);
        return realFetch(url, opts);
      };
      const r2 = await searchBooks(ISBN, 'ISBN');
      const b2 = r2.books[0] || {};
      check('CAT-2: catalog book returned with GB down + OL empty',
        b2.source === 'publisher_catalog' && b2.pageCount === 316 && b2.isbn === ISBN,
        JSON.stringify({ src: b2.source, pages: b2.pageCount }));
      check('CAT-2: no recovery attempt (verified result already exists)', gbCalls === 4, `gbCalls=${gbCalls}`);
      const callsBefore = gbCalls;
      await searchBooks(ISBN, 'ISBN');
      check('CAT-2: outage result not cached (second call hits GB again)', gbCalls > callsBefore, `gbCalls=${gbCalls}`);
    }

    // Google يرجّع سجلاً متعارضاً بالكامل — يجب ألا يمس قيم المورد
    global.fetch = (url, opts) => {
      if (isGB(url)) {
        return Promise.resolve(gbRichFixture({
          isbn13: ISBN, title: 'WRONG TITLE OVERRIDE',
          authors: ['Wrong Author'],
          description: 'Totally different english description that must not win over supplier data',
          pages: 999, date: '1999', publisher: 'Wrong Publisher', language: 'en', cover: true,
        }));
      }
      const ol = olDown404(url);
      if (ol) return Promise.resolve(ol);
      return realFetch(url, opts);
    };
    const r = await searchBooks(ISBN, 'ISBN');
    const b = r.books[0] || {};
    check('CAT-1: catalog record wins (source=publisher_catalog)', b.source === 'publisher_catalog', b.source);
    check('CAT-1: supplier pages not overwritten (316, not 999)', b.pageCount === 316, `pages=${b.pageCount}`);
    check('CAT-1: supplier Arabic description kept', b.description.startsWith('رواية خيالية'), String(b.description).slice(0, 25));
    check('CAT-1: supplier title/author kept',
      b.title.includes('إيكادولي') && b.authors?.[0] === 'حنان لاشين', JSON.stringify({ t: b.title.slice(0, 20), a: b.authors }));
    check('CAT-1: mapped controlled genre (novels)', b.genre === 'novels', b.genre);
    check('CAT-1: supplier direct cover kept', String(b.coverImage).includes('media.zid.store'), b.coverImage?.slice(0, 40));
    check('CAT-1: VAT semantics (incl=49, pre-VAT derived)', b.priceIncludingVat === 49 && b.price === 42.61,
      JSON.stringify({ incl: b.priceIncludingVat, pre: b.price }));
  }
}

global.fetch = realFetch;
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
