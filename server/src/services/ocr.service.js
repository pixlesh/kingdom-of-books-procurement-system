/**
 * ⚠️ Placeholder فقط — استخراج البيانات الفعلي من الملفات المرفوعة
 * (OCR / PDF parsing) مؤجّل لمرحلة قادمة بالخارطة (Phase 4).
 * الهدف من وجود هذا الملف الآن هو تجهيز البنية (route -> controller -> service)
 * عشان لما نبدأ التنفيذ الحقيقي نضيف المنطق هنا فقط، بدون تغيير أي شيء
 * بالفرونت-إند أو بباقي الباك-إند.
 */
export async function parseUploadedFile(/* file */) {
  const err = new Error('File parsing is not implemented on the server yet.');
  err.status = 501; // Not Implemented — تمييزاً عن 503 (متوفر لكن معطّل مؤقتاً)
  throw err;
}
