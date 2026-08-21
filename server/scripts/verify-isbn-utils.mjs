// تحقق وحدات ISBN (المرحلة 1) — يشمل الحالات D وE من قائمة الانحدار.
// تشغيل:  node scripts/verify-isbn-utils.mjs   (من مجلد server)
import {
  cleanIsbnInput,
  isValidIsbn10,
  isValidIsbn13,
  isbn10To13,
  normalizeIsbn,
  looksLikeIsbn,
} from '../src/utils/isbn.js';

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

// التنظيف
check('clean hyphens', cleanIsbnInput('978-0-13-235088-4'), '9780132350884');
check('clean spaces+pad', cleanIsbnInput('  978 0 13 235088 4 '), '9780132350884');
check('clean lowercase x', cleanIsbnInput('0-7432-4639-x'), '074324639X');

// صحة ISBN-13
check('valid ISBN-13', isValidIsbn13('9780132350884'), true);
check('invalid ISBN-13 checksum (Case E)', isValidIsbn13('9780132350885'), false);
check('EAN غير كتابي (بادئة 613)', isValidIsbn13('6130132350884'), false);

// صحة ISBN-10 — الحالة D: الحرف X محفوظ ومقبول
check('valid ISBN-10', isValidIsbn10('0132350882'), true);
check('valid ISBN-10 with X (Case D)', isValidIsbn10('074324639X'), true);
check('invalid ISBN-10 checksum (Case E)', isValidIsbn10('0132350880'), false);

// التحويل 10 -> 13 (مقارنة بأزواج حقيقية من Google Books)
check('10->13 Clean Code', isbn10To13('0132350882'), '9780132350884');
check('10->13 Gatsby (X)', isbn10To13('074324639X'), '9780743246392');

// التطبيع القانوني
check('normalize 13', normalizeIsbn('978-0-13-235088-4'),
  { valid: true, canonical13: '9780132350884', isbn10: null, input: '9780132350884' });
check('normalize 10 with X', normalizeIsbn('0-7432-4639-X'),
  { valid: true, canonical13: '9780743246392', isbn10: '074324639X', input: '074324639X' });
check('normalize invalid', normalizeIsbn('9780132350885').valid, false);
check('normalize garbage', normalizeIsbn('UOM:39015005133692').valid, false);

// كشف "يبدو ISBN" (الحالة G) — وشرط الـ checksum ضد الأرقام العشوائية
check('detect plain 13', looksLikeIsbn('9780132350884'), true);
check('detect hyphenated', looksLikeIsbn('978-0-13-235088-4'), true);
check('detect ISBN-10 X', looksLikeIsbn('0-7432-4639-X'), true);
check('reject random 13 digits', looksLikeIsbn('1234567890123'), false);
check('reject bad checksum 13', looksLikeIsbn('9780132350885'), false);
check('reject text query', looksLikeIsbn('Clean Code'), false);
check('reject library barcode', looksLikeIsbn('39015005133692'), false);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
