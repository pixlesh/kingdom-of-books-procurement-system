import { config } from '../config/env.js';

/**
 * نفس البرومبت وشرط "لا تختلق أبداً" اللي كان بكود الفرونت-إند تماماً —
 * انتقل هنا بدون أي تغيير بالمنطق، فقط المفتاح صار يعيش على السيرفر.
 * يرجّع استجابة Gemini الخام؛ استخلاص/تحويل النتيجة لصيغة الكتاب الموحّدة
 * (normalizeFromAI) يبقى بالفرونت-إند حالياً، بدون تكرار المنطق هنا.
 */
export async function suggestFromAI(query) {
  if (!config.geminiApiKey) {
    const err = new Error('AI suggestion is not configured on the server.');
    err.status = 503;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You are checking a book database gap. The query was "${query}" and it returned NO results from Google Books or Open Library.
Only respond if you are highly confident this is a real, published, verifiable book/author — do NOT guess or invent.
If you are not certain it exists, respond with exactly: []
If certain, respond ONLY with valid JSON array: [{"title": "...", "author": "...", "year": "..."}]
No markdown, no explanation, just the JSON.`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = new Error(`Gemini API responded with ${res.status}`);
    err.status = res.status === 429 || res.status === 503 ? res.status : 502;
    throw err;
  }

  return res.json();
}
