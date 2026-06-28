# V1.1 Duplicate Detection Acceptance

This document records the V1.1 duplicate-detection verification flow for Easy
Music. Duplicate detection is advisory only: it can show exact and likely
duplicate candidates, but it must not delete, merge, overwrite, hide, or modify
tracks automatically.

V1.1 duplicate detection is accepted only after the automated checks and the
manual Web smoke flow below have both completed against a local backend with a
local user and test media that is not committed.

## Scope

In scope for this acceptance pass:

- Track duplicate signal storage for original file size, original SHA-256,
  normalized metadata key, and playback SHA-256 when available.
- Backend duplicate grouping for exact file matches and conservative
  metadata/duration matches.
- Authenticated read-only `GET /api/tracks/duplicates`.
- Optional duplicate filtering by owned `track_id`.
- Web upload duplicate warning after successful uploads.
- Web duplicate review view at `/duplicates`, reachable from Library.
- Track Detail navigation from duplicate candidate links.

Out of scope for V1.1 duplicate detection:

- Merge, delete, overwrite, auto-hide, or cleanup actions.
- AI-based duplicate detection.
- Fuzzy audio fingerprinting, waveform analysis, embeddings, or ML matching.
- Android UI changes.
- Batch tag editing, upload-progress improvements, reports, cover editing, or
  later V1.1 candidate features.

## Automated Verification

Run focused duplicate backend checks from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_duplicate_signals.py tests/test_duplicates_service.py tests/test_duplicates_api.py
```

Expected result:

- Duplicate signal tests pass for model fields, saved-file hash generation,
  missing-file behavior, and normalized metadata keys.
- Duplicate service tests pass for original and playback hash matches,
  metadata/duration matches, insufficient data, current-user isolation,
  processing/failed track handling, stable reasons, and no mutation.
- Duplicate API tests pass for auth, empty result, current-user isolation,
  exact and likely groups, `track_id` filtering, invalid/unowned track ids,
  compact safe candidate payloads, and no mutation.

Run Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript completes without errors.
- The production Vite build completes.
- Upload duplicate warnings, the Library link, `/duplicates`, Track Detail,
  Tags, Upload, Web playback, Recommendation, and AI Assistant code compile
  together.

Latest local automated result, 2026-06-04:

- `.\.venv\Scripts\python.exe -m pytest tests/test_duplicate_signals.py tests/test_duplicates_service.py tests/test_duplicates_api.py`
  from `backend/`: passed, 22 tests.
- `npm run typecheck` from `web/`: passed.
- `npm run build` from `web/`: passed.

## Manual Web Smoke Flow

Run this flow in a browser against a local backend. Do not commit generated test
media or local database/media state.

1. Start PostgreSQL, apply migrations, start the API, and create or reuse a
   local user.
2. From `web/`, start Vite with the local API base URL:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Open the Vite URL and log in.
4. Upload a unique supported audio file.
5. Confirm the upload result completes normally and shows no duplicate warning
   after the duplicate check finishes.
6. Process the track with the worker until it is `ready`.
7. Upload the same audio file again.
8. Confirm the upload result still completes normally and shows an advisory
   duplicate warning for an exact or likely duplicate candidate.
9. Confirm the warning includes candidate title, artist, album or duration, and
   match reason.
10. Open Library, then open `Review duplicates` or the sidebar `Duplicates`
    route.
11. Confirm `/duplicates` shows grouped candidates with exact or likely match
    reasons and confidence.
12. Open a candidate Track Detail link and confirm the existing detail page
    still loads.
13. Confirm normal Library search/list, Upload, Tags, Track Detail, Web
    playback, Recommendation, and AI Assistant pages still work.
14. Confirm no duplicate workflow deletes, merges, overwrites, hides, or
    modifies tracks automatically.

## Manual Verification Record

- Local backend date: 2026-06-04.
- Web browser and URL: passed by manual operator verification against the local
  Web console.
- Unique upload shows no duplicate warning: passed.
- Exact duplicate upload shows advisory warning: passed.
- Library duplicate review shows grouped candidates: passed.
- Candidate Track Detail navigation works: passed.
- No duplicate workflow deletes, merges, overwrites, hides, or modifies tracks:
  passed.
- Existing Library, Upload, Tags, Track Detail, Web playback, Recommendation,
  and AI Assistant regression smoke: passed.

Current status, 2026-06-04:

- Automated duplicate backend and Web checks passed.
- Manual Web smoke passed by operator verification.
- V1.1 duplicate detection is accepted for the advisory duplicate workflow.

## Android Impact

No Android UI or behavior was changed for V1.1 duplicate detection. The
duplicate endpoint is a Web management surface. Track responses gained duplicate
signal fields during V1.1, but the Android client parses only the known fields
it uses from `JSONObject` and ignores additional response keys. Android
playback, cache, recommendation, and AI Assistant flows are therefore unchanged
by the duplicate review workflow.
