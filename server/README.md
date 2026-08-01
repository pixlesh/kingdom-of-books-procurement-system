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
├── routes/                # URL → controller mapping only, no logic
├── controllers/           # request/response handling, delegates to services
├── services/               # one file per external API — the only place that calls fetch()
└── middleware/errorHandler.js
```

Layering: **routes → controllers → services**. Each external API has exactly one service
file that owns its request shape and its key. Controllers never call `fetch()` directly.

## Endpoints (current)

| Method | Path | Mirrors (frontend today) | Status |
|---|---|---|---|
| GET | `/api/health` | — | ✅ working |
| GET | `/api/search/google-books?q=&maxResults=` | `InstantBookLookup.jsx`'s direct Google Books call | ✅ working (needs a real key in `.env`) |
| GET | `/api/search/open-library?q=\|title=\|author=&limit=` | `fetchFromOpenLibrary()` | ✅ working, no key needed |
| POST | `/api/search/ai-suggest` `{ query }` | `fetchFromAI()` | ✅ working (needs a real key in `.env`) |
| POST | `/api/upload/parse` | `parseUploadedFileMock()` | 🚧 stub — returns `501`, real OCR is Phase 4 |

All search endpoints return the **raw upstream JSON**, unmodified. Normalization into the
unified Book Model (`createBook()` / `normalizeFromGoogleBooks()` etc.) stays in the
frontend's `bookModel.js` for now — this backend intentionally does not duplicate that
logic yet, to keep this phase scoped to "hide the keys" rather than "move business logic."
That can change in Phase 2 of the backend roadmap if we want the aggregation itself
server-side too (see note below).

## What this phase deliberately does NOT do yet

- **The frontend has not been touched.** It's still calling Google Books/Open Library/Gemini
  directly with placeholder keys, exactly as before. Swapping those calls over to this
  server is the next, separate step — done one source at a time so each swap is easy to
  verify in isolation, per the incremental-replacement approach.
- **No response aggregation/fallback chain server-side yet.** Today the frontend's
  `resolveFallback()` logic (Google Books → Open Library → AI) stays client-side and will
  keep working once each individual `fetch()` call is repointed at this server. A single
  `/api/search` endpoint that does the fallback chain server-side is a reasonable future
  step, but a bigger one — deliberately not bundled into this pass.
- **No OCR.** `/api/upload/parse` is a real route with a real controller and service file,
  but it always returns `501 Not Implemented` until Phase 4.

## Next step (not done in this pass)

Repoint the frontend's three `fetch()` calls in `InstantBookLookup.jsx` at this server
instead of the external APIs directly, one source at a time (Open Library first, since it
needs no key and is the lowest-risk swap to verify). Each swap should be its own reviewed
change, not a single big rewrite of the search logic.
