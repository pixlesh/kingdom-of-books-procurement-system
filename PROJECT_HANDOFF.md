# PROJECT_HANDOFF — Kingdom of Books (مملكة الكتب) V2

> **Purpose of this file:** the single canonical session-to-session handoff. A fresh session
> should be able to continue from this file alone, without relying on prior conversation
> history. Rewritten complete on **2026-08-21** (previous version had grown into an append-only
> patchwork); every fact below was re-verified against the actual files/git state on disk on
> that date, not carried over from memory. **If you complete a stage, update this file** —
> keep it accurate, don't let it rot, and don't let it drift back into unverifiable claims.
>
> **Git note:** everything after commit `e0625ec` ("Add v1.0 changelog") is **uncommitted
> working tree** — the entire V2 evolution described in this document. `git status` is the
> change inventory. **No deployment has happened yet.** See §7–9.

---

## 1. Project purpose & current architecture

Internal procurement tool for the **Kingdom of Books** bookstore (Saudi Arabia):
search/scan books → review & correct metadata → queue → export the official Arabic/English
supplier Excel list. Bilingual (AR/EN), RTL/LTR, dark/light. Two packages, one repo:

| Path | What | Run (dev) |
|---|---|---|
| `my-book-app/` | React 19 + Vite frontend (port 5173) | `npm run dev` |
| `server/` | Express API (port 3001) — owns ALL third-party calls & keys | `npm run dev` (watches) or `npm start` (no watch) |

**⚠️ Ops lesson (caused a real "all books not found" incident):** both processes were being
run as background children of AI work sessions and died with them, while the UI stayed up and
looked healthy. The backend MUST run as a persistent process the user controls. If searches
return nothing, **check `GET :3001/api/health` first**.

Secrets: `server/.env` (real values, never committed — confirmed not tracked in git; only
`.env.example` templates, with no real values, are tracked). Gemini/AI was fully removed
(model retired; AI must never be a metadata source — confirmed business rule, see §10).

### 1.1 High-level flow

```
User (scan / type ISBN or title) → frontend (InstantBookLookup.jsx)
  → GET :3001/api/search?q=&filter=  (the only endpoint the frontend calls)
    → orchestration.service.js:
         Local Publisher Catalog (254 records, authoritative, fill-only-wins)
           ∥ Live Publisher Sources (3, registry, parallel, fill-only)
           ∥ Google Books (retry budget)
           ∥ Open Library (edition endpoint + search fallback)
       → field-level merge (see §2.3) → strict ISBN verification → response
→ user reviews/edits (Price, Genre, Edition only — everything else read-only, source-locked)
→ Add to Cart → Excel export (client-side, real org templates)
```

This is the **fallback chain** referenced throughout this document:
`Local Publisher Catalog → Approved Publisher Live Sources → Google Books → Open Library → recovery`.

### 1.2 Frontend (`my-book-app/`)

Files: `src/App.jsx` (lifted state: lang/theme/exportQueue/selectedBook),
`src/InstantBookLookup.jsx` (search screen — **the only place that calls the backend API**),
`src/BookDetailsView.jsx` (details/review screen — no direct API calls, receives data via
props/callbacks), `src/bookModel.js` (frontend unified model + validation + Excel export).
CSS Modules, inline `translations = {EN:{...}, AR:{...}}` dictionaries per screen, `dir` attr
for RTL, `.lightTheme` class overrides for theming. **No i18n/state libraries — keep it
that way.**

Implemented & verified (all stages user-approved):
- **Field editability:** source fields (title/description/ISBN/author/pages/year/cover) are
  read-only cards with lock badges; only Price, Genre, Edition editable. All fields required
  except Edition. Missing source data → persistent amber warning (does NOT block Save —
  deliberate; the escape hatch is the Human-Review flag).
- **Price/VAT:** user enters price **before** VAT; 15% VAT + total computed live;
  `priceIncludingVat` stored on save. Excel column F gets `priceIncludingVat`.
- **Human Review flag:** real ON/OFF switch, saved with the book, drives Excel row-level yellow.
- **Genre:** strict dropdown of 34 controlled categories, stable IDs, legacy/unapproved values
  shown raw with a warning, never auto-replaced. List duplicated deliberately in BOTH
  `my-book-app/src/bookModel.js` and `server/src/models/bookModel.js` (**D5 — change both**).
- **Cart:** count badge on both screens, dropdown, discard-changes guard on navigation.
  Persists in `localStorage` key `kob.exportQueue.v1`.
- **Excel export:** AR/EN template chooser (independent of UI language) → loads the REAL org
  templates from `public/templates/supplier-list-{ar,en}.xlsx` (verbatim headers incl. the
  org's `رقم الطابعة` typo) → fills rows 8+ → highlights (Human-Review=row yellow, missing=cell
  red, AI-suggested=cell orange, red>orange>yellow). `Table_1` auto-extends past 220 rows.
  ExcelJS style objects are shared on loaded files — always replace `cell.style`, never mutate.
- **Scanner:** modal with Camera (`html5-qrcode` `Html5Qrcode`) / External (keyboard-wedge)
  methods, mutual fallback, feeds the existing search flow with `filter=ISBN`. **See §5.2 for
  current real-world testing status — this is NOT fully verified yet.**
- **Cover display (fixed 2026-08-20/21):** real cover → shown; no real cover → explicit
  "Cover unavailable" placeholder (icon + text), **never** a stock/fallback image. This was a
  real bug (a hardcoded Unsplash `FALLBACK_COVER` was being shown as if it were the book's
  actual cover, and saved/exported as if real) — the constant was removed entirely from
  `bookModel.js`, and both the search-grid `<img>` and the details-view preview now render
  conditionally. Verified live: search grid renders 0 `<img>` elements for coverless books
  (was previously a broken-image icon), Excel export leaves the Cover Image cell empty with
  the normal red missing-field highlight (was previously exporting the fake photo undetected).

### 1.3 Backend (`server/`) — architecture

`routes → controllers → services`; only services call `fetch`/launch a browser. Endpoints:
`GET /api/health`, `GET /api/search?q&filter` (the only one the frontend uses),
`POST /api/upload/parse` (501 stub — OCR is a future phase, not started). **No batch
endpoints exist yet.**

Key modules:
- `src/utils/isbn.js` — checksum validation (10 incl. X, 13 with 978/979 prefix only), 10→13
  canonicalization, `looksLikeIsbn` (shape+checksum) for All-Fields auto-detection. Invalid
  ISBNs are never "fixed" — they're rejected.
- `src/utils/http.js` — `fetchWithRetry`: per-attempt timeout (AbortController), bounded
  retries on 429/5xx/network/timeout only, exponential backoff + jitter, total time budget.
