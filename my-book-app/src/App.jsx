import { useState } from 'react';
import InstantBookLookup from './InstantBookLookup';
import BookDetailsView from './BookDetailsView';

function App() {
  // حالة الكتاب المحدد (null = الواجهة الأولى، يحتوي على كتاب = الواجهة الثانية)
  const [selectedBook, setSelectedBook] = useState(null);
  
  // حالة اللغة والثيم موحدة للتطبييق ككل
  const [lang, setLang] = useState('EN');
  const [theme, setTheme] = useState('dark');

  // قائمة التصدير المشتركة — عمداً هنا وليس داخل BookDetailsView، عشان تبقى
  // محفوظة أثناء التنقل بين شاشة البحث وشاشة المراجعة لعدة كتب مختلفة
  const [exportQueue, setExportQueue] = useState([]);

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