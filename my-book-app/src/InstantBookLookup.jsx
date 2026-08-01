import { useState, useEffect, useRef } from 'react';
import { BookOpen, Search, Upload, Sparkles, Sun, Moon, Loader2, QrCode, X, Bot } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  normalizeFromGoogleBooks,
  normalizeFromOpenLibrary,
  normalizeFromAI,
  parseUploadedFileMock,
} from './bookModel';
import styles from './InstantBookLookup.module.css';

// 🔑 مفاتيح API الخاصة بك
// ⚠️ مهم: هذين المفتاحين يجب نقلهما إلى ملف .env أو تمريرهما عبر backend/proxy
// ولا يجب أبداً تركهما مكشوفين داخل كود الواجهة الأمامية.
// إذا سبق ونشرت هذا الكود بأي مكان (بما فيه محادثة أو GitHub)، أعد توليد
// (regenerate) المفتاحين فوراً من Google Cloud Console و Google AI Studio.
const GOOGLE_BOOKS_API_KEY = 'YOUR_GOOGLE_BOOKS_API_KEY';
const AI_API_KEY = 'YOUR_GEMINI_API_KEY'; // يجب أن يبدأ بـ AIza... من Google AI Studio

// 🌐 قاموس النصوص للترجمة
const translations = {
  EN: {
    title: 'Instant Book Look-up',
    placeholder: 'Enter Title, Author, or ISBN...',
    upload: 'Upload File',
    filters: {
      'All Fields': 'All Fields',
      Title: 'Title',
      Author: 'Author',
      ISBN: 'ISBN',
    },
    searching: 'Searching Books Database...',
    emptyTitle: 'Your search results will appear here',
    emptySub: 'Start typing a query above to explore millions of listings instantly.',
    noResults: 'No books found for',
    noResultsSub: "We couldn't verify a real match. Try a different spelling or a shorter query.",
    unknownAuthor: 'Unknown Author',
    footer: 'Kingdom of Books — Instant Look-up v3.2',
    scanTitle: 'Scan Book Barcode / QR Code',
    aiGenerated: 'AI Suggested',
    connectionError: 'Connection issue. Showing what we could find.',
    uploading: 'Parsing file...',
    uploadSuccess: 'File parsed. Opening metadata review...',
    uploadErrorFormat: 'Unsupported file type. Use PDF, TXT, CSV, or XLSX.',
    uploadErrorEmpty: 'This file appears to be empty.',
    uploadErrorGeneric: 'Upload failed. Please try again.',
  },
  AR: {
    title: 'البحث السريع عن الكتب',
    placeholder: 'أدخل العنوان، المؤلف، أو رقم ISBN...',
    upload: 'رفع ملف',
    filters: {
      'All Fields': 'جميع الحقول',
      Title: 'العنوان',
      Author: 'المؤلف',
      ISBN: 'الرقم المعياري',
    },
    searching: 'جاري البحث في قاعدة البيانات والذكاء الاصطناعي...',
    emptyTitle: 'ستظهر نتائج البحث هنا',
    emptySub: 'ابدأ بكتابة كلمة البحث أعلاه لاستكشاف ملايين الكتب فوراً.',
    noResults: 'لم يتم العثور على كتب لـ',
    noResultsSub: 'لم نتمكن من التأكد من وجود نتيجة حقيقية. جرّب إملاء مختلف أو كلمة بحث أقصر.',
    unknownAuthor: 'مؤلف غير معروف',
    footer: 'مملكة الكتب — البحث السريع v3.2',
    scanTitle: 'امسح باركود / QR الكتاب',
    aiGenerated: 'اقتراح ذكاء اصطناعي',
    connectionError: 'صار خلل بالاتصال. نعرض اللي قدرنا نلقاه.',
    uploading: 'جاري استخراج بيانات الملف...',
    uploadSuccess: 'تم استخراج البيانات. جاري فتح شاشة المراجعة...',
    uploadErrorFormat: 'صيغة الملف غير مدعومة. استخدم PDF أو TXT أو CSV أو XLSX.',
    uploadErrorEmpty: 'يبدو أن هذا الملف فارغ.',
    uploadErrorGeneric: 'فشل رفع الملف. حاول مرة أخرى.',
  },
};