- `src/utils/arabicText.js` — query cleaning (diacritics/tatweel/RTL marks), matching-only
  folding (أإآ→ا, ة→ه, ى→ي), `stripAl` (Google matches `inauthor:مسلم` but not
  `inauthor:المسلم`).
- `src/services/catalog.service.js` — the **local publisher catalog**. See §2.
- `src/services/cover.service.js` + `scripts/covers-ingest.mjs` — **permanent cover storage**.
  See §3.
- `src/services/publisherSources/` — the **live publisher-source registry** (3 sources). See §4.
- `src/models/bookModel.js` — server-side normalizers (GB/OL/OL-edition/catalog/each live
  source). Guards: only `ISBN_13`/`ISBN_10` identifiers ever accepted (never `OTHER` library
  barcodes), canonical-13-or-empty storage, publisher-name stripped from GB author arrays
  (exact match only), wrong-language description rejected (Arabic book + <30% Arabic letters
  → empty; real case: a Danish blurb Google Books once returned for متحف البراءة), no cover
  fallback — missing cover is `''`, never a placeholder.

### 1.4 Catalog-first + fill-only merge (the core rule)

For an exact-ISBN request, candidates from every source that responded are merged **in fixed
priority order**: `catalog → publisher-live → Google Books → Open Library`. Merge is
**field-by-field, fill-only**: a field is only copied from a lower-priority source if the
higher-priority source's value for that field is empty/invalid. A higher-priority source's
**valid** value is never overwritten, even if a lower-priority source disagrees — disagreements
on pages/year/publisher are logged (`[merge] conflict …`) for future provenance work, never
silently resolved. Only books whose canonical ISBN exactly equals the request survive to the
response (strict verification) — a source returning "a similar book" is discarded, not
substituted.

### 1.5 Response contract (frontend depends on this shape — do not change without updating frontend)

```
{ books: [unified Book], source: 'merged'|'none',
  meta: { googleBooks: 'ok|failed|skipped', openLibrary: 'ok|failed',
          publisherLive: { <sourceKey>: 'ok'|'not_found'|'failed' },   // ISBN path only
          counts: { googleBooks, openLibrary, publisherLive, merged } } }
```
Book carries additive fields beyond the original contract: `subtitle, publisher, language,
priceIncludingVat, sourceUrl, fetchedAt, needsReview` (last three: live-source records only).
All additive — existing consumers ignore fields they don't recognize, confirmed no frontend
code branches on `source` value except the AI-badge check (`source === 'ai_suggested'`, never
true in this architecture since no AI source exists in production).

---

## 2. Publisher Catalog

**Current count: 254 records** (re-verified 2026-08-21 directly from
`server/data/publisher-catalog.json`).

| Publisher | Records |
|---|---|
| دار التنوير | 99 |
| دار الشروق (مصر) | 74 |
| مملكة الكتب (Kingdom of Books, own imprint) | 44 |
| عصير الكتب للترجمة والنشر والتوزيع | 31 |
| دار زحمة كتاب | 6 |

### 2.1 How it got here

1. عصير الكتب's 31 records were the original catalog (imported earliest, via
   `npm run catalog:import`).
2. A 14-file authoritative supplier-list dataset (`Desktop\Work`, 724 rows) was
   coverage-mapped, then dry-run classified against the exact same validation rules
   `catalog:import` uses (read-only simulation, no writes).
3. User ruled on 7 explicit decisions (D1–D7: no blanket ISBN prefix-stripping — every
   prefixed record individually verified 87/87 instead; مركز الأدب العربي prices withheld
   pending pack-vs-unit confirmation; منشورات الوسم file-version ambiguity held, not
   silently chosen; مكتبة مدبولي fixed at procurement-only, never metadata authority;
   only 3 unambiguous genre aliases approved — رواية رعب/رواية خيال علمي/غموض → `novels`;
   نوفا بلس kept in review, not rejected, pending ISBN-registration-group verification;
   5 ISBN-reuse-across-different-books groups blocked entirely).
4. The resulting 223-record "L1-ready" batch (دار الشروق 74, دار التنوير 99, مملكة الكتب 44,
   دار زحمة كتاب 6) was imported 2026-08-20 after an explicit pre-import summary + user
   approval. Verified: zero collisions, the pre-existing 31 عصير records byte-identical
   before/after, backup retained.

### 2.2 Deliberately held / NOT imported (still true as of 2026-08-21 — nothing further imported since)

- **L1-metadata-without-price — 22 records (مركز الأدب العربي):** metadata is clean, but
  their supplier-list prices look like pack/carton totals (near-exact multiples of 28.75),
  not unit retail — held pending supplier confirmation. **Note:** since this catalog
  decision, مركز الأدب العربي was separately implemented as a **live source** (§4) — its
  books are now reachable live even though this static 22-record batch was never imported.
- **L1-conditional-D1 — 51 records** (the "50 best-seller" English list): individually
  verified prefix-stripped ISBNs (87/87 across the whole dataset were verified plausible),
  but the verification table itself was never presented for final sign-off before import.
- **L2-procurement-only — 116 records** (Jarir-EN list + مكتبة مدبولي valid subset):
  by design, these can never become metadata authority — held as price/quantity reference
  only, structurally outside the catalog store.
- **L3 — the rest** (~312 rows): rejected (invalid/missing ISBN), blocked (5 ISBN-reuse
  groups, D3-held الوسم files), or the deliberately-protected sparse عصير re-list (re-importing
  it would overwrite the 31 rich records already in the catalog — never do this).
- **منشورات الوسم / دار زحمة كتاب as live sources:** evaluated (LOW-MEDIUM value) but gated
  on an unresolved contradiction found during evaluation — aseeralkotb.com's `robots.txt` is
  fully open but its Terms of Use contains an explicit anti-automation clause. Not
  implemented as a live source; resolve the contradiction before reconsidering.
- **نوفا بلس / مكتبة مدبولي as live sources:** evaluated and explicitly rejected — نوفا بلس
  has no ISBN anywhere on its site (LOW value); مكتبة مدبولي's "official" domain is a dead
  single-page placeholder (NO value).

### 2.3 Provenance & rules (confirmed, do not reinterpret)

- ISBN: checksum-valid canonical ISBN-13 or empty — never "fixed", never derived from OTHER
  identifiers. Import rejects (does not repair) invalid rows.
- Records from the 223-batch carry `isbnOriginal` (verbatim source cell), `priceOriginal`,
  and `importBatch: "L1-ready-approved-2026-08-20"` for audit trail.
- Supplier catalog data is **authoritative for that supplier's books** — fill-only merge on
  top; Google Books/Open Library/live publisher sources can never overwrite a valid catalog
  value, proven live repeatedly (see §4).
- Template price is **incl. VAT** → pre-VAT is derived (÷1.15) at import time.
- Genre: controlled 34-entry list; unapproved raw values are kept as-is + flagged, never
  silently mapped. `أدب` and `إدارة وأعمال` were explicitly requested as aliases but have **no
  unambiguous target in the current 34-list** — deliberately left unmapped; adding a
  business/literature category is a separate future decision, not done implicitly.

