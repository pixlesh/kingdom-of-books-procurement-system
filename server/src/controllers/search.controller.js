import { searchBooks } from '../services/orchestration.service.js';

/**
 * GET /api/search?q=...&filter=...
 * نقطة البحث الموحّدة — الفرونت-إند يطلبها وحدها ويستلم كتباً مطبّعة
 * جاهزة. كل منطق الدمج/التكرار/قرار الـ AI في orchestration.service.js.
 */
export async function unifiedSearch(req, res, next) {
  try {
    const { q, filter } = req.query;
    if (!q || !String(q).trim()) {
      return res.status(400).json({ error: true, message: 'Query parameter "q" is required.' });
    }
    const data = await searchBooks(q, filter);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
