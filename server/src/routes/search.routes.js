import { Router } from 'express';
import { unifiedSearch } from '../controllers/search.controller.js';

const router = Router();

// نقطة البحث الموحّدة (orchestration) — الفرونت-إند يطلبها وحدها.
// نقاط الـ proxy القديمة (google-books / open-library / ai-suggest) حُذفت
// بعد اكتمال ربط الفرونت-إند بهذه النقطة — ما عاد يستدعيها أي شيء.
router.get('/', unifiedSearch);

export default router;
