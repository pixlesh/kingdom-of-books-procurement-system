# Kingdom of Books Procurement System

An internal procurement and book metadata management system built for **Kingdom of Books**. The system helps employees search, review, edit, and export book metadata into the company's official supplier Excel template.

---

## Features

- Search books from Google Books and Open Library
- Intelligent result merging and duplicate removal
- Barcode scanning support
- Manual review and editing before export
- Persistent export queue
- Arabic & English localization (RTL/LTR)
- Dark & Light themes
- Real Excel export using ExcelJS
- Backend API orchestration with Express
- AI fallback (Gemini) when trusted sources return no results

---

## Tech Stack

### Frontend
- React 19
- Vite
- CSS Modules

### Backend
- Express.js
- Node.js

### External APIs
- Google Books API
- Open Library API
- Gemini API

### Libraries
- ExcelJS
- html5-qrcode

---

## Project Structure

```
my-book-app/
├── src/
├── public/

server/
├── src/
├── routes/
├── controllers/
├── services/
```

---

## Workflow

1. Search for a book
2. Review and edit metadata
3. Add books to the export queue
4. Persist queue locally
5. Export to the official supplier Excel template

---

## Screens

- Search
- Review & Edit Metadata
- Export Queue
- Excel Export

---

## Key Features

- Multi-source search
- Metadata validation
- Queue persistence
- Duplicate detection
- Template-faithful Excel export
- Responsive UI
- RTL support

---

## Installation

### Frontend

```bash
cd my-book-app
npm install
npm run dev
```

### Backend

```bash
cd server
npm install
npm run dev
```

---

## Environment Variables

Create a `.env` file inside the `server` directory.

```
GOOGLE_BOOKS_API_KEY=your_key
GEMINI_API_KEY=your_key
```

---

## License

This project was developed for educational and portfolio purposes.

## 📸 Screenshots

> Screenshots will be added after the production UI is finalized.
