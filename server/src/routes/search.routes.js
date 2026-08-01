import { Router } from 'express';
import {
  unifiedSearch,
  googleBooksSearch,
  openLibrarySearch,
  aiSuggest,
} from '../controllers/search.controller.js';

const router = Router();

// نقطة البحث الموحّدة (orchestration) — هذه اللي يعتمدها الفرونت-إند
router.get('/', unifiedSearch);

// نقاط الـ proxy القديمة — تبقى مؤقتاً لحين اكتمال ربط الفرونت-إند
// بالنقطة الموحّدة، ثم تُحذف بمرحلة الربط (لا شيء يستدعيها حالياً)
router.get('/google-books', googleBooksSearch);
router.get('/open-library', openLibrarySearch);
router.post('/ai-suggest', aiSuggest);

export default router;
