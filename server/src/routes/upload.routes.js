import { Router } from 'express';
import { uploadParse } from '../controllers/upload.controller.js';

const router = Router();

router.post('/parse', uploadParse);

export default router;
