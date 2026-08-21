import { useState, useEffect, useRef } from 'react';
import { BookOpen, Search, Upload, Sparkles, Sun, Moon, Loader2, QrCode, X, Bot, ShoppingCart, Trash2, ChevronRight, Camera, Keyboard, ImageOff } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseUploadedFileMock } from './bookModel';
import styles from './InstantBookLookup.module.css';

// عنوان الباك-إند — البحث كله يمر من GET /api/search: السيرفر هو مصدر الحقيقة
// الوحيد للاسترجاع (هو من يستعلم Google Books/Open Library/Gemini، يدمج،
// ويرجّع كتباً مطبّعة جاهزة). ما فيه أي مفاتيح API بالفرونت-إند نهائياً.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// 🌐 قاموس النصوص للترجمة
const translations = {
  EN: {
    title: 'Instant Book Look-up',
    placeholder: 'Enter Title, Author, or ISBN...',
    upload: 'Upload File',
    searching: 'Searching Books Database...',
    emptyTitle: 'Your search results will appear here',
    emptySub: 'Start typing a query above to explore millions of listings instantly.',
    noResults: 'No books found for',
    noResultsSub: "We couldn't verify a real match. Try a different spelling or a shorter query.",
    unknownAuthor: 'Unknown Author',
    coverUnavailable: 'Cover unavailable',
    footer: 'Kingdom of Books — Instant Look-up v3.2',
    scanTitle: 'Scan Book Barcode / QR Code',
    scanMethodCamera: 'Camera',
    scanMethodExternal: 'External Scanner',
    scanCameraHint: 'Point the camera at the book barcode or QR code.',
    scanCameraStarting: 'Starting camera...',
    scanCameraError: 'Camera access is unavailable. You can use an external scanner instead.',
    scanUseExternal: 'Use External Scanner',
    scanExternalHint: 'Scan the barcode using your external scanner, or type it manually and press Enter.',
    scanExternalPlaceholder: 'Barcode / ISBN...',
    scanWaiting: 'Waiting for scan...',
    scanClose: 'Close scanner',
    aiGenerated: 'AI Suggested',
    connectionError: 'Connection issue. Showing what we could find.',
    uploading: 'Parsing file...',
    uploadSuccess: 'File parsed. Opening metadata review...',
    uploadErrorFormat: 'Unsupported file type. Use PDF, TXT, CSV, or XLSX.',
    uploadErrorEmpty: 'This file appears to be empty.',
    uploadErrorGeneric: 'Upload failed. Please try again.',
    cartTitle: 'Books in export queue',
    cartHeader: 'Export Queue',
    cartEmpty: 'The export queue is empty',
    cartEmptySub: 'Open a book and use "Add to Cart" to queue it.',
    openQueuedBook: 'Open book details',
    removeFromQueue: 'Remove from queue',
  },
  AR: {
    title: 'البحث السريع عن الكتب',
    placeholder: 'أدخل العنوان، المؤلف، أو رقم ISBN...',
    upload: 'رفع ملف',
    searching: 'جاري البحث في قاعدة البيانات والذكاء الاصطناعي...',
    emptyTitle: 'ستظهر نتائج البحث هنا',
    emptySub: 'ابدأ بكتابة كلمة البحث أعلاه لاستكشاف ملايين الكتب فوراً.',
    noResults: 'لم يتم العثور على كتب لـ',
    noResultsSub: 'لم نتمكن من التأكد من وجود نتيجة حقيقية. جرّب إملاء مختلف أو كلمة بحث أقصر.',
    unknownAuthor: 'مؤلف غير معروف',
    coverUnavailable: 'الغلاف غير متوفر',
    footer: 'مملكة الكتب — البحث السريع v3.2',
    scanTitle: 'امسح باركود / QR الكتاب',
    scanMethodCamera: 'الكاميرا',
    scanMethodExternal: 'ماسح خارجي',
    scanCameraHint: 'وجّه الكاميرا نحو باركود الكتاب أو رمز QR.',
    scanCameraStarting: 'جاري تشغيل الكاميرا...',
    scanCameraError: 'تعذّر الوصول إلى الكاميرا. يمكنك استخدام الماسح الخارجي بدلاً منها.',
    scanUseExternal: 'استخدام الماسح الخارجي',
    scanExternalHint: 'امسح الباركود بالماسح الخارجي، أو اكتبه يدوياً ثم اضغط Enter.',
    scanExternalPlaceholder: 'الباركود / ISBN...',
    scanWaiting: 'بانتظار المسح...',
    scanClose: 'إغلاق الماسح',
    aiGenerated: 'اقتراح ذكاء اصطناعي',
    connectionError: 'صار خلل بالاتصال. نعرض اللي قدرنا نلقاه.',
    uploading: 'جاري استخراج بيانات الملف...',
    uploadSuccess: 'تم استخراج البيانات. جاري فتح شاشة المراجعة...',
    uploadErrorFormat: 'صيغة الملف غير مدعومة. استخدم PDF أو TXT أو CSV أو XLSX.',
    uploadErrorEmpty: 'يبدو أن هذا الملف فارغ.',
    uploadErrorGeneric: 'فشل رفع الملف. حاول مرة أخرى.',
    cartTitle: 'عدد الكتب في قائمة التصدير',
    cartHeader: 'قائمة التصدير',
    cartEmpty: 'قائمة التصدير فارغة',
    cartEmptySub: 'افتح كتاباً واستخدم «إضافة إلى السلة» لإضافته.',
    openQueuedBook: 'فتح تفاصيل الكتاب',
    removeFromQueue: 'إزالة من القائمة',
  },
};

