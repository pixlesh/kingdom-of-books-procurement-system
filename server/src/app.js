import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import searchRoutes from './routes/search.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { COVERS_DIR } from './services/cover.service.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'kingdom-of-books-server' });
  });

  app.use('/api/search', searchRoutes);
  app.use('/api/upload', uploadRoutes);

  // أغلفة الكتالوج المخزنة محلياً (أسماء الملفات تحمل بصمة المحتوى → كاش دائم آمن)
  app.use('/covers', express.static(COVERS_DIR, { immutable: true, maxAge: '365d', index: false }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
