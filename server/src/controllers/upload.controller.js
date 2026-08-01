import { parseUploadedFile } from '../services/ocr.service.js';

/**
 * ⚠️ Placeholder — البنية جاهزة، لكن الاستخراج الفعلي (OCR) مؤجّل لـ Phase 4.
 * حالياً يرجّع 501 دايماً. لما يجهز التنفيذ الحقيقي، هذا الملف ما يحتاج يتغير
 * إلا بإضافة multer أو مكافئه لاستقبال الملف فعلياً قبل تمريره لـ parseUploadedFile.
 */
export async function uploadParse(req, res, next) {
  try {
    await parseUploadedFile();
    // لن نصل هنا حالياً — parseUploadedFile يرمي دايماً لحد ما يُنفَّذ فعلياً
  } catch (err) {
    next(err);
  }
}
