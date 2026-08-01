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
| GET | `/api/search?q=&filter=` | **⭐ unified orchestrated search — the endpoint the frontend will use** | ✅ working |
| GET | `/api/search/google-books?q=&maxResults=` | legacy raw proxy | ⚠️ deprecated — kept until frontend wiring completes, then removed |
| GET | `/api/search/open-library?q=\|title=\|author=&limit=` | legacy raw proxy | ⚠️ deprecated — same as above |
| POST | `/api/search/ai-suggest` `{ query }` | legacy raw proxy | ⚠️ deprecated — same as above |
| POST | `/api/upload/parse` | file parsing | 🚧 stub — returns `501`, real OCR is Phase 4 |

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

## What this phase deliberately does NOT do yet

- **The frontend has not been touched.** It still calls Google Books/Open Library/Gemini
  directly with placeholder keys. Repointing it at `GET /api/search` is the next,
  separate milestone.
- **No OCR.** `/api/upload/parse` is a real route with a real controller and service file,
  but it always returns `501 Not Implemented` until Phase 4.

## Next step (not done in this pass)

Repoint `InstantBookLookup.jsx` at `GET /api/search` (one request, already-normalized
books), remove the client-side fallback chain and placeholder key constants, then delete
the three deprecated proxy endpoints above.
