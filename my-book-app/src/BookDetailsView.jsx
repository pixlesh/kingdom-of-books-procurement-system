import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Search, Sun, Moon, ExternalLink,
  PlusCircle, FileSpreadsheet, Trash2, Save, Loader2,
  Lock, AlertTriangle, ShoppingCart, Flag, ChevronRight, ImageOff
} from 'lucide-react';
import {
  exportQueueToExcel, digitsOnly, GENRE_OPTIONS,
  findGenreOption, validateBookDraft, computeVatBreakdown
} from './bookModel';
import styles from './BookDetailsView.module.css';

// 🌐 القاموس المترجم للواجهة الثانية
const translations = {
  EN: {
    back: 'Back',
    searchPlaceholder: 'Search for another book...',
    searchBtn: 'Search',
    coreFields: 'Parsed System Core Fields',
    labels: {
      title: 'BOOK TITLE',
      description: 'BOOK DESCRIPTION',
      author: 'AUTHOR NAME',
      isbn: 'ISBN / BARCODE',
      pageCount: 'PAGE COUNT',
      releaseYear: 'RELEASE YEAR',
      genre: 'BOOK GENRE',
      edition: 'EDITION NUMBER (OPTIONAL)',
      price: 'PRICE BEFORE VAT (SAR)',
      coverUrl: 'COVER IMAGE URL',
    },
    sourceBadge: 'SOURCE DATA',
    sourceBadgeTitle: 'Fixed field from the data source — cannot be edited manually',
    missingSource: 'Missing source data — needs review',
    vatLabel: 'VAT (15%)',
    finalPriceLabel: 'Final Price (Incl. VAT)',
    interventionLabel: 'Human review required',
    interventionLabelOff: 'No review required',
    interventionOn: 'ON',
    interventionOff: 'OFF',
    interventionBanner: 'This book is flagged: its data is suspicious or uncertain and requires manual review.',
    flaggedShort: 'Needs review',
    openQueuedBook: 'Open book details',
    removeFromQueue: 'Remove from queue',
    cartTitle: 'Books in export queue',
    selectGenre: 'Select genre...',
    openImage: 'Open Direct Image Link',
    highRes: 'Image Quality: High Resolution',
    coverUnavailable: 'Cover unavailable',
    addToCart: 'Add to Cart',
    exportQueue: 'Procurement Export Queue',
    exportExcel: 'Export to Excel (.xlsx)',
    exportChooseTemplate: 'Choose export template',
    exportArabicTemplate: 'Arabic Template',
    exportEnglishTemplate: 'English Template',
    exporting: 'Exporting...',
    exportSuccess: 'File downloaded:',
    exportError: 'Export failed. Please try again.',
    exportEmpty: 'The export queue is empty — add books first.',
    standardFormat: 'Standard procurement format',
    items: 'items',
    pages: 'pages',
    saveChanges: 'Save Changes',
    errors: {
      required: 'This field is required',
      digitsOnly: 'Digits only',
      positiveNumber: 'Must be a positive number',
      fourDigits: 'Exactly 4 digits (e.g. 2026)',
      httpsRequired: 'Must start with https://',
      invalidOption: 'Choose an approved category from the list',
    },
    legacyGenre: 'Unapproved previous category:',
    discardTitle: 'Discard unsaved changes?',
    discardMessage: "You've made changes to this book that haven't been saved yet. Leaving this screen will discard them.",
    keepEditing: 'Keep Editing',
    discardChanges: 'Discard Changes',
  },
  AR: {
    back: 'رجوع',
    searchPlaceholder: 'ابحث عن كتاب آخر...',
    searchBtn: 'بحث',
    coreFields: 'البيانات الأساسية للنظام',
    labels: {
      title: 'عنوان الكتاب',
      description: 'نبذة عن الكتاب',
      author: 'اسم المؤلف',
      isbn: 'الرقم المعياري / الباركود',
      pageCount: 'عدد الصفحات',
      releaseYear: 'سنة النشر',
      genre: 'تصنيف الكتاب',
      edition: 'الطبعة / الإصدار (اختياري)',
      price: 'السعر قبل الضريبة (ر.س)',
      coverUrl: 'رابط صورة الغلاف',
    },
    sourceBadge: 'بيانات المصدر',
    sourceBadgeTitle: 'حقل ثابت من مصدر البيانات — لا يمكن تعديله يدوياً',
    missingSource: 'بيانات المصدر ناقصة — تحتاج مراجعة',
    vatLabel: 'ضريبة القيمة المضافة (15%)',
    finalPriceLabel: 'السعر النهائي (شامل الضريبة)',
    interventionLabel: 'يتطلب تدخلاً بشرياً',
    interventionLabelOff: 'لا يحتاج مراجعة',
    interventionOn: 'مفعّل',
    interventionOff: 'متوقف',
    interventionBanner: 'هذا الكتاب معلَّم: بياناته مشكوك فيها أو غير مؤكدة وتحتاج مراجعة يدوية.',
    flaggedShort: 'يحتاج مراجعة',
    openQueuedBook: 'فتح تفاصيل الكتاب',
    removeFromQueue: 'إزالة من القائمة',
    cartTitle: 'عدد الكتب في قائمة التصدير',
    selectGenre: 'اختر التصنيف...',
    openImage: 'فتح رابط الصورة المباشر',
    highRes: 'دقة الصورة: عالية الجودة',
    coverUnavailable: 'الغلاف غير متوفر',
    addToCart: 'إضافة إلى السلة',
    exportQueue: 'قائمة التصدير والشراء',
    exportExcel: 'تصدير إلى إكسل (.xlsx)',
    exportChooseTemplate: 'اختر قالب التصدير',
    exportArabicTemplate: 'القالب العربي',
    exportEnglishTemplate: 'القالب الإنجليزي',
    exporting: 'جاري إنشاء الملف...',
    exportSuccess: 'تم تنزيل الملف:',
    exportError: 'فشل التصدير. حاول مرة أخرى.',
    exportEmpty: 'قائمة التصدير فاضية — أضف كتباً أولاً.',
    standardFormat: 'الصيغة القياسية لطلبات الشراء',
    items: 'عناصر',
    pages: 'صفحة',
    saveChanges: 'حفظ التعديلات',
    errors: {
      required: 'هذا الحقل مطلوب',
      digitsOnly: 'أرقام فقط',
      positiveNumber: 'يجب أن يكون رقماً موجباً',
      fourDigits: 'أربعة أرقام فقط (مثال: 2026)',
      httpsRequired: 'يجب أن يبدأ الرابط بـ https://',
      invalidOption: 'اختر تصنيفاً معتمداً من القائمة',
    },
    legacyGenre: 'التصنيف السابق غير معتمد:',
    discardTitle: 'تجاهل التعديلات غير المحفوظة؟',
    discardMessage: 'قمت بتعديل بيانات هذا الكتاب ولم تُحفظ بعد. مغادرة هذه الشاشة ستؤدي إلى فقدانها.',
    keepEditing: 'متابعة التعديل',
    discardChanges: 'تجاهل التعديلات',
  }
};