### 2.4 Known remaining gaps (accurate as of 2026-08-21 — do not overstate what's resolved)

| ISBN | Book | Status |
|---|---|---|
| `9786038455647` | إنتامافوبيا | **Resolved via live sources** — found by both عصير الكتب and مركز الأدب العربي (§4). Not in the static catalog, but discoverable on every live request. |
| `9789922721675` | تشيخوف الأعمال القصصية (10 مجلدات) | **Resolved via live source** — found by دار الشروق (§4), absent from GB/OL. |
| `9786038596302` | موردينو | Confirmed a genuine Kingdom-of-Books own-imprint title, real and sold on our own storefront, but **not yet in the 44-record KoB import**. Resolved only by a fuller KoB storefront export (§9 next steps) — not by any external live source, since it isn't external. |
| `9789779648767` | فجر الاسلام | **Genuinely unattributable** — even our own storefront's page for it has blank author/publisher fields, and deep web research found no publisher of record for this exact ISBN anywhere. Not resolvable by any publisher-website integration; would need internal/manual sourcing (e.g. the physical book's colophon). |
| `9786030167616` | خوف | Served by Google Books directly (GB has its own valid record for this exact ISBN). Not a catalog/live-source hit specifically, but not an unresolved gap either. |
| `9786140105232` | ساق البامبو | Confirmed absent from the static catalog. **Not re-tested against the 3 live sources** since they were implemented — status unknown, don't assume either way. |
| `9789938886559` | 1984 (Arabic) | Same as above — not re-tested against the live sources since implementation. |

---

## 3. Cover storage

**Status: 254/254 catalog covers localized, 63MB total** (re-verified 2026-08-21 by
counting files on disk, matches catalog record count exactly).

### 3.1 Architecture

- `server/src/services/cover.service.js` + `server/scripts/covers-ingest.mjs`
  (`npm run covers:ingest`, dry-run by default; `--execute` to write, `--refresh` to force
  re-download, `--only <isbn>` to scope).
- Files stored at `server/data/covers/` as `<isbn13>-<sha256:8>.<ext>` (content-hashed name
  → safe to cache immutably forever).
- Served via `GET /covers/<file>` — `express.static(COVERS_DIR, {immutable, maxAge: '365d'})`,
  registered in `server/src/app.js`. `COVERS_DIR` resolves via `import.meta.url`, not
  `process.cwd()` — safe regardless of the process's launch directory.
- Catalog records gained additive fields: `coverFile` (local filename), `coverOriginalUrl`
  (verbatim source URL, provenance — never overwritten), `coverIngest {status, resolvedFrom,
  fetchedAt, httpStatus, contentType, bytes, width, height, sha256}`.

### 3.2 Validation rules (no placeholders, ever)

Only `image/*` responses whose bytes pass magic-byte sniffing (JPEG/PNG/WebP/GIF/AVIF) and
size floors (≥5KB, ≥150px short side) are accepted. HTML pages masquerading as image URLs are
rejected (`page_not_image`). Signed URLs already past their expiry are rejected before
fetching (`expired_signed`). **Any failure leaves the existing value untouched and records the
failure reason — no stock/fallback image is ever substituted**, matching the same rule as the
frontend's cover-display fix (§1.2).

### 3.3 Page-resolvers (explicit allowlist only — never a generic scraper)

- **ibb.co** → follows `og:image` to get the real direct image URL (ibb.co page URLs are not
  image URLs themselves).
- **kingdomofbook.com** → our own storefront's cover URLs are S3-signed with a 12-hour expiry;
  the resolver re-fetches the *current* product page (found via a one-time sitemap→ISBN map
  built by scanning `/book/{id}` pages) to get a **fresh** signed URL, downloaded immediately.
  Expired old URLs are never "revived" — always re-sourced from the live page.

This closed a real diagnosed bug: 43 of the 254 covers were broken in the UI (11 ibb.co page
links stored instead of direct images; 32 kingdomofbook.com signed URLs that had expired
between import and use). All 254 now serve real, validated images.

### 3.4 ⚠️ CRITICAL deployment issue — not yet fixed, must be addressed before going live

**Every one of the 254 `coverImage` values in `publisher-catalog.json` is currently a
hardcoded absolute URL: `http://localhost:3001/covers/<file>`** (re-verified 2026-08-21 —
grepped all 254 records, 100% have this exact prefix). This is not computed dynamically per
request by the Express server; `covers-ingest.mjs` bakes `COVER_SERVE_BASE` (env var,
defaults to `http://localhost:${PORT}`) into the stored value **at ingestion time**, and it
stays that way until re-ingested.

**Deployed as-is right now, every book cover in the app would try to load from `localhost`
and fail for every real user.**

Two remediation options, neither requiring a code change:
1. **Re-run ingestion** — `npm run covers:ingest -- --execute --refresh` with
   `COVER_SERVE_BASE=https://<real-production-backend-domain>` set. Re-downloads and
   re-validates all 254 covers under the new URL (slower, but re-verifies file integrity).
