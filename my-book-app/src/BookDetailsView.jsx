import { useState } from 'react';
import {
  ArrowLeft, Search, Sun, Moon, ExternalLink,
  PlusCircle, CheckCircle2, FileSpreadsheet, Trash2, Save
} from 'lucide-react';
import { FALLBACK_COVER, exportQueueToExcelMock, digitsOnly, GENRE_OPTIONS, validateBookDraft } from './bookModel';
import styles from './BookDetailsView.module.css';

// 🌐 القاموس المترجم للواجهة الثانية
const translations = {
  EN: {
    back: 'Back',
    searchPlaceholder: 'Search ISBN...',
    coreFields: 'Parsed System Core Fields',
    labels: {
      title: 'BOOK TITLE',
      author: 'AUTHOR NAME',
      isbn: 'ISBN / BARCODE',
      pageCount: 'PAGE COUNT',
      releaseYear: 'RELEASE YEAR',
      genre: 'BOOK GENRE',
      edition: 'EDITION NUMBER',
      price: 'PRICE (INCL. TAX)',
      coverUrl: 'COVER IMAGE URL',
    },
    selectGenre: 'Select genre...',
    openImage: 'Open Direct Image Link',
    highRes: 'Image Quality: High Resolution',
    checksum: 'Source database validation successful. Query matches standard.',
    addToCart: 'Add to Cart',
    exportQueue: 'Procurement Export Queue',
    exportExcel: 'Export to Excel (.xlsx)',
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
    },
    discardTitle: 'Discard unsaved changes?',
    discardMessage: "You've made changes to this book that haven't been saved yet. Going back will discard them.",
    keepEditing: 'Keep Editing',
    discardChanges: 'Discard Changes',
  },
  AR: {
    back: 'رجوع',
    searchPlaceholder: 'بحث برقم ISBN...',
    coreFields: 'البيانات الأساسية للنظام',
    labels: {
      title: 'عنوان الكتاب',
      author: 'اسم المؤلف',
      isbn: 'الرقم المعياري / الباركود',
      pageCount: 'عدد الصفحات',
      releaseYear: 'سنة النشر',
      genre: 'تصنيف الكتاب',
      edition: 'الطبعة / الإصدار',
      price: 'السعر (شامل الضريبة)',
      coverUrl: 'رابط صورة الغلاف',
    },
    selectGenre: 'اختر التصنيف...',
    openImage: 'فتح رابط الصورة المباشر',
    highRes: 'دقة الصورة: عالية الجودة',
    checksum: 'تم التحقق من قاعدة البيانات بنجاح. الاستعلام مطابق للمعيار.',
    addToCart: 'إضافة إلى السلة',
    exportQueue: 'قائمة التصدير والشراء',
    exportExcel: 'تصدير إلى إكسل (.xlsx)',
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
    },
    discardTitle: 'تجاهل التعديلات غير المحفوظة؟',
    discardMessage: 'قمت بتعديل بيانات هذا الكتاب ولم تُحفظ بعد. الرجوع سيؤدي إلى فقدانها.',
    keepEditing: 'متابعة التعديل',
    discardChanges: 'تجاهل التعديلات',
  }
};

// يبني نموذج تعديل (Draft) من كائن الكتاب الموحّد — نصوص خام مناسبة لحقول الإدخال
const buildDraftFromBook = (book) => ({
  title: book?.title || '',
  authorsText: book?.authors ? book.authors.join(', ') : '',
  isbn: book?.isbn || '',
  pageCount: book?.pageCount ? String(book.pageCount) : '',
  price: book?.price != null ? String(book.price) : '',
  publishedYear: book?.publishedYear != null ? String(book.publishedYear) : '',
  coverImage: book?.coverImage || '',
  genre: book?.genre || '',
  edition: book?.edition || '',
});

