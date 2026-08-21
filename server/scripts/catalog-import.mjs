// استيراد ملف قالب مورد معبأ إلى كتالوج الناشرين.
// الاستخدام (من مجلد server):
//   node scripts/catalog-import.mjs "<مسار الملف.xlsx>" --supplier "<اسم المورد>"
import { importSupplierWorkbook, catalogSize } from '../src/services/catalog.service.js';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const supplierIdx = args.indexOf('--supplier');
const supplier = supplierIdx >= 0 ? args[supplierIdx + 1] : null;

if (!filePath || !supplier) {
  console.log('Usage: node scripts/catalog-import.mjs "<file.xlsx>" --supplier "<supplier name>"');
  process.exit(1);
}

const summary = await importSupplierWorkbook(filePath, { supplier });
console.log('===== ملخص الاستيراد =====');
console.log(`المورد: ${summary.supplier}`);
console.log(`الملف: ${summary.file}`);
console.log(`سجلات جديدة: ${summary.imported} · محدَّثة: ${summary.updated} · مرفوضة: ${summary.rejected.length}`);
for (const rej of summary.rejected) console.log('  ✗ رفض:', JSON.stringify(rej));
console.log('تطبيع التصنيفات:');
for (const [raw, mapped] of Object.entries(summary.genreMapping)) console.log(`  "${raw}" -> ${mapped}`);
console.log(`إجمالي سجلات الكتالوج الآن: ${catalogSize()}`);
