import { useState, useEffect } from 'react';
import InstantBookLookup from './InstantBookLookup';
import BookDetailsView from './BookDetailsView';

// مفتاح تخزين قائمة التصدير — مُرقَّم بإصدار: لو تغيّر شكل الـ Book Model
// مستقبلاً نرفع الرقم لـ v2 فتُتجاهل البيانات القديمة بدل ما تُقرأ غلط.
const QUEUE_STORAGE_KEY = 'kob.exportQueue.v1';

/**
 * يسترجع قائمة التصدير من localStorage عند فتح التطبيق.
 * التدهور التدريجي بكل مستوى: فشل كامل (مفتاح مفقود/JSON فاسد/التخزين
 * نفسه معطّل) = قائمة فاضية؛ فساد جزئي = نسترجع الصالح فقط — كل عنصر
 * لازم يكون كتاباً معقولاً (id وtitle نصيّان) وغير مكرر بالـ id.
 */
function loadStoredQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return [];
    }

    const seenIds = new Set();
    return parsed.filter((entry) => {
      const isPlausibleBook =
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        entry.id !== '' &&
        typeof entry.title === 'string';
      if (!isPlausibleBook || seenIds.has(entry.id)) return false;
      seenIds.add(entry.id);
      return true;
    });
  } catch {
    // بيانات فاسدة أو تخزين غير متاح — نبدأ بجلسة نظيفة بدل الانهيار
    try {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
    } catch {
      /* التخزين نفسه غير متاح — ما فيه شيء ننظفه */
    }
    return [];
  }
}

function App() {
  // حالة الكتاب المحدد (null = الواجهة الأولى، يحتوي على كتاب = الواجهة الثانية)
  const [selectedBook, setSelectedBook] = useState(null);

  // حالة اللغة والثيم موحدة للتطبييق ككل
  const [lang, setLang] = useState('EN');
  const [theme, setTheme] = useState('dark');

  // قائمة التصدير المشتركة — عمداً هنا وليس داخل BookDetailsView، عشان تبقى
  // محفوظة أثناء التنقل بين الشاشات، ومستردّة من localStorage بين الجلسات.
  // الكتاب المحدد ومسودة التعديل لا يُخزَّنان عمداً — كل جلسة تبدأ من شاشة البحث.
  const [exportQueue, setExportQueue] = useState(loadStoredQueue);

  // كتابة تلقائية عند أي تغيير بالقائمة (إضافة/إزالة/مزامنة حفظ) — فشل
  // التخزين (امتلاء/تعطيل) ما يكسر القائمة بالذاكرة، فقط يوقف الاستمرارية.
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(exportQueue));
    } catch {
      /* تدهور تدريجي: الحفظ الدائم تعطّل، التطبيق يكمل طبيعي */
    }
  }, [exportQueue]);

  // معالجات تبديل الثيم واللغة
  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleToggleLang = (newLang) => {
    setLang(newLang);
  };

  // إضافة كتاب لقائمة التصدير (نتفادى التكرار لو الكتاب مضاف مسبقاً بنفس الـ id)
  const handleAddToQueue = (book) => {
    setExportQueue((prev) => (prev.some((b) => b.id === book.id) ? prev : [book, ...prev]));
  };

  const handleRemoveFromQueue = (id) => {
    setExportQueue((prev) => prev.filter((b) => b.id !== id));
  };

  // حفظ التعديلات على كتاب: يحدّث الكتاب المعروض حالياً، وإذا كان موجود
  // مسبقاً بقائمة التصدير، يزامن النسخة المخزّنة هناك بنفس التعديلات
  const handleSaveBook = (updatedBook) => {
    setSelectedBook(updatedBook);
    setExportQueue((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  };

  return (
    <>
      {selectedBook === null ? (
        /* الواجهة الأولى: البحث السريع */
        <InstantBookLookup
          onSelectBook={(book) => setSelectedBook(book)}
          lang={lang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onToggleLang={handleToggleLang}
        />
      ) : (
        /* الواجهة الثانية: تفاصيل الكتاب والبيانات */
        <BookDetailsView
          book={selectedBook}
          onBack={() => setSelectedBook(null)}
          lang={lang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onToggleLang={handleToggleLang}
          exportQueue={exportQueue}
          onAddToQueue={handleAddToQueue}
          onRemoveFromQueue={handleRemoveFromQueue}
          onSaveBook={handleSaveBook}
        />
      )}
    </>
  );
}

export default App;