const InstantBookLookup = ({
  onSelectBook,
  lang = 'EN',
  theme = 'dark',
  onToggleTheme,
  onToggleLang,
  // استعلام أولي قادم من بحث الشريط العلوي بشاشة التفاصيل — الشاشة تُركَّب
  // من جديد عند كل عودة، فالقيمة الأولية تكفي وتدفق البحث الحالي يشتغل كما هو
  initialQuery = '',
  // قائمة التصدير المشتركة بمستوى التطبيق ومعالج الإزالة منها —
  // نفس المصدر الوحيد للحقيقة، بلا أي حالة سلة مكررة هنا
  exportQueue = [],
  onRemoveFromQueue,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  // ظهور قائمة السلة المنسدلة — حالة عرض محلية فقط (مو حالة بيانات)
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartWrapperRef = useRef(null);
  // نطاق البحث المرسل للسيرفر — ما عاد له واجهة (شرائح الفلاتر أُزيلت)،
  // لكنه يبقى جزءاً من عقد الطلب الحالي: افتراضياً "All Fields"، وماسح
  // الباركود يضبطه على "ISBN" — نفس سلوك البحث السابق تماماً بلا تغيير
  const [activeFilter, setActiveFilter] = useState('All Fields');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  // طريقة المسح: كاميرا حية أو ماسح خارجي (USB/بلوتوث يتصرف كلوحة مفاتيح).
  // الطريقتان احتياطي لبعضهما — نحتفظ بآخر اختيار طالما الشاشة حية.
  const [scannerMode, setScannerMode] = useState('camera'); // camera | external
  // حالة الكاميرا: idle | starting | active | error
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [externalScanValue, setExternalScanValue] = useState('');
  const externalInputRef = useRef(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [uploadErrorMsg, setUploadErrorMsg] = useState('');

  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const t = translations[lang] || translations.EN;

  // مسح النتائج لحظة فراغ البحث — بنمط "تعديل الحالة أثناء الرندر" الموصى به
  // من React (نفس نمط trackedBookId بشاشة المراجعة)، بدل setState داخل effect.
  // الـ effect تحت يتكفّل فقط بالاستعلامات غير الفاضية.
  const trimmedQuery = searchQuery.trim();
  const [trackedQuery, setTrackedQuery] = useState(trimmedQuery);
  if (trimmedQuery !== trackedQuery) {
    setTrackedQuery(trimmedQuery);
    if (!trimmedQuery) {
      setBooks([]);
      setLoading(false);
      setConnectionIssue(false);
    }
  }

  // قيمة ممسوحة (من الكاميرا أو الماسح الخارجي أو الكتابة اليدوية) تدخل
  // تدفق البحث الموجود نفسه: نفس searchQuery ونفس فلتر ISBN — بلا أي
  // مسار بحث جديد. إغلاق النافذة يوقف الكاميرا عبر تنظيف الـ effect تحت.
  const handleScanResult = (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return;
    setSearchQuery(value);
    setActiveFilter('ISBN');
    setExternalScanValue('');
    setIsScannerOpen(false);
  };

  // ضبط حالة الكاميرا وقت الرندر (نفس نمط trackedQuery/trackedBookId):
  // فتح وضع الكاميرا = "starting"، وإغلاقه أو التبديل عنه = "idle" —
  // بلا setState متزامن داخل جسم الـ effect
  const cameraScanKey = isScannerOpen && scannerMode === 'camera' ? 'camera-open' : 'closed';
  const [trackedScanKey, setTrackedScanKey] = useState(cameraScanKey);
  if (cameraScanKey !== trackedScanKey) {
    setTrackedScanKey(cameraScanKey);
    setCameraStatus(cameraScanKey === 'camera-open' ? 'starting' : 'idle');
  }

  // 1. الكاميرا الحية — Html5Qrcode مباشرة (نفس المكتبة المثبتة، بدون
  // واجهة Html5QrcodeScanner الجاهزة بأزرارها). تدعم QR وباركود الكتب
  // (EAN-13 وغيره) افتراضياً. تشغيل فوري بطلب إذن الكاميرا عند اختيار
  // وضع الكاميرا، وإيقاف مضمون عند الإغلاق أو التبديل للماسح الخارجي.
  useEffect(() => {
    if (!isScannerOpen || scannerMode !== 'camera') return;

    let cancelled = false;
    const scanner = new Html5Qrcode('camera-reader');

    const startPromise = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => handleScanResult(decodedText),
      () => {} // إخفاقات القراءة إطار-بإطار طبيعية — نتجاهلها
    );

    startPromise
      .then(() => {
        if (!cancelled) setCameraStatus('active');
      })
      .catch(() => {
        // إذن مرفوض / لا توجد كاميرا — حالة واضحة مع مخرج للماسح الخارجي
        if (!cancelled) setCameraStatus('error');
      });

    return () => {
      cancelled = true;
      // الإيقاف آمن فقط بعد نجاح start — ننتظره ثم نوقف ونبتلع أي فشل
      startPromise
        .then(() => scanner.stop())
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [isScannerOpen, scannerMode]);

  // تركيز تلقائي على حقل الماسح الخارجي لحظة فتح وضعه — أغلب الماسحات
  // الخارجية تكتب كلوحة مفاتيح بالحقل المُركَّز ثم ترسل Enter
  useEffect(() => {
    if (isScannerOpen && scannerMode === 'external') {
      externalInputRef.current?.focus();
    }
  }, [isScannerOpen, scannerMode]);

  // Escape يغلق نافذة الماسح أياً كان العنصر المُركَّز
  useEffect(() => {
    if (!isScannerOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsScannerOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isScannerOpen]);

  // إغلاق قائمة السلة عند النقر خارجها (النقر داخل الغلاف — الزر أو
  // القائمة نفسها — ما يُغلق؛ زر السلة يبدّل الحالة بنفسه)
  useEffect(() => {
    if (!isCartOpen) return;
    const handleOutsideClick = (e) => {
      if (cartWrapperRef.current && !cartWrapperRef.current.contains(e.target)) {
        setIsCartOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCartOpen]);

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

  // 3. البحث الرئيسي — طلب واحد فقط للباك-إند، يرجع كتباً مطبّعة جاهزة للعرض.
  //    كل منطق المصادر/الدمج/قرار الـ AI صار بالسيرفر (orchestration.service.js).
  //    الاستعلام الفاضي يُعالَج أعلاه وقت الرندر — هنا نتجاهله فقط.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    const controller = new AbortController();

    const fetchBooks = async () => {
      setLoading(true);
      setConnectionIssue(false);
      try {
        const url = `${API_BASE_URL}/api/search?q=${encodeURIComponent(trimmedQuery)}&filter=${encodeURIComponent(activeFilter)}`;
        const res = await fetchWithRetry(url, { signal: controller.signal }, 1, 800);

        if (!res.ok) {
          // خطأ حقيقي من السيرفر بعد إعادة المحاولة — ننبّه المستخدم بصراحة
          setConnectionIssue(true);
          setBooks([]);
          return;
        }

        const data = await res.json();
        setBooks(data.books || []);
        // البانر يعكس الحالة الفعلية فقط: مصدر فشل فعلاً = مشكلة اتصال حقيقية.
        // مصدر "skipped" (مفتاح غير مضبوط بالسيرفر) مو مشكلة اتصال — بلا بانر.
        setConnectionIssue(
          data.meta?.googleBooks === 'failed' || data.meta?.openLibrary === 'failed'
        );
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
  }, [searchQuery, activeFilter]);

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
          {/* السلة: زر يفتح/يغلق قائمة منسدلة بكتب قائمة التصدير المشتركة.
              العداد يعكس القائمة فوراً عند أي إضافة/إزالة */}
          <div
            className={styles.cartWrapper}
            ref={cartWrapperRef}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsCartOpen(false);
            }}
          >
            <button
              type="button"
              className={styles.cartIndicator}
              title={t.cartTitle}
              aria-label={t.cartTitle}
              aria-expanded={isCartOpen}
              aria-haspopup="true"
              onClick={() => setIsCartOpen((open) => !open)}
            >
              <ShoppingCart size={17} />
              <span className={styles.cartCount}>{exportQueue.length}</span>
            </button>

            {isCartOpen && (
              <div className={styles.cartDropdown}>
                <div className={styles.cartDropdownHeader}>
                  <span>{t.cartHeader}</span>
                  <span className={styles.cartDropdownBadge}>{exportQueue.length}</span>
                </div>

                {exportQueue.length === 0 ? (
                  <div className={styles.cartEmptyState}>
                    <ShoppingCart size={22} />
                    <span className={styles.cartEmptyTitle}>{t.cartEmpty}</span>
                    <span className={styles.cartEmptySub}>{t.cartEmptySub}</span>
                  </div>
                ) : (
                  <div className={styles.cartItemsList}>
                    {exportQueue.map((item) => (
                      /* البطاقة تفتح الكتاب بنفس مسار اختيار كتاب من نتائج البحث
                         (onSelectBook -> selectedBook) — والكتاب يبقى بالقائمة */
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className={styles.cartItem}
                        title={t.openQueuedBook}
                        aria-label={`${t.openQueuedBook}: ${item.title || '—'}`}
                        onClick={() => {
                          setIsCartOpen(false);
                          onSelectBook && onSelectBook(item);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsCartOpen(false);
                            onSelectBook && onSelectBook(item);
                          }
                        }}
                      >
                        <div className={styles.cartItemInfo}>
                          <span className={styles.cartItemTitle}>{item.title || '—'}</span>
                          <span className={styles.cartItemId}>
                            {item.isbn
                              ? `ISBN ${item.isbn}`
                              : item.authors?.length
                              ? item.authors.join(', ')
                              : '—'}
                          </span>
                        </div>
                        <div className={styles.cartItemActions}>
                          <button
                            type="button"
                            className={styles.cartItemRemove}
                            title={t.removeFromQueue}
                            aria-label={`${t.removeFromQueue}: ${item.title || '—'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFromQueue && onRemoveFromQueue(item.id);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={14} className={styles.cartOpenIcon} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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
                    {book.coverImage ? (
                      <img src={book.coverImage} alt={book.title} className={styles.bookCover} />
                    ) : (
                      <div className={`${styles.bookCover} ${styles.bookCoverEmpty}`} role="img" aria-label={t.coverUnavailable}>
                        <ImageOff size={28} />
                      </div>
                    )}
                    <div className={styles.bookDetails}>
                      <h4 className={styles.bookTitle}>{book.title}</h4>
                      <p className={styles.bookAuthor}>
                        {/* التطبيع صار بالسيرفر بعلامة إنجليزية موحّدة — الترجمة هنا وقت العرض */}
                        {book.authors?.length
                          ? book.authors
                              .map((a) => (a === 'Unknown Author' ? t.unknownAuthor : a))
                              .join(', ')
                          : t.unknownAuthor}
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

      {/* 4. نافذة المسح: اختيار صريح بين الكاميرا والماسح الخارجي */}
      {isScannerOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} role="dialog" aria-modal="true" aria-label={t.scanTitle}>
            <div className={styles.modalHeader}>
              <h3>{t.scanTitle}</h3>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label={t.scanClose}
                onClick={() => setIsScannerOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* اختيار طريقة المسح — تبديل حر بين الطريقتين بلا إغلاق النافذة */}
            <div className={styles.scanMethodTabs} role="group" aria-label={t.scanTitle}>
              <button
                type="button"
                aria-pressed={scannerMode === 'camera'}
                className={`${styles.scanMethodBtn} ${scannerMode === 'camera' ? styles.scanMethodBtnActive : ''}`}
                onClick={() => setScannerMode('camera')}
              >
                <Camera size={16} />
                <span>{t.scanMethodCamera}</span>
              </button>
              <button
                type="button"
                aria-pressed={scannerMode === 'external'}
                className={`${styles.scanMethodBtn} ${scannerMode === 'external' ? styles.scanMethodBtnActive : ''}`}
                onClick={() => setScannerMode('external')}
              >
                <Keyboard size={16} />
                <span>{t.scanMethodExternal}</span>
              </button>
            </div>

            {scannerMode === 'camera' ? (
              <>
                {cameraStatus !== 'error' && <p className={styles.scanHint}>{t.scanCameraHint}</p>}

                {cameraStatus === 'starting' && (
                  <div className={styles.scanStatusRow}>
                    <Loader2 size={16} className={styles.spinner} />
                    <span>{t.scanCameraStarting}</span>
                  </div>
                )}

                {cameraStatus === 'error' && (
                  <div className={styles.scanErrorBox}>
                    <p className={styles.scanErrorText}>{t.scanCameraError}</p>
                    <button
                      type="button"
                      className={styles.scanFallbackBtn}
                      onClick={() => setScannerMode('external')}
                    >
                      <Keyboard size={15} />
                      <span>{t.scanUseExternal}</span>
                    </button>
                  </div>
                )}

                {/* حاوية بث الكاميرا — html5-qrcode يركّب الفيديو هنا */}
                <div
                  id="camera-reader"
                  className={styles.scannerBox}
                  style={cameraStatus === 'error' ? { display: 'none' } : undefined}
                ></div>
              </>
            ) : (
              <div className={styles.externalScanWrap}>
                <p className={styles.scanHint}>{t.scanExternalHint}</p>
                <input
                  ref={externalInputRef}
                  type="text"
                  className={styles.externalScanInput}
                  placeholder={t.scanExternalPlaceholder}
                  value={externalScanValue}
                  onChange={(e) => setExternalScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    // الماسحات الخارجية ترسل Enter بعد الباركود — واليدوي كذلك
                    if (e.key === 'Enter') handleScanResult(externalScanValue);
                  }}
                  aria-label={t.scanExternalPlaceholder}
                />
                <div className={styles.scanWaitingRow} aria-live="polite">
                  <span className={styles.scanWaitingDot} aria-hidden="true" />
                  <span>{t.scanWaiting}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. الفوتر */}
      <div className={styles.footer}>{t.footer}</div>
    </div>
  );
};

export default InstantBookLookup;