// يبني نموذج تعديل (Draft) من كائن الكتاب الموحّد — نصوص خام مناسبة لحقول الإدخال
const buildDraftFromBook = (book) => ({
  title: book?.title || '',
  description: book?.description || '',
  authorsText: book?.authors ? book.authors.join(', ') : '',
  isbn: book?.isbn || '',
  pageCount: book?.pageCount ? String(book.pageCount) : '',
  price: book?.price != null ? String(book.price) : '',
  publishedYear: book?.publishedYear != null ? String(book.publishedYear) : '',
  coverImage: book?.coverImage || '',
  // التصنيف قائمة محكومة: تسمية قديمة معتمدة (عربية/إنجليزية) تُطبَّع
  // لمعرّفها الثابت؛ قيمة غير معتمدة تترك الاختيار فاضياً — الكتاب نفسه
  // يحتفظ بقيمته القديمة حتى يحفظ المستخدم اختياراً معتمداً (لا حذف بصمت)
  genre: findGenreOption(book?.genre)?.id || '',
  edition: book?.edition || '',
  humanIntervention: Boolean(book?.humanIntervention),
});

// يبني كائن التحقق من نموذج التعديل — بنفس الشكل اللي تتوقعه validateBookDraft
const buildCandidate = (draft) => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  authors: draft.authorsText,
  isbn: digitsOnly(draft.isbn),
  pageCount: draft.pageCount,
  price: draft.price,
  publishedYear: draft.publishedYear,
  coverImage: draft.coverImage.trim(),
  genre: draft.genre,
  edition: draft.edition.trim(),
});

