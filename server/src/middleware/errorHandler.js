/**
 * معالج أخطاء مركزي — أي خطأ غير متوقع بأي route ينتهي هنا بدل ما يطيح السيرفر
 * أو يرجّع HTML افتراضي من Express. شكل الخطأ موحّد لكل الـ endpoints.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);

  const status = err.status || 500;
  res.status(status).json({
    error: true,
    message: status === 500 ? 'Internal server error' : err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: true, message: `No route: ${req.method} ${req.originalUrl}` });
}