2. **Direct string replacement** — find/replace the `http://localhost:3001` prefix directly
   in `publisher-catalog.json` (fast, no re-download; only safe if the underlying files
   aren't moving/changing).

Either way this must happen **after** the production backend's real domain is known, as part
of deployment — not before, and not implicitly. See §8 (blocker) and §9 (sequencing).

---

## 4. Live publisher sources

**Status: all 3 approved sources implemented and verified live (2026-08-21).**
`server/src/services/publisherSources/` — `index.js` (registry, the only entry point
`orchestration.service.js` calls), `renderClient.js` (shared headless-browser utility),
`aseerAlKotb.service.js`, `adabBook.service.js`, `shorouk.service.js`.

**Purpose:** the local catalog (§2) is a snapshot — it can never contain a book a publisher
put on their own site yesterday. Live sources close this gap structurally: on every
exact-ISBN request, each registered source is queried **live, in parallel** with Google
Books/Open Library (not from any cached dataset) — so a brand-new book becomes findable on
the very next request, with no re-import step. Adding a future source is one new file + one
line in the `SOURCES` array in `index.js` — zero changes to `orchestration.service.js`.

**Kill switch:** `PUBLISHER_LIVE_SOURCES=off` env var (`config.publisherLiveSourcesEnabled`)
— disables this whole layer instantly, no redeploy, no code change.

### 4.1 عصير الكتب (aseeralkotb.com)

- **No browser needed for this source, at any step.** Its anti-bot gate is a *static* cookie
  (`AserElKotb=<fixed-hash>`) set by an obfuscated JS stub; the literal cookie value sits
  un-obfuscated in the token array and is regex-extractable, cached ~1h, replayed via plain
  `fetch`. Both its search endpoint and product pages are then full server-rendered HTML with
  clean schema.org `Book` JSON-LD (isbn, name, author, description, publisher, genre[],
  price, non-expiring CDN cover URL).
- Bug found+fixed: the search-results page also contains static filter/facet links matching
  the same `/ar/books/` URL pattern (`readable`/`purchasable`/`audio`) that appear *before*
  real results in HTML order — a naive first-link extraction picked these by mistake. Fixed
  by requiring the `title="…"` attribute real product cards carry immediately after `href`
  (facet links don't have it).
- Verified live: إنتامافوبيا `9786038455647` (absent from GB/OL/local catalog) → full
  metadata, `source: publisher_live_aseeralkotb`. أبادول `9789779924731` (already in local
  catalog) → correctly still `source: publisher_catalog` (fill-only priority holds).

### 4.2 مركز الأدب العربي (adab-book.com)

- Platform: Zid (Saudi e-commerce SaaS). Product pages are plain-HTTP server-rendered (no
  browser needed for extraction); only the ISBN search step (`/products?q=<ISBN>`) renders
  results client-side and needs the shared browser client — no Zid JSON API exists (checked
  directly, none found).
- Correction to an earlier evaluation: title/JSON-LD `name` **are** reliable on this site —
  the field that actually mixes concepts is `category`, and its shape is **not fixed at 2
  parts**: live data showed both `"Author > Genre"` and 3-part forms with a promotional
  middle level (`"شهد قربان > احدث الاصدارات > الرواية"`). Guard: first segment = author
  (only if it isn't the title, defending against field-swap), **last** segment = genre, for
  any part-count ≥2 — a rigid `=== 2` check silently dropped real data on the 3-part case
  until fixed. `data.image` observed as both a bare string and an array — normalizer takes
  the first element either way.
- **Shared headless-browser client added here** (`renderClient.js`) — Playwright,
  `chromium.launch({headless:true})`, one lazily-launched singleton browser reused across
  requests, isolated context/page per call, always closed in `finally`. This is the server's
  first browser-automation dependency (see §7 for the deployment implication).
- Real timing bug found+fixed: the inner `page.waitForSelector` budget was measured from
  call-time (after `goto`), but the outer hard-timeout wrapped `goto`+wait together — a
  **genuine zero-results** search (خوف `9786030167616`: adab-book has 3 similarly-named
  listings, none matching our benchmark ISBN) could lose that race and surface as a timeout
  *error* instead of a clean `null`. Fixed with two separate, properly nested budgets.
  Verified: خوف now cleanly returns `not_found` from this source; GB serves its own real
  match instead — no fabrication.
- Live-discovery proof: **ستوكهولم `9786038455593`** — GB has only a bare title+year stub
  (no author/pages/description/cover), OL is 404, not in local catalog — found live via
  **both** عصير الكتب and مركز الأدب العربي independently (cross-source confirmation), full
  metadata.

### 4.3 دار الشروق (shoroukbookstores.com)

- Its "search" is confirmed a literal **embedded Google Custom Search widget**
  (`cx=010379068525541404458:jpymbbxm_74`) — needs the same shared render client for that one
  step, reused unchanged (no new browser framework, no source-specific implementation, per
  explicit instruction). Product pages (ASP.NET `/books/view.aspx?id=<GUID>`) are richer than
  the original evaluation found: a full schema.org `Product` JSON-LD block (`gtin13`, `name`,
  `description`, `image[]`, `brand.name`, `offers.price/priceCurrency`) plus a dedicated
  `<meta property="product:custom_label_0">` tag for author (Product schema has no native
  author field) and consistent `<div class="right">Label</div><div class="left">Value</div>`
  markup for pages/publication-year/genre.
- Publication year is deliberately taken from "سنة النشر" (original) only, never "أحدث طبعة"
  (latest-edition year, shown separately on the same page) — avoids one field holding two
  different meanings.
- **EGP price exclusion is enforced in the normalizer itself** — `price`/`priceIncludingVat`
  are never populated from this source at all, not merely "usually null". Verified live:
  متحف البراءة's catalog record kept its real SAR price (59.4/68.31) completely undisturbed
  while شروق's EGP data ran in the same request.
- Real finding from live data: `brand.name` reflects the **true per-book publisher**, not
  always "دار الشروق" — the site is a retailer that also sells other publishers' books (e.g.
  Chekhov's complete works under `brand.name: "دار الرافدين"`). The normalizer correctly uses
  the JSON-LD brand per-book rather than hardcoding the site name.
- Two bugs found+fixed via live testing (same pattern as §4.2): (1) identical nav/wait
  timeout-split bug, fixed identically; (2) **timeout budgets too tight under real concurrent
  load** — أدب and شروق share one Playwright browser instance and always fan out
  simultaneously per request; an isolated single-source request completed reliably in 4–6s,
  but running both together intermittently exceeded the original budgets under genuine (not
  deadlocked) resource contention. Raised to 16s inner / 24s hard-cap / 28s registry-level
  for **both** browser-based sources — a resilience/timeout tuning change, not a correctness
  change; re-verified clean under the same concurrent conditions afterward.
- Live-discovery proof: **الأعمال القصصية الكاملة لأنطون تشيخوف `9789922721675`** — confirmed
  absent from Google Books (zero results), Open Library (404), and the local catalog — found
  live with full metadata (author, 5,404 pages [10-volume set], description, cover,
  publisher).
- Cross-source proof (all 3 sources together): متحف البراءة `9789770933855` (already
  catalog-imported) → `source: publisher_catalog` correctly wins while **both** aseeralkotb
  AND شروق independently report `ok` in `meta.publisherLive` simultaneously — deterministic
  priority holds even with two live contributors plus the catalog record in the same request.

### 4.4 Common guarantees, all 3 sources

- Exact ISBN-13 verification against the actual product page/JSON-LD field before any result
  is accepted — no fuzzy/title-only acceptance when an ISBN lookup is expected.
- Live per-request lookup — **nothing found live is ever written into the local catalog
  automatically.** The catalog only grows via the explicit, human-approved import process
  (§2). A book found live today is looked up live again tomorrow.
- Bounded failure: browser-based sources get one attempt with a hard timeout (no retry —
  consistent with the project's "no infinite loop" rule), reporting `SOURCE_UNAVAILABLE`
  cleanly rather than hanging the response.
- Vacant test ISBN `9786039999997` verified to return honest empty across all 3 sources.

### 4.5 Deployment implication — see §7/§8

Two of the three sources require a real headless Chromium browser server-side. `playwright`
is an npm dependency, but **the actual browser binary requires a separate explicit install
step** (`npx playwright install chromium`, or `--with-deps` on Linux for required system
libraries) — this is **not** run automatically by `npm install`. Not yet configured in any
deployment pipeline, because no deployment pipeline exists yet (§8).

---

## 5. Frontend — current UI behavior detail

(See §1.2 for the implemented-feature list. This section covers the two areas the user
specifically flagged as needing accurate, non-overstated status.)

### 5.1 Manual ISBN/title search

Fully implemented and extensively verified throughout this project's live testing — typing an
ISBN or title and pressing Enter/submitting reliably reaches the backend and renders results,
including the catalog-first + fill-only + live-source behaviors described above. This is the
**working, trusted path**.

### 5.2 Camera / barcode scanner — current known status (do not overstate)

- The scanner modal (Camera via `html5-qrcode`, or External keyboard-wedge input) is
  **implemented and code-complete** (§1.2), feeding the same search flow as manual entry.
- **As reported by the user (real-world hardware testing, not verified by browser automation
  in this repo — camera access isn't something an automated agent session can exercise):**
  the **laptop's built-in camera has inconsistent barcode recognition** — it does not reliably
  read ISBN barcodes every time.
- **Manual search works reliably** as the fallback/primary path regardless of camera behavior.
- **The USB barcode scanner (External/keyboard-wedge mode) has NOT been tested yet.** This is
  a concrete, explicit open item — do not assume it works just because the External-mode code
  exists and is theoretically simple (keyboard-wedge scanners emit keystrokes, which the
  External mode is built to capture). It needs a real physical test before being considered
  verified. See §9 step G.

### 5.3 Cover display — no fake fallback (cross-reference)

Already covered in §1.2/§3 — record here for completeness since the user asked for it
explicitly: the `FALLBACK_COVER` Unsplash placeholder was a real bug (stock image presented
as if it were the actual book cover, including in Save/Excel export) and has been **fully
removed**, not just hidden. Verified: 0 fallback images anywhere in the current codebase
(confirmed via grep — zero remaining references to `FALLBACK_COVER`).

---

## 6. Testing status

### 6.1 Automated suites (all in `server/scripts/`, run from `server/`)

| Command | What | Needs server? | Status (fresh run 2026-08-21) |
|---|---|---|---|
| `npm run verify:isbn` | ISBN utils unit checks | no | **22/22** |
| `npm run verify:retry` | mocked reliability/recovery/merge/catalog (deterministic, monkey-patched fetch; publisher-live sources explicitly disabled via `PUBLISHER_LIVE_SOURCES=off` inside the file so real network calls don't leak in) | no (live OL for ~2 cases by design) | **47/48**, sometimes 46/48 — see below |
| `npm run verify:books` | real-book live suite (12+ verified ISBNs, regression cases A–J) | **yes** | Documented 44–45/45 as of 2026-08-20; **not re-run fresh for this handoff** — known caveat below still applies |
| `npm run verify:search` | title/author strategy live cases | **yes** | Documented 9/9 as of 2026-08-20; not re-run fresh for this handoff |
| `npm run catalog:import` | supplier template import CLI | no | Last real use: 223/223 imported clean (2026-08-20) |
| `npm run covers:ingest` | cover download/validation CLI | no | Last real use: 254/254 ingested, 0 failures |
| `npm run evaluate:isbndb` | ISBNdb harness (blocked: no key) | no | ready, unused (decision: stays deferred) |
| `npm run evaluate:crossref` | Crossref eval | no | done — verdict NO VALUE |

**`verify-retry.mjs` — the two residual cases, both confirmed pre-existing/orthogonal, not
regressions from any of today's or yesterday's work:**
1. `CAT-1: supplier direct cover kept` — compares against a raw external cover URL from
   *before* the 2026-08-20 cover-localization work (§3); expected to differ now that covers
   are correctly localized. Stale assertion, not a bug.
2. `cache: second lookup makes ZERO upstream calls` — intermittent; depends on Google Books
   AND Open Library both being fully healthy in the same instant on live network (this
   specific test hits real network, unmocked, by design). Passed clean on the final
   2026-08-21 run; has failed on other runs purely due to live-network timing. Not
   fixture-related, not a code issue.
3. Two mocked-recovery test fixtures (`2A-1`, `2A-2`) **were previously failing** because they
   used متحف البراءة/ثلاثية غرناطة as fixture ISBNs, which got imported into the real catalog
   on 2026-08-20 and started short-circuiting before the GB-503-recovery code path those
   tests exercise ever fired. **Fixed 2026-08-21** by swapping to dedicated synthetic
   checksum-valid ISBNs (`9786039999980`, `9786039999973`) that can never collide with a
   future catalog import — recovery logic itself was never touched, only the test fixtures.

**`verify:books`/`verify:search` caveat (documented 2026-08-20, not re-verified fresh today):**
during Google 503 storms (measured up to 65% per-attempt at times), a Google-only book can
fail all retry attempts in a bad window — 1–3 flaky failures that pass on retry. This is
documented behavior, not a regression; check `meta.googleBooks: 'failed'` before investigating
any failure in these suites. Also: two of `verify:books`'s ISBN cases (متحف البراءة, ثلاثية
غرناطة) are now catalog-served with different page counts than their original GB-based
assertions expected (611/537 vs GB's 415/701) — review those specific assertions before
judging any failure there as a regression.

### 6.2 Live-discovery proof books (the core architecture claim, verified end-to-end)

| ISBN | Book | Proves |
|---|---|---|
| `9786038455647` | إنتامافوبيا | Absent from local catalog + weak GB/OL → found live via 2 independent sources |
| `9786038455593` | ستوكهولم | Absent from local catalog, GB is a bare stub, OL 404 → found live via 2 independent sources |
| `9789922721675` | تشيخوف complete works | Absent from local catalog AND GB AND OL entirely → found live via 1 source |
| `9789770933855` | متحف البراءة | Already in local catalog → catalog wins deterministically even with 2 live sources also returning data in the same request |
| `9786039999997` | (synthetic, vacant) | Genuinely nonexistent → honest empty across catalog + all 3 live sources + GB + OL |

### 6.3 Genuine source-coverage gaps vs. actual software bugs — final tally

**Software bugs found and fixed during this project (all confirmed via live evidence, not
assumption):** the Unsplash fake-cover fallback (§1.2/§5.3); the أدب category-parsing guard
being too rigid for 3-part breadcrumbs; the أدب/شروق nav-vs-wait timeout budget race causing
genuine zero-results to surface as errors; the أدب+شروق concurrent-load timeout headroom being
too tight; the أسير الكتب search-results facet-link false-positive extraction; two stale test
fixtures colliding with a later catalog import.

**Confirmed genuine source-coverage gaps (not bugs — no source, live or static, has real
data):** فجر الاسلام (`9789779648767`, unattributable to any publisher). موردينو
(`9786038596302`, real book, just not yet imported from our own storefront). ساق البامبو and
1984-AR — status genuinely unknown against the live sources (never re-tested), do not assume
resolved or unresolved.

---

## 7. Production/deployment readiness audit (verbatim from the 2026-08-21 audit — nothing has changed since)

### ✅ Ready as-is
- Frontend production build (`npm run build`) succeeds cleanly (3.5s, 1814 modules; only a
  bundle-size warning, not an error).
- `public/templates/*.xlsx` correctly bundled into `dist/templates/` (verified via static
  serve, HTTP 200).
- Backend start command `npm start` = `node src/index.js`, the same entry point run
  successfully many times throughout this project.
- Excel export works in the production build — fully client-side (exceljs bundled), no server
  dependency at export time.
- No hardcoded secrets anywhere in source (grepped for API-key patterns — none found; only
  `.env.example` templates with no real values are tracked in git).
- `/covers/` static route and all API routes are relative/host-independent; both `COVERS_DIR`
  and `DATA_DIR` resolve via `import.meta.url`, safe regardless of process launch directory.
- CORS mechanism itself verified live: a mismatched origin was correctly rejected with a
  clear error, and the frontend degraded honestly instead of breaking.
- Google Books/Open Library/all 3 live publisher sources: zero coupling to frontend/backend
  co-location — pure server-side outbound calls, frontend and backend can be on entirely
  separate domains with no code change.
- Frontend→backend coupling is a single clean point: `VITE_API_BASE_URL` in
  `InstantBookLookup.jsx`, no duplicate/hardcoded fetch calls elsewhere.

### ⚠️ Needs configuration (not broken, but must be set correctly at/before deploy)
- `CLIENT_ORIGIN` (backend) — must equal the real production frontend origin exactly (CORS is
  a single-string match currently, no wildcard/array).
- `VITE_API_BASE_URL` (frontend, **build-time**) — must point at the real production backend
  URL; changing it later requires a rebuild, not just a redeploy.
- `GOOGLE_BOOKS_API_KEY` — required in production `.env`; without it GB is skipped gracefully
  (not a crash) but production would silently lose the primary metadata source.
- `PORT` — defaults to 3001, fine unless the platform assigns its own (already read correctly
  if so).
- `PUBLISHER_LIVE_SOURCES` — not documented in `.env.example` (stale — added after the
  template was last updated); defaults ON; explicitly confirm this is intended for production
  since it now launches headless Chromium per relevant request.
- `.env.example` is stale generally — missing `PUBLISHER_LIVE_SOURCES` and `COVER_SERVE_BASE`
  entirely.
- Hosting platform must support a **persistent Node process** — confirmed no
  serverless/edge-function assumptions exist in the code, but this needs to be an explicit
  platform choice, not incidental.

### ❌ Must be fixed before deployment
1. **All 254 cover URLs hardcoded to `http://localhost:3001`** — see §3.4 for the exact fix
   (two options, neither needs a code change, both need the production backend domain known
   first).
2. **`server/data/` (catalog + 63MB of covers) is not in git and has no persistence plan** —
   confirmed entirely untracked. If deployed via any git-based pipeline, this data simply
   wouldn't exist on the deployed instance; even if manually copied over once, most hosting
   platforms' filesystems reset on redeploy/restart unless a real persistent volume is
   explicitly provisioned (do not assume persistence). Requires an explicit decision: commit
   to git (only if the platform's filesystem is verified persistent across restarts), or
   provision a real persistent volume, or (more robust long-term) migrate to a real
   database + object storage.
3. **Playwright's Chromium binary is not installed by `npm install`** — confirmed no
   `postinstall` hook exists; `npx playwright install chromium` (or `--with-deps` on Linux)
   must be an explicit step in whatever deploy pipeline is chosen. Not yet exercised on a
   fresh Linux host (this dev environment is Windows) — worth a smoke test before relying on
   it in production.
4. **No deployment target/config exists at all** — confirmed: no `Dockerfile`, `Procfile`, or
   any platform config anywhere in the repo. Items 1–3 above can't be finalized in the
   abstract; the exact remediation depends on which platform is chosen.

### Item 10 of the original audit — exactly what would be deployed right now
- Real git repo, `main` branch, tracking `origin/main` (has a real remote).
- **HEAD is at `e0625ec`** — every feature built since then (catalog import, cover storage,
  all 3 live publisher sources, the whole V2 frontend) is uncommitted working-tree changes.
- `PROJECT_HANDOFF.md` itself is untracked.
- Deploying "the current project" today would mean deploying from this uncommitted state —
  no rollback point, no PR/review trail — independent of and in addition to the hosting
  platform/persistence questions above.

---

## 8. Deployment blockers

- ✅ **Hosting platform chosen (2026-08-21): Render**, Docker-based deploy. Rationale: the
  architecture's hard requirements are a persistent Node process + a persistent filesystem for
  `server/data/` + an explicit Playwright/Chromium install step — Render's persistent Disks
  feature + Docker support satisfy all three with the least new work, at predictable flat
  pricing (paid "Web Service" tier required — the free tier spins down on inactivity, which
  would violate the "must run persistently" requirement in §1). Railway was evaluated as a
  close second (similar volumes/Docker support, usage-based pricing) but not chosen — no
  concrete blocker, just a preference for flat/predictable pricing on an internal tool.
  Migrating to a DB + object storage (Postgres + S3/R2) before deploying was also considered
  and explicitly deferred — correct long-term direction if the catalog outgrows a single disk,
  but not required just to go live. **Nothing has been implemented yet** — no Dockerfile, no
  render.yaml, no code/config changes made as a result of this decision. See §9 step C for what
  implementing it actually requires.
- ❌ **Persistent storage strategy not yet implemented** (decision made — Render persistent
  Disk mounted at `server/data/` — but no Dockerfile/render.yaml exists yet to act on it).
- ❌ **Production cover URL rewrite not done** — still `http://localhost:3001` in all 254
  records right now.
- ❌ **Playwright production installation not configured** — no deploy pipeline runs the
  Chromium install step, because no deploy pipeline exists.
- ❌ **Deployment config does not exist yet** — no Dockerfile/Procfile/platform config of any
  kind.
- ❌ **No deployment has happened.** The system has never been hosted anywhere outside this
  local machine.

**Context for the next session:** the user's manager has asked for the system's link once
testing is complete. That request is still open — there is nothing to send yet.

---

## 9. Exact next steps (in order — the next session should follow this sequence)

**A.** ✅ Hosting platform chosen (2026-08-21): **Render**, Docker-based deploy (see §8).
**B.** ✅ Persistent storage strategy decided (2026-08-21): a **Render persistent Disk** mounted
   at `server/data/` (covers `.env.example`, not yet implemented in config — see C).
**C.** 🟡 **Deployment-prep files written 2026-08-21 — config only, nothing deployed, committed,
   or migrated.** Done:
   - `server/Dockerfile` — `FROM mcr.microsoft.com/playwright:v1.62.1-noble` (pinned to match
     `server/package.json`'s exact `playwright` version — bump both together or Chromium/library
     versions mismatch and Playwright refuses to launch). Ships Chromium pre-installed, so no
     separate `npx playwright install` step is needed. `npm ci --omit=dev`, copies `src/` +
     `scripts/`, `CMD node src/index.js`. Deliberately does **not** COPY `server/data/` — that
     stays off the image, see disk note below.
   - `server/.dockerignore` — excludes `node_modules`, `data`, `*.log`, `.env*` (keeps
     `.env.example`).
   - `render.yaml` (repo root) — two services: `kingdom-of-books-api` (Docker web service,
     `rootDir: server`, `plan: starter` — required for disk support and to avoid the free
     tier's spin-down, which would violate §1's persistence requirement) with a persistent
     Disk `sizeGB: 1` mounted at `/app/data`; `kingdom-of-books-frontend` (Render Static Site,
     `rootDir: my-book-app`, `buildCommand: npm ci && npm run build`,
     `staticPublishPath: ./dist`). Secret/domain-dependent env vars (`CLIENT_ORIGIN`,
     `GOOGLE_BOOKS_API_KEY`, `COVER_SERVE_BASE`, `VITE_API_BASE_URL`) are marked `sync: false`
     — set once in Render's dashboard, never committed.
   - `server/.env.example` updated with the previously-missing `PUBLISHER_LIVE_SOURCES` and
     `COVER_SERVE_BASE` entries (documentation only, no real values).
   - **Why `/app/data` specifically**: `cover.service.js:25` and `catalog.service.js:33` both
     resolve storage as `path.resolve(__dirname, '../../data...')` relative to `src/services/`
     — with `src/` copied to `/app/src` in the image, that relative path lands on `/app/data`
     exactly. The disk mounts there so **zero application code changes** were needed to make
     persistence work.

   **Local validation pass (2026-08-21), before any deploy:**
   - ❌→✅ **Found and fixed a real bug**: `render.yaml` originally hardcoded
     `envVars: [{key: PORT, value: 3001}]`. Confirmed via Render's own docs and community
     reports that Render injects its own `PORT` env var into Docker web services (default
     10000) and routes traffic to whatever value that variable holds — manually pinning it is
     an anti-pattern that has caused exactly this kind of routing mismatch for other users.
     **Removed** the `PORT` env var entirely from `render.yaml`; the app's existing
     `config/env.js:9` (`process.env.PORT || 3001`) already does the right thing on its own,
     confirmed live by starting the server locally with `PORT=39912` and getting a correct
     response from `/api/health` on port 39912 — the app is not hardcoded to 3001.
   - **No Docker/Podman/nerdctl/WSL available in this environment** — could not literally
     `docker build`/`docker run` the Dockerfile. Substitute validation performed instead:
     - Confirmed the pinned base image tag **`mcr.microsoft.com/playwright:v1.62.1-noble`
       exists** on the registry (queried the real tag list — 63 matching `1.62.x` tags found,
       including this exact one — and got HTTP 200 on its manifest).
     - Ran the actual server locally (`node src/index.js`, same code that ships in the image)
       on an isolated port so it wouldn't collide with the already-running dev instance;
       `/api/health` → `200 {"status":"ok",...}`.
     - Hit `/api/search` for a known catalog ISBN (`9789779924731`) against the real
       `server/data/` on disk: returned `source: publisher_catalog` (fill-only priority holds),
       **and `publisherLive: {aseeralkotb: "ok", shorouk: "ok"}`** — confirming the shared
       Playwright browser actually launched and both browser-based live sources rendered
       successfully in this Node/Playwright version pairing. `googleBooks: "ok"` too.
     - **This is not equivalent to validating the container itself** — Ubuntu/Chromium system
       libraries inside the pinned image, the exact `npm ci --omit=dev` install, and the
       `/app/data` mount path were not exercised. Docker itself (or WSL2, which Docker Desktop
       on Windows requires) needs to be installed before a real `docker build .` can happen —
       not done, since installing it would mean enabling a Windows feature (WSL2/Hyper-V),
       which is a system-settings change outside what should happen without being asked first.
     - `render.yaml` re-parsed clean (valid YAML) after the fix; all Dockerfile-referenced
       paths (`package.json`, `package-lock.json`, `src/`, `scripts/`) confirmed present.
     - `my-book-app`'s production build re-run fresh: succeeded (3.06s, 1814 modules, only the
       pre-existing bundle-size warning) and `dist/templates/` confirmed to contain both real
       `.xlsx` templates — Excel export's build-time dependency is intact.

   **Pre-deploy checklist confirmed 2026-08-21 (read-only — nothing deployed, uploaded, or
   edited beyond what's noted):**
   - **Env vars, enumerated by grepping every `process.env.*` read in `server/src/**`**
     (single read point, `config/env.js`) **and `my-book-app/src/**`**: backend needs
     `CLIENT_ORIGIN`, `GOOGLE_BOOKS_API_KEY`, `PUBLISHER_LIVE_SOURCES` (optional, defaults on);
     `ISBNDB_API_KEY` correctly stays unset in production (only the standalone
     `evaluate:isbndb` script reads it, never the search path); `COVER_SERVE_BASE` is read
     **only** by `scripts/covers-ingest.mjs`, not by the running server — pre-stage it anyway
     for when that script is run later via Render's Shell. Frontend needs `VITE_API_BASE_URL`
     (build-time). `PORT` must **not** be set manually (see the render.yaml fix above). Render
     assigns URLs as `{service-name}.onrender.com` deterministically, confirmed against
     Render's docs — so `https://kingdom-of-books-api.onrender.com` and
     `https://kingdom-of-books-frontend.onrender.com` are knowable now, before any deploy.
   - **Disk mount re-confirmed against Render's actual constraints** (absolute path required;
     cannot be `/`, `/opt`, `/home`, `/etc`, or their immediate subdirectories) — `/app/data`
     is clear of all of these. Permanent tradeoff confirmed: a service with a disk attached
     can't be scaled to multiple instances — irrelevant for this single-office tool, but a real
     constraint of the design, not an oversight.
   - **Data-copy mechanism confirmed**: Render's documented supported method is SCP over SSH
     (or Magic-Wormhole without SSH) — requires the paid plan (already `starter`) and an SSH
     public key added to the Render account once. **Real gap found**: Render's docs state a
     Docker-runtime image needs its own `~/.ssh` directory (`chmod 0700`) for SSH/dashboard
     Shell access to work at all — `server/Dockerfile` doesn't create one yet. This will block
     both SCP and the Shell tab until added; **not fixed yet**, flagged for the next actual
     Dockerfile edit before data copy is attempted.
   - **Cover URL strategy decided**: use the `covers:ingest -- --execute --refresh` route (not
     a plain string-replace) — the `kingdomofbook.com`-sourced covers' signed URLs (12h expiry,
     fetched 2026-08-20) are certainly expired by now, so `--refresh` re-resolving fresh signed
     URLs is necessary regardless; a plain string-replace would just relabel already-broken
     links. Can run locally (script has no Playwright dependency) before the SCP step, so
     correct data gets copied up in one pass.
   - **Build/start commands confirmed exact, nothing missing**: backend (`runtime: docker`)
     has no separate build/start fields — Render builds `server/Dockerfile` directly and its
     `CMD ["node","src/index.js"]` is the start command. Frontend (`runtime: static`) uses
     `buildCommand: npm ci && npm run build` / `staticPublishPath: ./dist`; static sites have
     no start command, Render serves the published directory directly.

   **Still not done (explicitly, do not assume otherwise):**
   - **No data has been uploaded to any disk** — a fresh deploy today would start with an
     *empty* `/app/data`. Confirmed in this pass: `catalog.service.js:73-81`'s `loadCatalog()`
     fails silently to `{version:1, books:{}}` on a missing file — no crash, but a silently
     empty catalog. Getting the real 254 records + 63MB of covers onto the disk is a deliberate
     future action (a real data migration), not yet done.
   - **The 254 hardcoded `http://localhost:3001` cover URLs are still unrewritten** (§3.4) —
     can't be done until the real Render backend URL exists, which only happens after a first
     deploy.
   - No `git add`/commit of any of this. No deploy. No `.env` real secrets touched.
**D.** Commit the stable working tree (currently all uncommitted since `e0625ec`) — a
   deliberate review/commit pass, not a rushed one.
**E.** Deploy.
**F.** Test the deployed system from another device (not this dev machine) — confirms
   frontend↔backend connectivity, CORS, cover loading, and the live publisher sources all
   work correctly from outside localhost.
**G.** Test the USB barcode scanner for real (§5.2 — this has never been tested, do not skip).
**H.** Final fixes/redeploy based on what F and G surface.
**I.** Send the manager the final system URL — **only after** F, G, and H are done, not before.

Earlier-identified but lower-priority next steps (unchanged from before, still valid, come
after the deployment sequence above unless the user redirects):
- Kingdom of Books official catalog export → `catalog:import` (closes the موردينو-class gap;
  also would need cover re-download before any signed URLs expire).
- Provenance/matchStatus contract (per-field source+status in `/api/search`, consumed by the
  existing frontend highlight system) — the live sources' `needsReview` flag is a natural
  first input to this, currently additive-only and unconsumed.
- `POST /api/catalog/import` endpoint + upload/batch phase (nothing exists yet).
- ISBNdb trial — stays deferred; the 3-source live-discovery proof is direct evidence free
  sources can still close real gaps.
- OCR/PDF parse phase (`upload.controller` is a 501 stub).
- Do NOT add a 4th live publisher source without explicit user go-ahead (see §2.2 for why the
  evaluated candidates don't currently clear the bar).

---

## 10. Decision log (confirmed business rules — do not reinterpret)

1. **Never invent metadata.** Missing stays missing (and gets highlighted). No AI metadata
   source; Gemini removed permanently from search.
2. VAT is always 15%, price entered pre-VAT, Excel gets incl-VAT.
3. ISBNs: checksum-valid canonical ISBN-13 or empty — never "fixed", never from OTHER
   identifiers; exact-ISBN results must carry the requested ISBN (scanner-grade strict).
4. Supplier catalog data is authoritative for that supplier's books (fill-only merge on top).
   Live publisher sources sit one tier below the catalog, one tier above GB/OL, same
   fill-only rule.
5. Genre is a controlled 34-entry list (IDs stable across languages); unapproved values stay
   raw + needs-review; alias-map only confident synonyms.
6. Excel templates are the org's real files, verbatim wording (incl. typos); export template
   choice is explicit, independent of UI language.
7. Sources stay independent (one failing never blocks the other); honest empty over guessing.
8. Evaluate free sources before paid (Crossref/LoC/Wikidata/Internet Archive eliminated with
   evidence; ISBNdb trial shelved — repeatedly reconfirmed still unnecessary).
9. Never display or export a fallback/stock image as if it were a real book's cover.
10. A book found via a live publisher source is never auto-written into the local catalog —
    the catalog only grows via the explicit human-approved import process.

---

## 11. Source evaluations (external sites/publishers — condensed; full detail was in earlier
sessions' transcripts, key conclusions here)

- **kingdomofbook.com** (our own storefront): Next.js, no public API, ~1,380 products.
  Verdict: HIGH VALUE via an **official export**, not scraping — ask the web team for a
  DB/catalog export and feed it through `catalog:import`.
- **jarir.com**: rich data (schema.org JSON-LD, ~10k+ searchable Arabic/English), but
  `robots.txt` wholesale-blocks scraper bots (names anthropic-ai/ClaudeBot explicitly) plus
  Cloudflare defense. Verdict: HIGH-VALUE data, **NO legitimate automated path** — do not
  scrape or integrate; manual reference only.
- **7-publisher website evaluation** (عصير الكتب, مركز الأدب العربي, دار الشروق, دار التنوير,
  منشورات الوسم, دار زحمة كتاب, نوفا بلس) plus مكتبة مدبولي: full results in §2.2/§4. The
  three highest-value candidates were implemented as live sources (§4); the rest are
  deliberately not, for the specific reasons in §2.2.
- Cross-source note: keyless Google Books now has **zero** quota from this network — an API
  key is mandatory for any GB call, keyless testing will always 429.

---

## 12. Gotchas for future sessions

- Windows PowerShell 5.1: no `&&`; Arabic output needs
  `sys.stdout.reconfigure(encoding="utf-8")` in Python helpers; kill port-3001 orphans via
  `Get-NetTCPConnection` before restarting.
- `npm start` (server) is plain `node` — **no watch**; restart after server edits
  (`npm run dev` watches).
- Frontend/server `bookModel.js` duplication is deliberate (D5) — mirror changes in both.
- Browser-pane automation: a hidden/backgrounded tab freezes CSS transitions & throttles
  timers (ExcelJS in-browser work, or Playwright pages, can look "hung" when not the
  foregrounded tab — it isn't actually stuck).
- Suite fixtures are clearly-labeled mocks using real bibliographic values — keep it that way
  (never fabricate "real" test data).
- Two of the three live publisher sources depend on a shared Playwright browser instance
  (`renderClient.js`) — if a 4th browser-dependent source is ever added, re-check the
  concurrent-load timeout headroom lesson from §4.2/§4.3 rather than assuming the existing
  budgets scale automatically.
- `verify-retry.mjs` intentionally sets `PUBLISHER_LIVE_SOURCES=off` via a **dynamic**
  `import()` (a static import is hoisted before any `process.env` line can run — this bit
  the first fix attempt) to keep its fetch-mocking fully offline.