const BookDetailsView = ({
  book,
  onBack,
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

  const handleSave = () => {
    const candidate = {
      title: draft.title.trim(),
      authors: draft.authorsText,
      isbn: digitsOnly(draft.isbn),
      pageCount: draft.pageCount,
      price: draft.price,
      publishedYear: draft.publishedYear,
      coverImage: draft.coverImage.trim(),
      genre: draft.genre,
      edition: draft.edition.trim(),
    };

    const validationErrors = validateBookDraft(candidate);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const updatedBook = {
      ...book,
      title: candidate.title,
      authors: candidate.authors.split(',').map((a) => a.trim()).filter(Boolean),
      isbn: candidate.isbn,
      pageCount: candidate.pageCount !== '' ? Number(candidate.pageCount) : 0,
      price: candidate.price !== '' ? Number(candidate.price) : null,
      publishedYear: candidate.publishedYear !== '' ? Number(candidate.publishedYear) : null,
      coverImage: candidate.coverImage || FALLBACK_COVER,
      genre: candidate.genre,
      edition: candidate.edition,
    };

    setErrors({});
    setIsDirty(false);
    onSaveBook && onSaveBook(updatedBook);
  };

  const handleBackClick = () => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onBack();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    onBack();
  };

  // معاينة حية للغلاف من نموذج التعديل (state محلي فقط، ما يمس الكتاب المشترك)
  const previewCoverImage = draft.coverImage || FALLBACK_COVER;

  const handleAddToCart = () => {
    if (book && onAddToQueue) onAddToQueue(book);
  };

  const handleRemoveItem = (id) => {
    if (onRemoveFromQueue) onRemoveFromQueue(id);
  };

  // تصدير قائمة الشراء إلى إكسل — Mock حالياً، جاهز للاستبدال بمولّد حقيقي لاحقاً
  const handleExport = async () => {
    try {
      const result = await exportQueueToExcelMock(exportQueue);
      // مؤقت لحد ما تتوفر حالة تحميل/نجاح مرئية بخطوة قادمة
      console.log('Export ready (mock):', result);
    } catch (err) {
      console.warn('Export failed (mock):', err.message);
    }
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

        <div className={styles.searchBarWrapper}>
          <Search size={16} color="#8b949e" />
          <input
            type="text"
            className={styles.miniSearchInput}
            placeholder={draft.isbn || '—'}
            readOnly
          />
          <button type="button" className={styles.searchSubmitBtn}>Search</button>
        </div>

        <div className={styles.rightActions}>
          <div className={styles.langToggle}>
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'AR' ? styles.activeLang : ''}`}
              onClick={() => onToggleLang('AR')}
            >
              AR
            </button>
            <button
              type="button"
              className={`${styles.langBtn} ${lang === 'EN' ? styles.activeLang : ''}`}
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
            <img src={previewCoverImage} alt={draft.title || book?.title} className={styles.coverImg} />
          </div>

          <a
            href={previewCoverImage}
            target="_blank"
            rel="noreferrer"
            className={styles.openLinkBtn}
          >
            <ExternalLink size={16} />
            <span>{t.openImage}</span>
          </a>

          <span className={styles.highResBadge}>★ {t.highRes}</span>

          <button type="button" className={styles.addToCartBtn} onClick={handleAddToCart}>
            <PlusCircle size={18} />
            <span>{t.addToCart}</span>
          </button>
        </div>

        {/* العمود الأوسط: البيانات التفصيلية (قابلة للتعديل) */}
        <div className={styles.middleColumn}>
          <div className={styles.sectionHeader}>
            <span className={styles.indexedMatch}>INDEXED RECORD MATCHES</span>
            <h2 className={styles.coreFieldsTitle}>{t.coreFields}</h2>
          </div>

          <div className={styles.fieldsGrid}>
            <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
              <label>{t.labels.title}</label>
              <input
                type="text"
                className={`${styles.fieldInput} ${styles.fieldInputTitle} ${errors.title ? styles.fieldError : ''}`}
                value={draft.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
              />
              {errors.title && <p className={styles.fieldErrorText}>{t.errors[errors.title]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.author}</label>
              <input
                type="text"
                className={`${styles.fieldInput} ${errors.authors ? styles.fieldError : ''}`}
                value={draft.authorsText}
                onChange={(e) => handleFieldChange('authorsText', e.target.value)}
              />
              {errors.authors && <p className={styles.fieldErrorText}>{t.errors[errors.authors]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.isbn}</label>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.fieldInput} ${errors.isbn ? styles.fieldError : ''}`}
                value={draft.isbn}
                onChange={(e) => handleFieldChange('isbn', e.target.value)}
              />
              {errors.isbn && <p className={styles.fieldErrorText}>{t.errors[errors.isbn]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.pageCount}</label>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.fieldInput} ${errors.pageCount ? styles.fieldError : ''}`}
                value={draft.pageCount}
                onChange={(e) => handleFieldChange('pageCount', e.target.value)}
              />
              {errors.pageCount && <p className={styles.fieldErrorText}>{t.errors[errors.pageCount]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.releaseYear}</label>
              <input
                type="text"
                inputMode="numeric"
                className={`${styles.fieldInput} ${errors.publishedYear ? styles.fieldError : ''}`}
                value={draft.publishedYear}
                onChange={(e) => handleFieldChange('publishedYear', e.target.value)}
              />
              {errors.publishedYear && <p className={styles.fieldErrorText}>{t.errors[errors.publishedYear]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.genre}</label>
              <select
                className={styles.fieldSelect}
                value={draft.genre}
                onChange={(e) => handleFieldChange('genre', e.target.value)}
              >
                <option value="">{t.selectGenre}</option>
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
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

            <div className={styles.fieldCard}>
              <label>{t.labels.price}</label>
              <input
                type="text"
                inputMode="decimal"
                className={`${styles.fieldInput} ${errors.price ? styles.fieldError : ''}`}
                value={draft.price}
                onChange={(e) => handleFieldChange('price', e.target.value)}
              />
              {errors.price && <p className={styles.fieldErrorText}>{t.errors[errors.price]}</p>}
            </div>

            <div className={styles.fieldCard}>
              <label>{t.labels.coverUrl}</label>
              <input
                type="text"
                className={`${styles.fieldInput} ${errors.coverImage ? styles.fieldError : ''}`}
                value={draft.coverImage}
                onChange={(e) => handleFieldChange('coverImage', e.target.value)}
              />
              {errors.coverImage && <p className={styles.fieldErrorText}>{t.errors[errors.coverImage]}</p>}
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

          <div className={styles.checksumBanner}>
            <div className={styles.checksumText}>
              <CheckCircle2 size={18} color="#00bfa5" />
              <span>{t.checksum}</span>
            </div>
            <span className={styles.checksumBadge}>● CHECKSUM: PASS</span>
          </div>
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
                <div key={item.id} className={styles.queueCard}>
                  <div className={styles.queueDetails}>
                    <h4 className={styles.queueTitle}>{item.title || '—'}</h4>
                    <p className={styles.queueAuthor}>
                      {item.authors ? item.authors.join(', ') : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.removeItemBtn}
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className={styles.queueFooter}>
            <button type="button" className={styles.exportExcelBtn} onClick={handleExport}>
              <FileSpreadsheet size={18} />
              <span>{t.exportExcel}</span>
            </button>
            <span className={styles.standardText}>{t.standardFormat}</span>
          </div>
        </div>
      </div>

      {/* 3. حوار تأكيد تجاهل التعديلات غير المحفوظة */}
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
                onClick={() => setShowDiscardDialog(false)}
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
