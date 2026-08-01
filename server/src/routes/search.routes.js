import { Router } from 'express';
import { googleBooksSearch, openLibrarySearch, aiSuggest } from '../controllers/search.controller.js';

const router = Router();

router.get('/google-books', googleBooksSearch);
router.get('/open-library', openLibrarySearch);
router.post('/ai-suggest', aiSuggest);

export default router;
