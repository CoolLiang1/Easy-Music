# V1.1 Cover Editing Acceptance

This document records the V1.1 cover-editing verification flow for Easy Music.
Cover editing is an explicit owner-managed Web action: it replaces the stored
track cover image, but does not regenerate playback audio or modify the
preserved original audio file.

## Scope

In scope for this acceptance pass:

- Authenticated `PUT /api/tracks/{id}/cover` for explicit image upload.
- Authenticated `GET /api/tracks/{id}/cover` for current-cover preview.
- Backend ownership checks for cover upload and retrieval.
- Backend image content-type, size, signature, and stored-path validation.
- Cover storage under the configured cover media directory.
- Web Track Detail current-cover preview, selected-image preview, upload, and
  post-upload refresh behavior.

Out of scope for V1.1 cover editing:

- Automatic cover fetching from internet services.
- Editing embedded artwork inside original audio files.
- Playback audio regeneration.
- Bulk cover cleanup or deletion.
- Android UI changes.

## Automated Verification

Latest local automated result, 2026-06-09:

- `.\.venv\Scripts\python.exe -m pytest tests\test_tracks_api.py tests\test_media_storage.py`
  from `backend/`: passed, 41 tests.
- `npm run typecheck` from `web/`: passed.
- `npm run build` from `web/`: passed.

Android checks were not run because the shared track payload shape and Android
client code were not changed.

## Manual Web Smoke Flow

Run this flow in a browser against a local backend. Do not commit generated
test media, uploaded cover images, or local database/media state.

1. Start PostgreSQL, apply migrations, start the API, and create or reuse a
   local user.
2. From `web/`, start Vite with the local API base URL:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Open the Vite URL and log in.
4. Upload or reuse a track, then process it with the worker until it is ready.
5. Open the track detail page.
6. Choose a PNG, JPEG, or WebP cover image.
7. Confirm the selected-image preview appears.
8. Upload the cover.
9. Confirm the page reports success and shows the updated current-cover preview.
10. Refresh the page and confirm the current-cover preview still loads.
11. Confirm Web playback still works for the track.
12. Confirm original and playback media paths are unchanged.
13. Try an invalid non-image or mismatched image upload and confirm it is
    rejected.

## Manual Verification Record

- Local backend date: 2026-06-09.
- Web browser and URL: passed by manual operator verification against the local
  Web console.
- Cover upload from Track Detail: passed.
- Selected replacement preview appears before upload: passed.
- Updated current cover persists after refresh: passed.
- Web playback still works after cover replacement: passed.
- Original and playback media paths remain unchanged: passed.
- Invalid file rejection: passed.

Current status, 2026-06-09:

- Automated backend and Web checks passed.
- Manual Web smoke passed by operator verification.
- V1.1 cover editing is accepted for the Web owner-managed cover replacement
  workflow.

## Android Impact

No Android UI, behavior, or model code was changed for V1.1 cover editing. The
existing track response shape was preserved, and the new cover endpoints are a
Web management surface. Android playback, cache, Recommendation V1, and AI
Assistant V1 flows are therefore unchanged by cover editing.