/**
 * حقول المصدر الثابتة (للعرض فقط) — قرار عمل مؤكد: بيانات المصدر ما تُعدَّل
 * يدوياً أبداً. مفاتيح الأخطاء تطابق مفاتيح validateBookDraft، ونقصها يظهر
 * كتنبيه دائم (مو خطأ يوقف الحفظ) لأن المستخدم ما يملك تصحيحها من الواجهة —
 * علم "التدخل البشري" هو أداة معالجتها.
 */
const SOURCE_FIELDS = [
  { draftKey: 'title', errorKey: 'title', labelKey: 'title', fullWidth: true, emphasize: true },
  { draftKey: 'description', errorKey: 'description', labelKey: 'description', fullWidth: true, multiline: true },
  { draftKey: 'authorsText', errorKey: 'authors', labelKey: 'author' },
  { draftKey: 'isbn', errorKey: 'isbn', labelKey: 'isbn' },
  { draftKey: 'pageCount', errorKey: 'pageCount', labelKey: 'pageCount' },
  { draftKey: 'publishedYear', errorKey: 'publishedYear', labelKey: 'releaseYear' },
  { draftKey: 'coverImage', errorKey: 'coverImage', labelKey: 'coverUrl', fullWidth: true },
];

// الحقول اليدوية الوحيدة — أخطاؤها فقط توقف الحفظ (الطبعة اختيارية بلا تحقق)
const EDITABLE_ERROR_KEYS = ['price', 'genre'];