const InstantBookLookup = ({
  onSelectBook,
  lang = 'EN',
  theme = 'dark',
  onToggleTheme,
  onToggleLang,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Fields');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [uploadErrorMsg, setUploadErrorMsg] = useState('');

  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const filterKeys = ['All Fields', 'Title', 'Author', 'ISBN'];
  const t = translations[lang] || translations.EN;

  // 1. تفعيل الماسح الضوئي للكاميرا
  useEffect(() => {
    let scanner = null;
    if (isScannerOpen) {
      scanner = new Html5QrcodeScanner(
        'reader',
        { fps: 10, qrbox: { width: 250, height: 150 } },
        false
      );

      scanner.render(
        (decodedText) => {
          setSearchQuery(decodedText.trim());
          setActiveFilter('ISBN');
          setIsScannerOpen(false);
          scanner.clear();
        },
        () => {}
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch((err) => console.error(err));
      }
    };
  }, [isScannerOpen]);

  // 2. اختصار الكيبورد
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // مساعد: fetch مع إعادة محاولة عند 503 (خطأ مؤقت بالسيرفر)
  const fetchWithRetry = async (url, options = {}, retries = 2, delay = 800) => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, options);
        if ((res.status === 503 || res.status === 429) && i < retries) {
          await new Promise((r) => setTimeout(r, delay * (i + 1)));
          continue;
        }
        return res;
      } catch (err) {
        if (options.signal?.aborted) throw err;
        if (i === retries) throw err;
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
      }
    }
  };

  // 3. اقتراح AI — لا يُختلق أبداً. يرجّع مصفوفة فاضية إذا مو متأكد أو صار خطأ.
  const fetchFromAI = async (query, signal) => {
    try {
      const res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
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
        },
        1,
        1500
      );

      if (!res.ok) return [];

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const cleanJson = rawText.replace(/```json|```/g, '').trim();
      const parsedBooks = JSON.parse(cleanJson);

      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) return [];

      return parsedBooks.map((b, index) => normalizeFromAI(b, index));
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('AI suggestion unavailable:', err);
      return []; // فشل تقني = نتيجة فاضية، مو بيانات مختلقة
    }
  };

  // 4. Open Library Fallback
  const fetchFromOpenLibrary = async (query, signal) => {
    try {
      const cleanQuery = encodeURIComponent(query);
      let olEndpoint = `https://openlibrary.org/search.json?q=${cleanQuery}&limit=12`;
      if (activeFilter === 'Title') olEndpoint = `https://openlibrary.org/search.json?title=${cleanQuery}&limit=12`;
      if (activeFilter === 'Author') olEndpoint = `https://openlibrary.org/search.json?author=${cleanQuery}&limit=12`;
      if (activeFilter === 'ISBN') {
        const cleanIsbn = query.replace(/[^0-9X]/gi, '');
        olEndpoint = `https://openlibrary.org/search.json?q=isbn:${cleanIsbn || cleanQuery}&limit=12`;
      }

      const res = await fetchWithRetry(olEndpoint, { signal });
      if (!res.ok) return [];
      const data = await res.json();

      if (data.docs && data.docs.length > 0) {
        return data.docs.map((doc) => normalizeFromOpenLibrary(doc, t.unknownAuthor));
      }
      return [];
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return [];
    }
  };

  // مسار مشترك: يُستدعى فقط عندما Google Books ما رجّع نتائج حقيقية
  const resolveFallback = async (query, signal) => {
    const openLibraryResults = await fetchFromOpenLibrary(query, signal);
    if (openLibraryResults.length > 0) {
      setConnectionIssue(false);
      return openLibraryResults;
    }

    const aiResults = await fetchFromAI(query, signal);
    // aiResults ممكن تكون فاضية — وهذا صحيح ومقصود، يعني ما فيه نتيجة حقيقية
    return aiResults;
  };

  // 5. البحث الرئيسي
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setBooks([]);
      setLoading(false);
      setConnectionIssue(false);
      return;
    }

    const controller = new AbortController();

    const fetchBooks = async () => {
      setLoading(true);
      setConnectionIssue(false);
      try {
        let queryParam = '';
        const cleanQuery = encodeURIComponent(trimmedQuery);

        if (activeFilter === 'Title') {
          queryParam = `intitle:${cleanQuery}`;
        } else if (activeFilter === 'Author') {
          queryParam = `inauthor:${cleanQuery}`;
        } else if (activeFilter === 'ISBN') {
          const cleanIsbn = trimmedQuery.replace(/[^0-9X]/gi, '');
          queryParam = cleanIsbn ? `isbn:${cleanIsbn}` : cleanQuery;
        } else {
          queryParam = cleanQuery;
        }

        const googleEndpoint = `https://www.googleapis.com/books/v1/volumes?q=${queryParam}&maxResults=12&key=${GOOGLE_BOOKS_API_KEY}`;

        const res = await fetchWithRetry(googleEndpoint, { signal: controller.signal }, 1, 800);

        if (!res.ok) {
          // خطأ تقني حقيقي (403/503 بعد إعادة المحاولة) — ننبّه المستخدم بصراحة
          setConnectionIssue(true);
          const fallbackResults = await resolveFallback(trimmedQuery, controller.signal);
          setBooks(fallbackResults);
          return;
        }

        const data = await res.json();

        if (data.items && data.items.length > 0) {
          const formattedBooks = data.items.map((item) =>
            normalizeFromGoogleBooks(item, t.unknownAuthor)
          );
          setBooks(formattedBooks);
        } else {
          // Google Books رجّع بنجاح لكن بدون نتائج — بحث فعلي عن بديل حقيقي
          const fallbackResults = await resolveFallback(trimmedQuery, controller.signal);
          setBooks(fallbackResults);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Book search failed:', error);
          setConnectionIssue(true);
          setBooks([]); // خطأ حقيقي = نعرض حالة "لا نتائج"، أبداً لا نخترع بيانات
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(fetchBooks, 900);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeFilter, lang]);

  // معالجة رفع الملف: تحليل (mock حالياً) -> تطبيع لنفس Book Model الموحّد
  // المستخدم بنتائج البحث -> تمرير للمستخدم لمراجعته في شاشة التفاصيل
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // نسمح برفع نفس الملف مرة ثانية لاحقاً
    if (!file) return;

    setUploadStatus('uploading');
    setUploadErrorMsg('');

    try {
      const book = await parseUploadedFileMock(file);
      setUploadStatus('success');
      // فترة قصيرة عشان المستخدم يشوف رسالة النجاح قبل الانتقال للمراجعة
      setTimeout(() => {
        setUploadStatus('idle');
        onSelectBook && onSelectBook(book);
      }, 900);
    } catch (err) {
      setUploadStatus('error');
      setUploadErrorMsg(
        err.message === 'UNSUPPORTED_FORMAT'
          ? t.uploadErrorFormat
          : err.message === 'EMPTY_FILE'
          ? t.uploadErrorEmpty
          : t.uploadErrorGeneric
      );
    }
  };

  return (
    <div
      className={`${styles.instantBookLookup} ${theme === 'light' ? styles.lightTheme : ''}`}
      dir={lang === 'AR' ? 'rtl' : 'ltr'}
    >
      {/* 1. الشريط العلوي */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <BookOpen size={22} color="#00bfa5" />
          <span className={styles.instantBookLookUp}>{t.title}</span>
        </div>

        <div className={styles.rightActions}>
          <div className={styles.langToggle}>
            <div
              className={`${styles.langSlider} ${lang === 'AR' ? styles.slideAr : styles.slideEn}`}
            />
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'AR' ? styles.activeText : ''}`}
              onClick={() => onToggleLang && onToggleLang('AR')}
            >
              AR
            </button>
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'EN' ? styles.activeText : ''}`}
              onClick={() => onToggleLang && onToggleLang('EN')}
            >
              EN
            </button>
          </div>

          <button type="button" className={styles.themeToggle} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={18} color="#8b949e" /> : <Moon size={18} color="#00bfa5" />}
          </button>
        </div>
      </div>

      {/* 2. المحتوى الرئيسي */}
      <div className={styles.mainContent}>
        <div className={styles.searchSection}>
          <div className={styles.searchRow}>
            <div className={styles.inputWrapper}>
              <Search size={20} color="#00bfa5" />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder={t.placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className={styles.qrBtn}
                onClick={() => setIsScannerOpen(true)}
                title="Scan QR / Barcode"
              >
                <QrCode size={18} color="#8b949e" />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.csv,.xlsx"
              disabled={uploadStatus === 'uploading'}
            />
            <button
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus === 'uploading'}
            >
              {uploadStatus === 'uploading' ? (
                <Loader2 size={18} className={styles.spinner} />
              ) : (
                <Upload size={18} />
              )}
              <span>{uploadStatus === 'uploading' ? t.uploading : t.upload}</span>
            </button>
          </div>

          <div className={styles.filterRow}>
            {filterKeys.map((key) => (
              <button
                key={key}
                className={activeFilter === key ? styles.filterChipActive : styles.filterChip}
                onClick={() => setActiveFilter(key)}
              >
                {t.filters[key]}
              </button>
            ))}
          </div>
        </div>

        {/* تنبيه خفيف عند وجود مشكلة اتصال حقيقية (بدون إخفائها عن المستخدم) */}
        {connectionIssue && !loading && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '8px',
              borderRadius: '6px',
              background: 'rgba(255, 193, 7, 0.12)',
              color: '#ffc107',
              fontSize: '13px',
            }}
          >
            {t.connectionError}
          </div>
        )}

        {uploadStatus === 'success' && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '8px',
              borderRadius: '6px',
              background: 'rgba(0, 191, 165, 0.12)',
              color: '#00bfa5',
              fontSize: '13px',
            }}
          >
            {t.uploadSuccess}
          </div>
        )}

        {uploadStatus === 'error' && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '8px',
              borderRadius: '6px',
              background: 'rgba(248, 81, 73, 0.12)',
              color: '#f85149',
              fontSize: '13px',
            }}
          >
            {uploadErrorMsg}
          </div>
        )}

        {/* 3. حاوية النتائج */}
        <div className={styles.resultsContainer}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={32} color="#00bfa5" className={styles.spinner} />
              <span>{t.searching}</span>
            </div>
          ) : searchQuery === '' ? (
            <div className={styles.resultsContainerEmpty}>
              <div className={styles.illustrationGlow}>
                <div className={styles.emptyStateBook}>
                  <Sparkles size={28} color="#00bfa5" />
                </div>
              </div>
              <div className={styles.emptyStateTextGroup}>
                <div className={styles.yourSearchResults}>{t.emptyTitle}</div>
                <div className={styles.startTypingA}>{t.emptySub}</div>
              </div>
            </div>
          ) : books.length > 0 ? (
            <div className={styles.booksGrid}>
              {books.map((book) => {
                return (
                  <div
                    key={book.id}
                    className={styles.bookCard}
                    onClick={() => onSelectBook && onSelectBook(book)}
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    {book.isAiGenerated && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: '#00bfa5',
                          color: '#000',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          zIndex: 2,
                        }}
                        title={t.aiGenerated}
                      >
                        <Bot size={12} /> AI
                      </span>
                    )}
                    <img src={book.coverImage} alt={book.title} className={styles.bookCover} />
                    <div className={styles.bookDetails}>
                      <h4 className={styles.bookTitle}>{book.title}</h4>
                      <p className={styles.bookAuthor}>
                        {book.authors ? book.authors.join(', ') : t.unknownAuthor}
                      </p>
                      <span className={styles.bookDate}>{book.publishedYear || 'N/A'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.noResults}>
              <p>
                {t.noResults} "{searchQuery}".
              </p>
              <p style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>{t.noResultsSub}</p>
            </div>
          )}
        </div>
      </div>

      {/* 4. نافذة الكاميرا */}
      {isScannerOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>{t.scanTitle}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setIsScannerOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div id="reader" className={styles.scannerBox}></div>
          </div>
        </div>
      )}

      {/* 5. الفوتر */}
      <div className={styles.footer}>{t.footer}</div>
    </div>
  );
};

export default InstantBookLookup;