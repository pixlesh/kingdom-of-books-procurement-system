# Changelog — Kingdom of Books (مملكة الكتب)

## v1.0 — 2026-08-01

First production release of the internal book-procurement tool: search real book
databases, review and correct metadata by hand, and export the company's official
Arabic supplier Excel list.

### Added
- **Unified orchestrated search** (`GET /api/search`): backend queries Google Books
  and Open Library concurrently, normalizes everything into the unified Book Model,
  merges and deduplicates (ISBN first, then title+author; richer record wins), and
  returns ready-to-render books with honest per-source `meta` status. (`455fb63`)
- **Single-request frontend**: the React app makes exactly one request per search;
  all external API access and keys live server-side only. (`683bf9d`)
- **Strict AI policy, enforced server-side**: Gemini may suggest whole books only
  when *both* trusted sources return zero results; it never fills missing fields
  and its data is never merged into a trusted record. Failure or missing key
  degrades to an honest empty result. (`455fb63`)
- **Real Excel export**: generates the official supplier template (`.xlsx`) —
  RTL sheet, merged title banner, headers at row 7 with the confirmed business
  vocabulary (`رقم الطبعة`, `سعر البيع مع الضريبة`), template column widths, typed
  cells (numeric ISBN format `0`, numeric pages/price, year as a date cell shown
  as `yyyy`, clickable cover-image hyperlink), and genuinely blank cells for
  missing values. ExcelJS loads on demand (separate chunk). (`90ad03a`)
- **Description field** on the review screen — all 10 exported template columns
  are now human-reviewable before export. (`08d4aa9`)
- **Export queue persistence** across sessions via versioned `localStorage`
  (`kob.exportQueue.v1`) with defensive hydration: invalid entries dropped,
  deduplication by id, partial restore on partial corruption. (`f117848`)
- **Export visual states**: exporting/success/failure/empty-queue feedback with
  the generated filename, plus double-click protection. (`d504620`)

### Fixed
- Removed all fabricated metadata: upload mock no longer invents a publication
  year or genre; the decorative "CHECKSUM: PASS" banner (an unbacked verification
  claim) was removed. (`08d4aa9`)
- Search effect no longer calls setState synchronously inside the effect
  (render-phase adjustment); ESLint fully clean. (`d137c92`)
- Transient Google Books 503/429 responses are retried once (800 ms backoff),
  restoring pre-migration resilience discovered missing during production
  verification. (`8d5bf15`)

### Verified in production (real keys, real services)
- Live merged search with cross-source deduplication (12+12 → 20).
- Real Google Books descriptions flow to the review screen and Excel column B.
- Manual price entry flows to Excel column F; no source ever populates price.
- Full workflow: search → review/edit → save → queue → reload (persisted) →
  export; generated file re-verified programmatically (10/10 checks).
- Graceful degradation observed against a real upstream outage.

### Known limitations
- **Gemini free-tier quota**: the configured key is valid but its free-tier quota
  was exhausted during verification (HTTP 429), so a live *successful* AI
  suggestion could not be observed; the gate logic is verified by mocked
  scenarios and live negative-path testing. Resolves via quota reset or billing.
- Upload parsing is an honest placeholder (title hint from filename only);
  real OCR is planned post-v1.0.
- Single-user, single-browser tool: the queue persists per browser profile;
  no multi-user sharing, no authentication.