// تنسيق عملة الريال السعودي — أرقام لاتينية بالحالتين لاتساقها مع باقي الواجهة
const formatCurrency = (value, lang) =>
  new Intl.NumberFormat(lang === 'AR' ? 'ar-SA-u-nu-latn' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const BookDetailsView = ({
  book,
  onBack,
  onSearch,
  onOpenBook,
  lang = 'EN',
  theme = 'dark',
  onToggleTheme,
  onToggleLang,
  exportQueue = [],
  onAddToQueue,
  onRemoveFromQueue,
  onSaveBook,
}) => {
  const t = translations[lang] || translations.EN;

  // نموذج التعديل المحلي — لا يمس كائن الكتاب المشترك إلا بعد الضغط على "حفظ"
  const [draft, setDraft] = useState(() => buildDraftFromBook(book));
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // بحث الشريط العلوي — يرجع لشاشة البحث بنفس تدفق البحث الموجود (ما فيه
  // مسار API جديد). لو فيه تعديلات غير محفوظة، حوار التجاهل يحمي أولاً.
  const [miniQuery, setMiniQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState(null);

  // كتاب من قائمة التصدير بانتظار الفتح — لما يكون فيه تعديلات غير محفوظة،
  // حوار التجاهل نفسه يحمي قبل التبديل (نفس حماية الرجوع والبحث)
  const [pendingQueuedBook, setPendingQueuedBook] = useState(null);

  // حالة التصدير المرئية — محلية للشاشة عمداً (مثل حالة الرفع بشاشة البحث):
  // idle | exporting | success | error | empty
  const [exportStatus, setExportStatus] = useState('idle');
  const [exportedFileName, setExportedFileName] = useState('');
  // قائمة اختيار قالب التصدير (عربي/إنجليزي) — اختيار صريح من المستخدم،
  // مستقل تماماً عن لغة واجهة التطبيق الحالية. حالة عرض محلية فقط.
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const dismissTimerRef = useRef(null);
  // حارس متزامن ضد النقرات المتتالية بنفس اللحظة — حالة React تُطبَّق بعد
  // إعادة الرندر، فنقرتان سريعتان تقرآن قيمة قديمة؛ الـ ref يصد ذلك فوراً
  const isExportingRef = useRef(false);

  // تنظيف مؤقّت إخفاء البانر عند مغادرة الشاشة — بلا تحديث حالة بعد الإزالة
  useEffect(() => () => clearTimeout(dismissTimerRef.current), []);

  // إغلاق قائمة اختيار القالب عند النقر خارجها (نفس نمط قائمة السلة بشاشة البحث)
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutsideClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isExportMenuOpen]);

  // عند التنقل لكتاب مختلف: إعادة بناء نموذج التعديل من جديد.
  // نمط "تعديل الحالة أثناء الرندر" الموصى به من React بدل useEffect،
  // لتفادي دورة رندر إضافية غير ضرورية.
  const [trackedBookId, setTrackedBookId] = useState(book?.id);
  if (book?.id !== trackedBookId) {
    setTrackedBookId(book?.id);
    setDraft(buildDraftFromBook(book));
    setErrors({});
    setIsDirty(false);
  }

  const handleFieldChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // تحقق حي لكل رندر: نقص حقول المصدر يظهر كتنبيه دائم على بطاقاتها
  // (مو مرتبط بمحاولة الحفظ) — "لا نسمح باعتبار قيمة مطلوبة ناقصة صحيحة"
  const liveValidation = validateBookDraft(buildCandidate(draft));
  const sourceWarnings = new Set(
    SOURCE_FIELDS.filter((f) => liveValidation[f.errorKey] != null).map((f) => f.errorKey)
  );

  // حساب الضريبة الحي — يتحدث فوراً مع كل تغيير بسعر ما قبل الضريبة
  const vatPreview = computeVatBreakdown(draft.price);

  const handleSave = () => {
    const candidate = buildCandidate(draft);
    const validationErrors = validateBookDraft(candidate);

    // الحفظ يوقفه فقط أخطاء الحقول اليدوية (السعر والتصنيف) — حقول المصدر
    // الناقصة تنبيهاتها ظاهرة دائماً ولا يملك المستخدم تصحيحها من هنا
    const blockingErrors = {};
    EDITABLE_ERROR_KEYS.forEach((key) => {
      if (validationErrors[key]) blockingErrors[key] = validationErrors[key];
    });
    if (Object.keys(blockingErrors).length > 0) {
      setErrors(blockingErrors);
      return;
    }

    const vat = computeVatBreakdown(candidate.price);

    const updatedBook = {
      ...book,
      title: candidate.title,
      description: candidate.description,
      authors: candidate.authors.split(',').map((a) => a.trim()).filter(Boolean),
      isbn: candidate.isbn,
      pageCount: candidate.pageCount !== '' ? Number(candidate.pageCount) : 0,
      price: candidate.price !== '' ? Number(candidate.price) : null,
      priceIncludingVat: vat ? vat.total : null,
      publishedYear: candidate.publishedYear !== '' ? Number(candidate.publishedYear) : null,
      // غلاف حقيقي فقط — لا صورة بديلة تُحفظ أو تُصدَّر أبداً؛ المفقود يبقى '' بصدق
      coverImage: candidate.coverImage || '',
      genre: candidate.genre,
      edition: candidate.edition,
      humanIntervention: draft.humanIntervention,
    };

    setErrors({});
    setIsDirty(false);
    onSaveBook && onSaveBook(updatedBook);
  };

  const handleBackClick = () => {
    if (isDirty) {
      setPendingSearch(null);
      setPendingQueuedBook(null);
      setShowDiscardDialog(true);
    } else {
      onBack();
    }
  };

  const handleSearchSubmit = () => {
    const query = miniQuery.trim();
    if (!query) return;
    if (isDirty) {
      setPendingSearch(query);
      setPendingQueuedBook(null);
      setShowDiscardDialog(true);
      return;
    }
    if (onSearch) onSearch(query);
  };

  // فتح كتاب من قائمة التصدير للمراجعة — الفتح للعرض فقط، ما يمس القائمة:
  // الكتاب يبقى بالقائمة، والإزالة تبقى عبر زر الحذف الصريح وحده
  const openQueuedBook = (item) => {
    if (!onOpenBook) return;
    if (isDirty) {
      setPendingQueuedBook(item);
      setPendingSearch(null);
      setShowDiscardDialog(true);
      return;
    }
    onOpenBook(item);
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    if (pendingSearch && onSearch) {
      const query = pendingSearch;
      setPendingSearch(null);
      onSearch(query);
    } else if (pendingQueuedBook && onOpenBook) {
      const target = pendingQueuedBook;
      setPendingQueuedBook(null);
      // إعادة بناء النموذج صراحةً: لو الكتاب المفتوح هو نفسه المضغوط عليه
      // (نفس الـ id)، آلية trackedBookId ما راح تلاحظ تغييراً — فنتجاهل
      // المسودة يدوياً عشان "تجاهل التعديلات" يصدق بكل الحالات
      setDraft(buildDraftFromBook(target));
      setErrors({});
      setIsDirty(false);
      onOpenBook(target);
    } else {
      setPendingSearch(null);
      onBack();
    }
  };

  // معاينة حية للغلاف من نموذج التعديل (state محلي فقط، ما يمس الكتاب المشترك)
  // فاضي = ما فيه غلاف حقيقي من أي مصدر — تُعرض حالة "الغلاف غير متوفر"
  // الصريحة بدل أي صورة بديلة (لا Unsplash ولا أي صورة أخرى مطلقاً)
  const previewCoverImage = draft.coverImage.trim();

  const handleAddToCart = () => {
    if (book && onAddToQueue) onAddToQueue(book);
  };

  const handleRemoveItem = (id) => {
    if (onRemoveFromQueue) onRemoveFromQueue(id);
  };

  // زر التصدير يفتح قائمة اختيار القالب — التصدير الفعلي يبدأ فقط بعد
  // اختيار المستخدم الصريح للقالب (عربي/إنجليزي)
  const handleExportButtonClick = () => {
    if (isExportingRef.current) return;
    setIsExportMenuOpen((open) => !open);
  };

  // تصدير قائمة الشراء بالقالب الرسمي المختار (ينزّله المتصفح مباشرة).
  const handleExport = async (templateLang) => {
    if (isExportingRef.current) return; // حماية من النقر المزدوج/المتكرر
    isExportingRef.current = true;

    setIsExportMenuOpen(false);
    clearTimeout(dismissTimerRef.current);
    setExportStatus('exporting');

    try {
      const result = await exportQueueToExcel(exportQueue, templateLang);
      setExportedFileName(result.fileName);
      setExportStatus('success');
    } catch (err) {
      if (err.message === 'EMPTY_QUEUE') {
        // قاعدة "القائمة الفاضية" تعيش بدالة التصدير وحدها — الواجهة تترجمها فقط
        setExportStatus('empty');
      } else {
        console.warn('Export failed:', err.message);
        setExportStatus('error');
      }
    } finally {
      isExportingRef.current = false;
    }

    dismissTimerRef.current = setTimeout(() => setExportStatus('idle'), 4000);
  };

  // بطاقة حقل مصدر ثابت (للعرض فقط): شارة قفل + تنبيه دائم عند نقص البيانات
  const renderSourceField = ({ draftKey, errorKey, labelKey, fullWidth, multiline, emphasize }) => {
    const value = draft[draftKey];
    const isMissing = sourceWarnings.has(errorKey);
    return (
      <div
        key={draftKey}
        className={`${styles.fieldCard} ${styles.readonlyCard} ${fullWidth ? styles.fullWidth : ''} ${isMissing ? styles.fieldCardMissing : ''}`}
      >
        <div className={styles.fieldLabelRow}>
          <label>{t.labels[labelKey]}</label>
          <span className={styles.sourceBadge} title={t.sourceBadgeTitle}>
            <Lock size={10} />
            {t.sourceBadge}
          </span>
        </div>
        <div
          className={`${styles.readonlyValue} ${multiline ? styles.readonlyMultiline : ''} ${emphasize ? styles.readonlyTitle : ''}`}
        >
          {value || '—'}
        </div>
        {isMissing && (
          <p className={styles.fieldWarningText}>
            <AlertTriangle size={12} />
            <span>{t.missingSource}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div
      className={`${styles.container} ${theme === 'light' ? styles.lightTheme : ''}`}
      dir={lang === 'AR' ? 'rtl' : 'ltr'}
    >
      {/* 1. الشريط العلوي */}
      <div className={styles.topBar}>
        <div className={styles.leftGroup}>
          <button type="button" className={styles.backBtn} onClick={handleBackClick}>
            <ArrowLeft size={18} className={styles.backIcon} />
          </button>
          <div className={styles.brand}>
            <span className={styles.brandTitle}>Instant Book Look-up</span>
            <span className={styles.brandSubtitle}>METADATA CONSOLE</span>
          </div>
        </div>

        {/* البحث متاح دائماً من الشريط العلوي — يعيد المستخدم لتدفق البحث الحالي */}
        <div className={styles.searchBarWrapper}>
          <Search size={16} color="#8b949e" />
          <input
            type="text"
            className={styles.miniSearchInput}
            placeholder={t.searchPlaceholder}
            value={miniQuery}
            onChange={(e) => setMiniQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearchSubmit();
            }}
          />
          <button type="button" className={styles.searchSubmitBtn} onClick={handleSearchSubmit}>
            {t.searchBtn}
          </button>
        </div>

        <div className={styles.rightActions}>
          {/* عداد السلة — يقرأ مباشرة من قائمة التصدير المشتركة بمستوى التطبيق */}
          <div className={styles.cartIndicator} title={t.cartTitle} aria-label={t.cartTitle}>
            <ShoppingCart size={17} />
            <span className={styles.cartCount}>{exportQueue.length}</span>
          </div>

          {/* نفس بنية وستايل مبدّل اللغة بشاشة البحث (المرجع البصري) —
              مربع منزلق + نص فعّال، بلا أي تغيير بسلوك التبديل */}
          <div className={styles.langToggle}>
            <div
              className={`${styles.langSlider} ${lang === 'AR' ? styles.slideAr : styles.slideEn}`}
            />
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'AR' ? styles.activeText : ''}`}
              onClick={() => onToggleLang('AR')}
            >
              AR
            </button>
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'EN' ? styles.activeText : ''}`}
              onClick={() => onToggleLang('EN')}
            >
              EN
            </button>
          </div>

          <button type="button" className={styles.themeToggle} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={18} color="#8b949e" /> : <Moon size={18} color="#00bfa5" />}
          </button>
        </div>
      </div>

      {/* 2. تخطيط الصفحة الرئيسي (3 أعمدة) */}
      <div className={styles.mainLayout}>
        {/* العمود الأيسر: غلاف الكتاب والإجراءات */}
        <div className={styles.leftColumn}>
          <div className={styles.coverCard}>
            {previewCoverImage ? (
              <img src={previewCoverImage} alt={draft.title || book?.title} className={styles.coverImg} />
            ) : (
              <div className={styles.coverUnavailable} role="img" aria-label={t.coverUnavailable}>
                <ImageOff size={32} />
                <span>{t.coverUnavailable}</span>
              </div>
            )}
          </div>

          {previewCoverImage && (
            <a
              href={previewCoverImage}
              target="_blank"
              rel="noreferrer"
              className={styles.openLinkBtn}
            >
              <ExternalLink size={16} />
              <span>{t.openImage}</span>
            </a>
          )}

          {previewCoverImage && <span className={styles.highResBadge}>★ {t.highRes}</span>}

          <button type="button" className={styles.addToCartBtn} onClick={handleAddToCart}>
            <PlusCircle size={18} />
            <span>{t.addToCart}</span>
          </button>
        </div>

        {/* العمود الأوسط: البيانات التفصيلية */}
        <div className={styles.middleColumn}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderRow}>
              <div>
                <span className={styles.indexedMatch}>INDEXED RECORD MATCHES</span>
                <h2 className={styles.coreFieldsTitle}>{t.coreFields}</h2>
              </div>

              {/* مفتاح المراجعة البشرية — تشغيل/إيقاف صريح بمسار وقرص متحركين،
                  جزء من نموذج التعديل ويُحفظ مع الكتاب */}
              <button
                type="button"
                role="switch"
                aria-checked={draft.humanIntervention}
                className={`${styles.interventionToggle} ${draft.humanIntervention ? styles.interventionToggleOn : ''}`}
                onClick={() => handleFieldChange('humanIntervention', !draft.humanIntervention)}
              >
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.switchKnob} />
                </span>
                <span className={styles.switchStateWord}>
                  {draft.humanIntervention ? t.interventionOn : t.interventionOff}
                </span>
                <Flag size={14} />
                <span>{draft.humanIntervention ? t.interventionLabel : t.interventionLabelOff}</span>
              </button>
            </div>

            {draft.humanIntervention && (
              <div className={styles.interventionBanner}>
                <AlertTriangle size={16} />
                <span>{t.interventionBanner}</span>
              </div>
            )}
          </div>

          <div className={styles.fieldsGrid}>
            {/* حقول المصدر الثابتة — للعرض فقط */}
            {SOURCE_FIELDS.map(renderSourceField)}

            {/* الحقول اليدوية: التصنيف، الطبعة (اختياري)، والسعر مع حساب الضريبة */}
            <div className={styles.fieldCard}>
              <label>{t.labels.genre}</label>
              {/* قائمة محكومة فقط — القيمة المخزنة معرّف ثابت (id) لا يتأثر
                  بلغة الواجهة؛ التسميات المعروضة تتبع لغة الواجهة الحالية */}
              <select
                className={`${styles.fieldSelect} ${errors.genre ? styles.fieldSelectError : ''}`}
                value={draft.genre}
                onChange={(e) => handleFieldChange('genre', e.target.value)}
              >
                <option value="">{t.selectGenre}</option>
                {GENRE_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>{lang === 'AR' ? g.ar : g.en}</option>
                ))}
              </select>
              {/* قيمة قديمة غير معتمدة على الكتاب المخزَّن — ظاهرة للمراجعة،
                  لا تُستبدل بصمت؛ تختفي بمجرد اختيار تصنيف معتمد */}
              {!draft.genre && book?.genre && !findGenreOption(book.genre) && (
                <p className={styles.fieldWarningText}>
                  <AlertTriangle size={12} />
                  <span>{t.legacyGenre} "{book.genre}"</span>
                </p>
              )}
              {errors.genre && (
                <p className={styles.fieldErrorText}>
                  <AlertTriangle size={12} />
                  <span>{t.errors[errors.genre]}</span>
                </p>
              )}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.edition}</label>
              <input
                type="text"
                className={styles.fieldInput}
                value={draft.edition}
                onChange={(e) => handleFieldChange('edition', e.target.value)}
              />
            </div>

            <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
              <label>{t.labels.price}</label>
              <input
                type="text"
                inputMode="decimal"
                className={`${styles.fieldInput} ${errors.price ? styles.fieldError : ''}`}
                value={draft.price}
                onChange={(e) => handleFieldChange('price', e.target.value)}
              />
              {errors.price && (
                <p className={styles.fieldErrorText}>
                  <AlertTriangle size={12} />
                  <span>{t.errors[errors.price]}</span>
                </p>
              )}

              {/* تفاصيل الضريبة — تُحسب آلياً وفوراً، ولا تُدخل يدوياً أبداً */}
              <div className={styles.vatBreakdown}>
                <div className={styles.vatRow}>
                  <span>{t.vatLabel}</span>
                  <span className={styles.vatValue}>
                    {vatPreview ? formatCurrency(vatPreview.vat, lang) : '—'}
                  </span>
                </div>
                <div className={`${styles.vatRow} ${styles.vatTotalRow}`}>
                  <span>{t.finalPriceLabel}</span>
                  <span className={styles.vatTotalValue}>
                    {vatPreview ? formatCurrency(vatPreview.total, lang) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.saveMetadataBtn}
            onClick={handleSave}
            disabled={!isDirty}
          >
            <Save size={16} />
            <span>{t.saveChanges}</span>
          </button>

        </div>

        {/* العمود الأيمن: قائمة التصدير Excel */}
        <div className={styles.rightColumn}>
          <div className={styles.queueHeader}>
            <h3>{t.exportQueue}</h3>
            <span className={styles.badgeItems}>{exportQueue.length} {t.items}</span>
          </div>

          <div className={styles.queueList}>
            {exportQueue.map((item) => {
              return (
                /* البطاقة كلها قابلة للنقر لفتح تفاصيل الكتاب المحفوظة —
                   زر الإزالة يوقف انتشار النقرة عشان الحذف يبقى فعلاً صريحاً */
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={styles.queueCard}
                  title={t.openQueuedBook}
                  aria-label={`${t.openQueuedBook}: ${item.title || '—'}`}
                  onClick={() => openQueuedBook(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openQueuedBook(item);
                    }
                  }}
                >
                  <div className={styles.queueDetails}>
                    <h4 className={styles.queueTitle}>{item.title || '—'}</h4>
                    <p className={styles.queueAuthor}>
                      {item.authors ? item.authors.join(', ') : '—'}
                    </p>
                    {item.humanIntervention && (
                      <span className={styles.queueFlag}>
                        <AlertTriangle size={11} />
                        <span>{t.flaggedShort}</span>
                      </span>
                    )}
                  </div>
                  <div className={styles.queueItemActions}>
                    <button
                      type="button"
                      className={styles.removeItemBtn}
                      title={t.removeFromQueue}
                      aria-label={`${t.removeFromQueue}: ${item.title || '—'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(item.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    {/* سهم "افتح" — إشارة شكلية (مو لونية) أن البطاقة قابلة للنقر */}
                    <ChevronRight size={15} className={styles.queueOpenIcon} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.queueFooter}>
            {exportStatus === 'success' && (
              <div className={`${styles.exportBanner} ${styles.exportBannerSuccess}`}>
                {t.exportSuccess} {exportedFileName}
              </div>
            )}
            {exportStatus === 'error' && (
              <div className={`${styles.exportBanner} ${styles.exportBannerError}`}>
                {t.exportError}
              </div>
            )}
            {exportStatus === 'empty' && (
              <div className={`${styles.exportBanner} ${styles.exportBannerWarning}`}>
                {t.exportEmpty}
              </div>
            )}
            {/* زر التصدير + قائمة اختيار القالب (تفتح للأعلى فوق الزر).
                الاختيار صريح دائماً — لا نستنتج القالب من لغة الواجهة */}
            <div
              className={styles.exportMenuWrapper}
              ref={exportMenuRef}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsExportMenuOpen(false);
              }}
            >
              {isExportMenuOpen && (
                <div className={styles.exportMenu} role="menu" aria-label={t.exportChooseTemplate}>
                  <div className={styles.exportMenuTitle}>{t.exportChooseTemplate}</div>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.exportMenuItem}
                    onClick={() => handleExport('AR')}
                  >
                    {t.exportArabicTemplate}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.exportMenuItem}
                    onClick={() => handleExport('EN')}
                  >
                    {t.exportEnglishTemplate}
                  </button>
                </div>
              )}
              <button
                type="button"
                className={styles.exportExcelBtn}
                onClick={handleExportButtonClick}
                disabled={exportStatus === 'exporting'}
                aria-haspopup="menu"
                aria-expanded={isExportMenuOpen}
              >
                {exportStatus === 'exporting' ? (
                  <Loader2 size={18} className={styles.spinner} />
                ) : (
                  <FileSpreadsheet size={18} />
                )}
                <span>{exportStatus === 'exporting' ? t.exporting : t.exportExcel}</span>
              </button>
            </div>
            <span className={styles.standardText}>{t.standardFormat}</span>
          </div>
        </div>
      </div>

      {/* 3. حوار تأكيد تجاهل التعديلات غير المحفوظة (رجوع أو بحث جديد) */}
      {showDiscardDialog && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>{t.discardTitle}</h3>
            </div>
            <p className={styles.discardMessage}>{t.discardMessage}</p>
            <div className={styles.discardActions}>
              <button
                type="button"
                className={styles.discardCancelBtn}
                onClick={() => {
                  setShowDiscardDialog(false);
                  setPendingSearch(null);
                }}
              >
                {t.keepEditing}
              </button>
              <button
                type="button"
                className={styles.discardConfirmBtn}
                onClick={handleConfirmDiscard}
              >
                {t.discardChanges}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. الفوتر */}
      <div className={styles.footer}>
        Kingdom of Books — Metadata View v2.1
      </div>
    </div>
  );
};

export default BookDetailsView;
