/**
 * ⭐ منطق البحث الفعلي للمنتج — هذا الملف هو "كيف يعمل البحث" حقيقةً.
 * ----------------------------------------------------------------
 * يستعلم المصدرين الحقيقيين (Google Books + Open Library) بالتوازي،
 * يطبّع كل نتيجة للموديل الموحّد، يدمج ويحذف التكرار، ويقرر — بمكان
 * واحد فقط قابل للتدقيق — متى يحق للـ AI يقترح.
 *
 * قاعدة العمل المؤكدة (لا تُعاد صياغتها بدون قرار عمل جديد):
 *   - Gemini يُستدعى فقط إذا رجّع كلا المصدرين الحقيقيين صفر كتب.
 *   - أبداً لا يُستخدم لإكمال/تخمين حقول ناقصة بكتاب موجود — الحقول
 *     الناقصة تبقى فاضية وتُدار لاحقاً بمرحلة المراجعة البشرية.
 *   - بيانات AI لا تُدمج أبداً داخل سجل موثوق قائم.
 *
 * فشل مصدر واحد ما يمنع الثاني (Promise.allSettled) — تدهور تدريجي،
 * والحالة الفعلية لكل مصدر تُبلَّغ بصراحة عبر meta بدل إخفائها.
 */

import { config } from '../config/env.js';
import { searchGoogleBooks } from './googleBooks.service.js';
import { searchOpenLibrary } from './openLibrary.service.js';
import { suggestBooks } from './gemini.service.js';
import {
  normalizeFromGoogleBooks,
  normalizeFromOpenLibrary,
  normalizeFromAI,
} from '../models/bookModel.js';

const KNOWN_FILTERS = ['All Fields', 'Title', 'Author', 'ISBN'];

/** نفس منطق بناء استعلام Google Books اللي كان بالفرونت-إند (intitle:/inauthor:/isbn:) */
function buildGoogleQuery(query, filter) {
  if (filter === 'Title') return `intitle:${query}`;
  if (filter === 'Author') return `inauthor:${query}`;
  if (filter === 'ISBN') {
    const cleanIsbn = query.replace(/[^0-9X]/gi, '');
    return cleanIsbn ? `isbn:${cleanIsbn}` : query;
  }
  return query;
}

/** نفس منطق بناء معاملات Open Library اللي كان بالفرونت-إند */
function buildOpenLibraryParams(query, filter) {
  if (filter === 'Title') return { title: query };
  if (filter === 'Author') return { author: query };
  if (filter === 'ISBN') {
    const cleanIsbn = query.replace(/[^0-9X]/gi, '');
    return { q: `isbn:${cleanIsbn || query}` };
  }
  return { q: query };
}

/** مفتاح تكرار بديل عند غياب ISBN: العنوان + أول مؤلف (غير حساس لحالة الأحرف) */
function titleAuthorKey(book) {
  const title = (book.title || '').trim().toLowerCase();
  const author = (book.authors?.[0] || '').trim().toLowerCase();
  return `${title}|${author}`;
}

/**
 * دمج + حذف تكرار: ISBN أولاً، ثم العنوان+المؤلف.
 * ترتيب الوصول يحسم أي نسخة تبقى — نمرّر Google Books أولاً لأن سجلاته
 * أغنى (الوحيد اللي يوفر description)، فالنسخة الأغنى هي اللي تفوز.
 */
function mergeAndDedupe(...lists) {
  const merged = [];
  const seenIsbns = new Set();
  const seenTitleAuthors = new Set();

  for (const book of lists.flat()) {
    const isbn = book.isbn; // مطبّع مسبقاً لأرقام فقط بواسطة createBook
    const taKey = titleAuthorKey(book);

    if ((isbn && seenIsbns.has(isbn)) || seenTitleAuthors.has(taKey)) continue;

    if (isbn) seenIsbns.add(isbn);
    seenTitleAuthors.add(taKey);
    merged.push(book);
  }

  return merged;
}

/**
 * نقطة الدخول الوحيدة للبحث الموحّد — GET /api/search تنتهي هنا.
 * ترجع دائماً { books, source: 'merged'|'ai'|'none', meta } حيث books
 * كائنات مطبّعة بالكامل، جاهزة للعرض بدون أي معالجة إضافية بالفرونت-إند.
 */
export async function searchBooks(rawQuery, rawFilter) {
  const query = String(rawQuery || '').trim();
  const filter = KNOWN_FILTERS.includes(rawFilter) ? rawFilter : 'All Fields';

  const meta = {
    googleBooks: 'ok',
    openLibrary: 'ok',
    ai: 'not_needed',
    counts: { googleBooks: 0, openLibrary: 0, merged: 0 },
  };

  // 1) المصدران الحقيقيان بالتوازي — فشل أحدهما لا يمنع الآخر
  const [gbSettled, olSettled] = await Promise.allSettled([
    config.googleBooksApiKey
      ? searchGoogleBooks(buildGoogleQuery(query, filter))
      : Promise.resolve(null), // مفتاح غير مضبوط -> تخطٍّ صريح، مو فشل
    searchOpenLibrary(buildOpenLibraryParams(query, filter)),
  ]);

  // 2) التطبيع — كل نتيجة تمر من الموديل الموحّد قبل ما تلمس أي منطق آخر
  let googleBooksList = [];
  if (!config.googleBooksApiKey) {
    meta.googleBooks = 'skipped';
  } else if (gbSettled.status === 'rejected') {
    meta.googleBooks = 'failed';
  } else {
    googleBooksList = (gbSettled.value?.items || []).map((item) => normalizeFromGoogleBooks(item));
  }

  let openLibraryList = [];
  if (olSettled.status === 'rejected') {
    meta.openLibrary = 'failed';
  } else {
    openLibraryList = (olSettled.value?.docs || []).map((doc) => normalizeFromOpenLibrary(doc));
  }

  // 3) الدمج وحذف التكرار — Google Books أولاً (السجل الأغنى يفوز)
  const books = mergeAndDedupe(googleBooksList, openLibraryList);
  meta.counts = {
    googleBooks: googleBooksList.length,
    openLibrary: openLibraryList.length,
    merged: books.length,
  };

  // 4) وُجد كتاب موثوق واحد على الأقل -> نرجّع النتائج الموثوقة فقط، بلا AI
  if (books.length > 0) {
    return { books, source: 'merged', meta };
  }

  // 5) كلا المصدرين الحقيقيين رجّعا صفر كتب — فقط الآن يحق للـ AI يقترح
  //    كتباً كاملة (أبداً ليس ملء فراغات). فشل/غياب AI = نتيجة فاضية صادقة.
  if (!config.geminiApiKey) {
    meta.ai = 'skipped';
    return { books: [], source: 'none', meta };
  }

  try {
    const suggestions = await suggestBooks(query);
    meta.ai = 'ok';
    if (suggestions.length === 0) {
      return { books: [], source: 'none', meta };
    }
    const aiBooks = suggestions.map((s, index) => normalizeFromAI(s, index));
    return { books: aiBooks, source: 'ai', meta };
  } catch {
    meta.ai = 'failed';
    return { books: [], source: 'none', meta };
  }
}
