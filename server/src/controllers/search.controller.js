import { searchGoogleBooks } from '../services/googleBooks.service.js';
import { searchOpenLibrary } from '../services/openLibrary.service.js';
import { suggestFromAI } from '../services/gemini.service.js';
import { searchBooks } from '../services/orchestration.service.js';

/**
 * GET /api/search?q=...&filter=...
 * نقطة البحث الموحّدة — الفرونت-إند مستقبلاً يطلبها وحدها ويستلم كتباً
 * مطبّعة جاهزة. كل منطق الدمج/التكرار/قرار الـ AI في orchestration.service.js.
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

export async function googleBooksSearch(req, res, next) {
  try {
    const { q, maxResults } = req.query;
    if (!q) {
      return res.status(400).json({ error: true, message: 'Query parameter "q" is required.' });
    }
    const data = await searchGoogleBooks(q, maxResults ? Number(maxResults) : 12);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function openLibrarySearch(req, res, next) {
  try {
    const { q, title, author, limit } = req.query;
    if (!q && !title && !author) {
      return res.status(400).json({ error: true, message: 'One of "q", "title", or "author" is required.' });
    }
    const data = await searchOpenLibrary({ q, title, author, limit: limit ? Number(limit) : 12 });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function aiSuggest(req, res, next) {
  try {
    const { query } = req.body || {};
    if (!query) {
      return res.status(400).json({ error: true, message: 'Body field "query" is required.' });
    }
    const data = await suggestFromAI(query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
