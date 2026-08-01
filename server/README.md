# Kingdom of Books — API Server

Lightweight Node.js + Express layer that owns every third-party API call (Google Books,
Open Library, Gemini AI, and — later — OCR/file parsing) so the React frontend never
holds or exposes an API key.

## Setup

```bash
cd server
npm install
cp .env.example .env   # fill in real keys locally — .env is never committed
npm run dev            # http://localhost:3001, auto-restarts on file changes
```

## Architecture

```
src/
├── index.js              # entry point — starts the server
├── app.js                 # Express app: middleware, route mounting, error handling
├── config/env.js          # single source of truth for environment variables
├── models/bookModel.js    # normalization into the unified Book Model (⚠️ deliberate
│                            duplicate of the frontend's normalizers — Decision D5;
│                            any rule change must be applied in BOTH copies)
├── routes/                # URL → controller mapping only, no logic
├── controllers/           # request/response handling, delegates to services
├── services/               # one file per external API — the only place that calls fetch()
│   └── orchestration.service.js  # ⭐ the actual search product logic: concurrent
│                                    query, merge, dedupe, AI-fallback decision
└── middleware/errorHandler.js
```

Layering: **routes → controllers → services**. Each external API has exactly one service
file that owns its request shape and its key. Controllers never call `fetch()` directly.
`orchestration.service.js` calls the per-API services (never `fetch()` itself) and is the
single auditable place that decides what counts as a good result and when AI may suggest.

## Endpoints (current)

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/api/health` | liveness check | ✅ working |
| GET | `/api/search?q=&filter=` | **⭐ unified orchestrated search — the only endpoint the frontend uses** | ✅ working, wired to the frontend |
| POST | `/api/upload/parse` | file parsing | 🚧 stub — returns `501`, real OCR is Phase 4 |

The three legacy per-source proxy endpoints (`google-books`, `open-library`, `ai-suggest`)
were removed once the frontend was repointed at the unified endpoint — nothing called
them anymore, and keeping two search surfaces invites editing the wrong one.

### `GET /api/search` — request/response contract

`filter` is one of `All Fields` (default), `Title`, `Author`, `ISBN` — same values the
frontend's filter chips already use. Response:

```json
{
  "books": [ /* fully normalized unified Book Model objects — usable as-is */ ],
  "source": "merged | ai | none",
  "meta": {
    "googleBooks": "ok | failed | skipped",
    "openLibrary": "ok | failed",
    "ai": "not_needed | ok | failed | skipped",
    "counts": { "googleBooks": 0, "openLibrary": 0, "merged": 0 }
  }
}
```

Orchestration rules (confirmed business rules — do not reinterpret):

1. Google Books and Open Library are queried **concurrently** (`Promise.allSettled`) —
   one source failing or being unconfigured never blocks the other.
2. Every raw result is normalized through `models/bookModel.js` before any other logic.
3. Merge + dedupe: by ISBN first, then by lowercase title + first author. Google Books
   records win duplicates (richer — only source trusted for `description`).
4. **If at least one trusted book exists, those results are returned — AI is never called.**
5. **Gemini runs only when both trusted sources return zero books**, suggests whole books
   only, and its data is never merged into an existing trusted record. Missing fields on
   trusted books stay empty for the human-review stage — never AI-filled.
6. AI unavailable/failed = honest empty result (`source: "none"`), never an error page.

## Frontend integration (done)

`InstantBookLookup.jsx` now makes exactly one request per search — `GET /api/search` —
and renders the returned, already-normalized books directly. The client-side fallback
chain, client-side normalization of search results, and the placeholder API key
constants are gone from the frontend entirely.

**Dev workflow is now two processes:** run `npm run dev` here (port 3001) *and*
`npm run dev` in `my-book-app/` (port 5173). If the backend is down, search shows the
connection-issue banner and no results — by design, never a crash.

**Origins/ports are configuration, never code:** the backend's allowed frontend origin
comes from `CLIENT_ORIGIN` in `.env` (default `http://localhost:5173`); the frontend's
backend address comes from `VITE_API_BASE_URL` (see `my-book-app/.env.example`, default
`http://localhost:3001`). If Vite ever runs on a different port, set `CLIENT_ORIGIN`
accordingly — no code change.

## Not done yet

- **No OCR.** `/api/upload/parse` is a real route with a real controller and service file,
  but it always returns `501 Not Implemented` until Phase 4.
- **Google Books contributes results only once a real `GOOGLE_BOOKS_API_KEY` lands in
  `.env`** — until then `/api/search` reports it as `skipped` and serves Open Library.
  Same for the Gemini fallback and `GEMINI_API_KEY`.
