/**
 * يمرّر طلب بحث لـ Open Library. ما يحتاج مفتاح، لكن نمرّره من هنا لضمان
 * أن كل طلبات الطرف الثالث تمر من نقطة واحدة (تسجيل، معالجة أخطاء موحّدة،
 * وجاهزية لإضافة rate limiting أو caching مستقبلاً بمكان واحد فقط).
 *
 * يقبل نفس المعاملات اللي الفرونت-إند يبنيها حالياً: q (أو title/author)،
 * ويرجّع استجابة Open Library الخام كما هي.
 */
export async function searchOpenLibrary({ q, title, author, limit = 12 }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (title) params.set('title', title);
  else if (author) params.set('author', author);
  else params.set('q', q || '');

  const url = `https://openlibrary.org/search.json?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Open Library API responded with ${res.status}`);
    err.status = res.status === 429 || res.status === 503 ? res.status : 502;
    throw err;
  }

  return res.json();
}
