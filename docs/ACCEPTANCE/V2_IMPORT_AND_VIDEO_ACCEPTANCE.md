# V2 Import And Video Processing Acceptance

This document defines the acceptance path for two V2 Easy Music features:

1. Automatic import tools.
2. Optional user-provided video-to-audio processing.

Do not mark either feature accepted until the relevant automated checks and
manual smoke flows have actually completed. Test media, local database files,
temporary videos, extracted audio, and local media directories must not be
committed.

## Scope

In scope:

- Admin-configured allowlist of local import directories.
- Read-only scan preview for supported audio files.
- Explicit user confirmation before import.
- First-version import strategy: copy source audio into controlled Easy Music
  media storage and keep the source file unchanged.
- Normal Track creation, processing job creation, worker processing, media
  storage, duplicate signals, and status handling for imported audio.
- Per-file import success, skipped, and failed states.
- Web import scan, candidate review, duplicate warning, confirm, result, and
  processing refresh UI.
- User-provided video upload from Web.
- Backend video upload validation and temporary video storage.
- Worker FFmpeg extraction of audio from user-provided video.
- Extracted audio entering the existing audio processing flow.
- Optional import-directory support for supported video files.
- Temporary video lifecycle policy.
- Windows / PowerShell local verification and Ubuntu Docker deployment notes.

Out of scope:

- Automatic internet download.
- Automatic Bilibili download.
- Bilibili metadata import unless a later task scopes it separately.
- Full-library media manager behavior.
- Batch delete, source cleanup, move, rename, or destructive file operations.
- Keeping original videos as library media files.
- Large ML/recommendation changes.
- Android UI changes unless shared track response compatibility breaks.

## Feature Acceptance Gates

### Gate 1: Import Path Safety

Required before any scan or import endpoint can be accepted:

- Import roots are configured only through environment/configuration.
- Disabled configuration returns a clear disabled response.
- Requested scan paths are resolved inside a configured root.
- Traversal attempts are rejected.
- Broad system directories are rejected by policy.
- API responses do not expose unrestricted absolute paths.
- No source files are deleted, moved, renamed, or modified.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py
```

Expected result:

- Allowed root, nested directory, disabled config, traversal, broad directory,
  and path normalization tests pass.

### Gate 2: Audio Scan Preview

Required behavior:

- Authenticated scan endpoint returns supported audio candidates from an
  allowed import directory.
- Supported formats match existing audio upload support: MP3, FLAC, M4A, WAV,
  and OGG.
- Unsupported files are skipped or reported with safe reasons.
- Empty directories, missing paths, permission errors, scan limits, and
  unauthorized access are handled.
- Scan is read-only and creates no tracks or jobs.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_scan_api.py
```

Expected result:

- Auth, disabled configuration, allowed scan, unsupported format, scan limits,
  missing directory, traversal rejection, and no-mutation tests pass.

### Gate 3: Confirmed Audio Import

Required behavior:

- User explicitly confirms selected files before import.
- Import copies each selected source audio file into controlled original media
  storage.
- Source files remain in place and unchanged.
- Each successfully copied audio file creates a normal `Track` and pending
  processing job.
- Worker can process imported tracks to `ready`.
- Failures are reported per file without hiding successful imports.
- Duplicate candidates are advisory only and do not block import by default.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_confirm_api.py tests\test_worker.py tests\test_processing.py
```

Expected result:

- Valid copy import, source retention, processing job creation, partial failure,
  duplicate warning, unsupported file, oversized file, path safety, and worker
  regression tests pass.

### Gate 3.5: Import Status And Batch History

Required behavior:

- Confirmed imports create safe batch history for the authenticated user.
- Batch items record configured root id, relative source path or safe display
  name, per-file status, resulting track id when created, UI-safe error
  message, and timestamps.
- API can return the latest import batch and a specific batch for the current
  user.
- Ownership isolation prevents one user from reading another user's import
  batch.
- Track processing status remains the source of truth for transcoding results.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_batch_history_api.py
```

Expected result:

- Safe response fields, latest/specific batch reads, ownership isolation,
  partial failure state, and imported item links to created tracks pass.

Required Web checks still belong to Gate 4 and must not be marked complete
until the Web import UI exists and has been tested.

### Gate 4: Web Import UI

Required behavior:

- Web displays configured import roots as safe labels.
- User can scan, review candidates, select files, and confirm import.
- Candidate list shows relative path, filename, extension, size, and support
  status.
- Duplicate warnings are advisory.
- Result list shows imported, skipped, and failed states per file.
- Imported tracks link to Track Detail.
- Existing upload, library, duplicate review, track detail, Web playback,
  recommendation, and AI Assistant pages still compile and load.

Required Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript and production build complete without errors.

### Gate 5: Video Upload And Temporary Storage

Required behavior:

- Authenticated Web video upload endpoint accepts only documented video formats.
- Upload size limit is enforced.
- Temporary video paths are generated under controlled storage.
- Temporary video files are not stored as track originals, playback files, or
  cover files.
- API creates a processing track and a video extraction job.
- API responses do not expose raw temporary paths.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py tests\test_media_storage.py
```

Expected result:

- Auth, valid upload, unsupported file, oversized file, temp path safety, job
  creation, and safe response tests pass.

### Gate 6: Worker Video-To-Audio Extraction

Required behavior:

- Worker recognizes video extraction jobs.
- FFmpeg extracts audio from the temporary video into a controlled audio
  original path.
- Existing metadata extraction, playback MP3 generation, duplicate signals, and
  ready/failed status behavior run after extraction.
- Videos with no audio stream fail with a clear message.
- Corrupt or unsupported video processing fails without crashing the worker.
- Temporary video lifecycle follows the documented policy and never recursively
  deletes directories.
- Normal audio upload and normal audio import still work.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_processing.py tests\test_worker.py tests\test_uploads_api.py
```

Expected result:

- Successful extraction, no-audio failure, FFmpeg failure, temp lifecycle,
  rerun behavior, and existing audio upload regression tests pass.

### Gate 7: Web Video Upload UI

Required behavior:

- Web offers video upload as an optional section distinct from audio upload.
- Web shows accepted formats, size limits, upload progress, extraction status,
  ready state, and failed state.
- Failed extraction messages are understandable and do not expose stack traces
  or temporary paths.
- Ready extracted tracks behave like normal ready tracks.

Required Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript and production build complete without errors.

### Gate 8: Import Directory Support For Video Files

Required behavior:

- Import scan can classify `audio`, `video`, and `unsupported` candidates.
- User explicitly selects video candidates before import.
- Audio candidates use the audio import copy-and-process path.
- Video candidates use the temporary video extraction path.
- Mixed audio/video imports report per-file results.
- Source files remain unchanged.

Recommended automated check from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_scan_api.py tests\test_imports_confirm_api.py tests\test_video_processing.py
```

Expected result:

- Mixed scan, mixed confirm, source retention, partial failure, unsupported
  handling, video path safety, and worker extraction tests pass.

## Manual Local Smoke Flow: Audio Import

Run this flow on Windows with PowerShell against a local backend. Use throwaway
test media that is not committed.

1. Start PostgreSQL and API, apply migrations, and create or reuse a local
   user.
2. Configure a local throwaway import root outside the repository, for example
   a temporary directory with a few test audio files.
3. Start the Web app:

   ```powershell
   cd web
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

4. Log in through the Web console.
5. Open the import page.
6. Select a configured import root and scan it.
7. Confirm supported audio files appear and unsupported files are skipped or
   explained.
8. Confirm paths are displayed as safe relative paths, not unrestricted absolute
   server paths.
9. Select one unique audio file and one known duplicate candidate if available.
10. Confirm import.
11. Confirm the source files still exist in the import directory.
12. Confirm imported items show per-file result states and created track links.
13. Run the worker:

    ```powershell
    cd backend
    .\.venv\Scripts\python.exe -m app.worker
    ```

14. Refresh Web Library or Track Detail until imported tracks become `ready`.
15. Play a ready imported track through Web playback.
16. Confirm duplicate warnings remain advisory and no duplicate track is
    deleted, merged, overwritten, hidden, or modified automatically.

Expected result:

- Scan is read-only.
- Import is explicit and per-file.
- Source files are preserved.
- Imported audio uses the same processing and playback behavior as normal
  uploads.
- Existing Web Library, Upload, Track Detail, Tags, Duplicates,
  Recommendations, and AI Assistant flows still work.

## Manual Local Smoke Flow: Video Upload

Run this flow on Windows with PowerShell against a local backend. Use throwaway
video files that are not committed.

1. Confirm FFmpeg and ffprobe are available:

   ```powershell
   ffmpeg -version
   ffprobe -version
   ```

2. Create or choose a small local video file with an audio stream.
3. Optionally create a no-audio video file to verify failure behavior.
4. Log in through the Web console.
5. Open Upload and use the optional video upload section.
6. Upload the valid video file.
7. Confirm upload progress appears and a processing track is created.
8. Run the worker:

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m app.worker
   ```

9. Refresh the created track until it becomes `ready`.
10. Confirm the resulting track streams as normal MP3 playback in the Web app.
11. Confirm the original video is not exposed as a library original, playback
    file, stream, or download.
12. Upload the no-audio or invalid video and process it.
13. Confirm the track/job fails with a clear management-friendly message.
14. Confirm temp video lifecycle matches the documented policy and does not use
    recursive cleanup.

Expected result:

- User-provided video can produce a normal ready audio track.
- Video extraction failures are understandable.
- Original videos are temporary inputs only.
- Existing audio upload behavior is unchanged.

## Manual Local Smoke Flow: Mixed Import Directory

Run after audio import and video extraction are both implemented.

1. Configure a throwaway allowed import root containing:
   - one supported audio file
   - one supported video file with audio
   - one unsupported file
   - one duplicate audio or video candidate if practical
2. Scan the directory from Web.
3. Confirm candidates are classified as `audio`, `video`, and `unsupported`.
4. Select one audio and one video candidate.
5. Confirm import.
6. Run the worker until both created tracks are processed.
7. Confirm the audio candidate becomes a normal ready track.
8. Confirm the video candidate extracts audio and becomes a normal ready track.
9. Confirm unsupported files are not imported.
10. Confirm every source file remains unchanged in the import directory.

Expected result:

- Mixed import is explicit, safe, partial-failure tolerant, and compatible with
  existing track processing.

## Deployment-Aware Checks

Before production acceptance, review Ubuntu deployment behavior:

- `.env.production.example` documents import roots and video size limits without
  real local paths or secrets.
- `docs/DEPLOYMENT.md` explains how the operator creates and mounts import
  directories.
- API and worker containers can both read configured import roots if import is
  enabled.
- API and worker containers can both read/write required media and temporary
  video directories.
- Host directory ownership matches the non-root container user.
- Caddy upload size limits are compatible with configured audio and video size
  limits.
- FFmpeg and ffprobe are available inside the backend image used by API and
  worker.
- Production smoke still includes login, audio upload, worker processing, and
  playback.

Do not require production import roots to be enabled by default. Disabled by
default is acceptable and safer.

## Current Verification Record

Status as of 2026-06-10:

- Planning documents created.
- Implementation has not started.
- No automated V2 import/video checks have been run.
- No manual V2 import/video smoke flow has been run.
- V2 Automatic import tools: not accepted.
- V2 user-provided video-to-audio processing: not accepted.

Append real dated verification results here as implementation tasks complete.

### 2026-06-10 - Task V2.1 Import Directory Configuration And Safety Policy

Implemented:

- Added `IMPORT_ALLOWED_ROOTS` backend configuration, empty by default.
- Added import-root configuration and path-safety service code.
- Added safe configuration response shape that reports disabled imports without
  exposing absolute import paths.
- Added path validation for configured roots and requested relative subpaths,
  including traversal, absolute requested paths, broad roots, repository root,
  home root, `MEDIA_ROOT`, and symlink escape checks where the platform permits
  symlink creation.
- Updated environment templates and operational documentation for Windows
  PowerShell and Ubuntu/container path expectations.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py
.\.venv\Scripts\python.exe -m pytest tests\test_media_storage.py tests\test_uploads_api.py
.\.venv\Scripts\python.exe -m pytest
docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet
```

Results:

- `tests\test_imports_config.py tests\test_imports_path_safety.py`: 10 passed,
  1 skipped. The skipped check was symlink-escape coverage because Windows
  symlink creation was unavailable in this environment.
- `tests\test_media_storage.py tests\test_uploads_api.py`: 11 passed.
- Full backend test suite: 255 passed, 1 skipped.
- Production Compose config validation with `.env.production.example`: passed.

Manual checks:

- No V2 import scan or confirmed import API exists yet, so no API scan/import
  manual smoke was run.
- No Web import UI exists yet, so no browser import smoke was run.
- No Android impact check was run because this task adds no API response used
  by Android and no track response shape changes.

Acceptance status:

- Gate 1 automated import path safety coverage is partially verified locally.
- V2 Automatic import tools are still not accepted because scan, confirmed
  import, Web UI, and manual smoke checks are not implemented yet.
- V2 user-provided video-to-audio processing is still not accepted.

### 2026-06-10 - Task V2.2 Backend Audio Import Scan Preview

Implemented:

- Added authenticated `GET /api/imports/configuration` for safe enabled state
  and configured root labels.
- Added authenticated `POST /api/imports/scan` for read-only audio scan preview
  under one configured root and optional relative subdirectory.
- Reused the existing upload audio extension allowlist: MP3, FLAC, M4A, WAV,
  and OGG.
- Added conservative/configurable scan limits:
  `IMPORT_SCAN_MAX_FILES`, `IMPORT_SCAN_MAX_DEPTH`, and
  `IMPORT_SCAN_MAX_FILE_MB`.
- Scan responses include safe relative paths, basenames, extensions, sizes,
  support status, skipped reasons, and applied limits. They do not expose
  unrestricted absolute paths.
- Scan does not create tracks, processing jobs, hashes, media copies, deletes,
  moves, or source-file modifications.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py tests\test_imports_scan_api.py
.\.venv\Scripts\python.exe -m pytest tests\test_media_storage.py tests\test_uploads_api.py
.\.venv\Scripts\python.exe -m pytest
docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet
```

Results:

- `tests\test_imports_config.py tests\test_imports_path_safety.py
  tests\test_imports_scan_api.py`: 22 passed, 2 skipped. The skipped checks
  were symlink-escape coverage because Windows symlink creation was unavailable
  in this environment.
- `tests\test_media_storage.py tests\test_uploads_api.py`: 11 passed.
- Full backend test suite: 267 passed, 2 skipped.
- Production Compose config validation with `.env.production.example`: passed.

Manual checks:

- No live API manual scan smoke was run in this implementation pass.
- No Web import UI exists yet, so no browser import smoke was run.
- No Android impact check was run because this task adds new import-only API
  responses and does not change Track response shapes used by Android.

Acceptance status:

- Gate 2 automated audio scan preview coverage is partially verified locally.
- V2 Automatic import tools are still not accepted because confirmed import,
  Web UI, worker closure, and manual smoke checks are not implemented yet.
- V2 user-provided video-to-audio processing is still not accepted.

### 2026-06-10 - Task V2.3 Backend Confirmed Audio Import

Implemented:

- Added authenticated `POST /api/imports` confirmed audio import endpoint.
- Request imports only explicitly selected relative paths under one configured
  import root and re-validates every path against the import safety policy.
- First-version import strategy is copy-and-keep-source:
  - source files are never deleted;
  - source files are never moved;
  - selected supported audio files are copied into controlled original media
    storage through the existing `MediaStorage` layout;
  - copied files become normal track originals for the existing worker.
- Each successful file creates a normal `Track` with `processing` status and a
  normal pending processing job.
- Results are per-file and include `imported`, `skipped`, or `failed`.
- Exact original-file duplicate warnings are advisory and do not block import.
- Partial success is allowed; one failed file does not roll back prior
  successful imported files.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py tests\test_imports_scan_api.py tests\test_imports_confirm_api.py
.\.venv\Scripts\python.exe -m pytest tests\test_media_storage.py tests\test_uploads_api.py tests\test_processing_service.py tests\test_worker_jobs.py
.\.venv\Scripts\python.exe -m pytest
docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet
```

Results:

- `tests\test_imports_config.py tests\test_imports_path_safety.py
  tests\test_imports_scan_api.py tests\test_imports_confirm_api.py`: 30
  passed, 2 skipped. The skipped checks were symlink-escape coverage because
  Windows symlink creation was unavailable in this environment.
- `tests\test_media_storage.py tests\test_uploads_api.py
  tests\test_processing_service.py tests\test_worker_jobs.py`: 18 passed.
- Full backend test suite: 275 passed, 2 skipped.
- Production Compose config validation with `.env.production.example`: passed.

Manual checks:

- No live API manual confirmed-import smoke was run in this implementation
  pass.
- No Web import UI exists yet, so no browser import smoke was run.
- No Android impact check was run because this task adds new import-only API
  responses and does not change Track response shapes used by Android.

Acceptance status:

- Gate 3 automated confirmed audio import coverage is partially verified
  locally.
- V2 Automatic import tools are still not accepted because Web UI, worker
  end-to-end manual smoke, and production-aware smoke checks are not complete.
- V2 user-provided video-to-audio processing is still not accepted.

### 2026-06-10 - Task V2.4 Import Status And Import Batch History

Implemented:

- Added durable `ImportBatch` and `ImportItem` backend tables for confirmed
  audio import status history.
- Confirmed import now creates one batch per request and one item per selected
  file, recording only safe fields: current user id, configured root id,
  relative source path, display filename, status, created track id when present,
  UI-safe error message, and timestamps.
- Added `batch_id` to confirmed import responses so Web can refresh the batch
  after import.
- Added authenticated read-only `GET /api/imports/batches/latest` and
  `GET /api/imports/batches/{batch_id}` endpoints.
- Batch history responses are current-user scoped and use the existing safe
  track response for imported items. Track processing status remains the source
  of truth for worker transcoding state.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_batch_history_api.py
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py tests\test_imports_scan_api.py tests\test_imports_confirm_api.py tests\test_imports_batch_history_api.py
```

Results:

- `tests\test_imports_batch_history_api.py`: 4 passed.
- Focused V2 import suite: 34 passed, 2 skipped. The skipped checks were
  symlink-escape coverage because Windows symlink creation was unavailable in
  this environment.

Manual checks:

- No live API manual import batch smoke was run in this implementation pass.
- No Web import UI exists yet, so no browser import status smoke was run.
- No Android impact check was run because this task adds import-only API
  responses and does not change Track response shapes used by Android.

Acceptance status:

- Gate 3.5 automated import batch history coverage is partially verified
  locally.
- V2 Automatic import tools are still not accepted because Web UI, worker
  end-to-end manual smoke, and production-aware smoke checks are not complete.
- V2 user-provided video-to-audio processing is still not accepted.

### 2026-06-10 - Task V2.5 Web Import Scan And Confirmation UI

Implemented:

- Added Web import API wrapper and TypeScript response/request types for:
  configuration, scan preview, confirmed import, latest batch, and specific
  batch status.
- Added `/imports` Web management page and sidebar navigation entry.
- Web shows configured import roots by backend-provided safe labels and allows
  only an optional relative subdirectory input.
- Web scan flow shows supported audio candidates with relative path, basename,
  extension, size, and support status. Unsupported/skipped scan items are shown
  separately with safe reasons.
- Web requires explicit file selection before confirming import. It does not
  auto-import scanned candidates and does not expose delete, move, rename, or
  cleanup actions.
- Web confirmation results show imported, skipped, and failed per-file states,
  duplicate warnings as advisory messages, and links to created Track Detail
  pages.
- Web latest-batch panel refreshes imported item track payloads so existing
  track processing status remains the source of truth for transcoding state.

Automated checks run from `web/`:

```powershell
npm run typecheck
npm run build
```

Results:

- `npm run typecheck`: passed.
- `npm run build`: passed.

Manual checks:

- No browser import smoke against a live backend was run in this implementation
  pass.
- No worker end-to-end import-to-ready smoke was run in this implementation
  pass.
- No Android impact check was run because this task adds Web-only UI and does
  not change backend Track response shapes used by Android.

Acceptance status:

- Gate 4 automated Web compile/build coverage is verified locally.
- V2 Automatic import tools are still not accepted because browser import smoke,
  worker end-to-end manual smoke, and production-aware smoke checks are not
  complete.
- V2 user-provided video-to-audio processing is still not accepted.

### 2026-06-10 - Task V2.6 Video Upload API And Temporary Storage

Implemented:

- Added authenticated `POST /api/tracks/upload-video` backend endpoint.
- Supported first-version video formats are MP4, MKV, MOV, and WEBM.
- Added `MAX_VIDEO_UPLOAD_MB` and `TEMP_VIDEOS_DIR` backend configuration.
- Added `MediaStorage.temporary_video_path()` so temporary videos are stored
  under controlled `MEDIA_ROOT/TEMP_VIDEOS_DIR` using the existing path-safety
  helpers.
- Added `job_type` and `source_path` to processing jobs. Normal audio uploads
  keep `job_type="audio_processing"` with no source path. Video uploads create
  pending `job_type="video_extraction"` jobs with a safe relative temp-video
  source path.
- The existing audio worker now claims only `audio_processing` jobs so
  `video_extraction` jobs stay pending until V2.7 worker support is
  implemented.
- Video upload validates extension, content type, configured size limit, and a
  basic container signature before committing the track/job.
- API response reuses the existing safe track response and does not expose the
  temporary video path. Uploaded videos are not stored as track originals,
  playback media, or cover media.
- Updated production compose, Caddy video upload body limit, host directory
  setup, env examples, and operational docs for temporary video storage.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py tests\test_media_storage.py tests\test_uploads_api.py
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py tests\test_media_storage.py tests\test_uploads_api.py tests\test_worker_jobs.py tests\test_processing_service.py
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m pytest
docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet
```

Results:

- `tests\test_video_uploads_api.py tests\test_media_storage.py
  tests\test_uploads_api.py`: 20 passed.
- `tests\test_video_uploads_api.py tests\test_media_storage.py
  tests\test_uploads_api.py tests\test_worker_jobs.py
  tests\test_processing_service.py`: 28 passed.
- Alembic heads: `20260610_0008 (head)`.
- Full backend test suite: 289 passed, 2 skipped. The skipped checks were
  symlink-escape coverage because Windows symlink creation was unavailable in
  this environment.
- Production Compose config validation with `.env.production.example`: passed.

Manual checks:

- No live API video upload smoke was run in this implementation pass.
- No worker video extraction smoke was run because V2.7 is not implemented yet.
- No Web video upload smoke was run because V2.8 is not implemented yet.
- No Android impact check was run because this task adds an upload-only API and
  does not change existing Track response fields used by Android.

Acceptance status:

- Gate 5 automated backend coverage is partially verified locally.
- V2 user-provided video-to-audio processing is still not accepted because
  worker extraction, Web video upload UI, and manual smoke checks are not
  complete.
- V2 Automatic import tools are unchanged by this task and still await manual
  import smoke before acceptance.

### 2026-06-10 - Task V2.7 Worker Video-To-Audio Extraction

Implemented:

- Modified `claim_next_pending_job` to accept an optional `allowed_types`
  parameter, defaulting to both `audio_processing` and `video_extraction` job
  types. FIFO ordering by `created_at` then `id` is preserved.
- Added `extract_audio_from_video` helper in `backend/app/media/ffmpeg.py`.
  Uses `-vn` argument array (never shell string) to drop video streams and
  extract audio via `libmp3lame` at a configurable bitrate defaulting to 192k.
- Added `_process_video_extraction_job` in `backend/app/worker/jobs.py`:
  - Resolves `job.source_path` through `MediaStorage.stored_media_path` with
    path-safety enforcement.
  - Rejects missing `source_path`, missing temp file, and missing track with
    UI-safe error messages.
  - Extracts audio from the temporary video into a controlled original path
    via `storage.original_upload_path`.
  - Sets `track.original_file_path` to the extracted audio.
  - Deletes the exact temp video file on success; keeps it on failure for
    retry/debug.
  - Calls `process_track()` for metadata extraction, playback MP3 generation,
    duplicate signals, and ready/failed state.
  - Handles reruns safely: if the track already has a usable extracted
    original, extraction is skipped.
- Added `VideoExtractionError` with UI-safe messages: "Video audio extraction
  failed.", "Temporary video file is missing.", etc.
- No absolute paths, temp paths, or stack traces are exposed in job error
  messages.
- No recursive directory deletion. Temp video lifecycle operates only on the
  exact resolved file.

Automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_processing.py tests\test_worker_jobs.py
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py tests\test_uploads_api.py tests\test_processing_service.py
.\.venv\Scripts\python.exe -m pytest
```

Results:

- `tests\test_video_processing.py tests\test_worker_jobs.py`: 17 passed.
  Covers successful extraction, audio processing regression, FFmpeg failure,
  missing source/temp/track, temp lifecycle (delete on success, keep on
  failure, no recursive deletion), rerun/idempotency (skip when original
  exists, re-extract when missing), and UI-safe error messages.
- `tests\test_video_uploads_api.py tests\test_uploads_api.py
  tests\test_processing_service.py`: 17 passed. All existing upload and
  processing regression tests pass unchanged.
- Full backend test suite: 302 passed, 2 skipped. The skipped checks were
  symlink-escape coverage because Windows symlink creation was unavailable
  in this environment.

Manual checks:

- FFmpeg/ffprobe were not available in the current shell environment; tests
  use monkeypatched FFmpeg helpers.
- No live API worker video extraction smoke was run in this implementation
  pass.
- No Web video upload smoke was run because V2.8 is not implemented yet.
- No Android impact check was run because this task adds worker-only
  functionality and does not change existing Track response fields used by
  Android.

Acceptance status:

- Gate 6 automated worker video extraction coverage is verified locally.
- V2 user-provided video-to-audio processing is still not accepted because
  Web video upload UI (V2.8), mixed import support (V2.9), and manual smoke
  checks are not complete.
- V2 Automatic import tools are unchanged by this task.

## Android Impact

No Android UI is required for the first version of these V2 features. Android
should continue to consume normal ready tracks through existing library,
detail, stream, cache, recommendation, and AI flows. If backend track response
fields change, Android model compatibility must be checked with the relevant
JVM tests or build before acceptance.

## Acceptance Checklist

- Import path safety tests pass.
- Audio scan API tests pass.
- Confirmed audio import tests pass.
- Worker regression tests pass.
- Web import UI typecheck/build pass.
- Manual audio import smoke passes.
- Video upload API tests pass.
- Video processing worker tests pass.
- Web video upload typecheck/build pass.
- Manual video upload smoke passes.
- Mixed audio/video import tests pass.
- Manual mixed import smoke passes.
- Documentation updates are complete.
- Ubuntu deployment notes are reviewed.
- Source files are never deleted, moved, renamed, or modified.
- Original videos are not retained as library media files.
- Duplicate handling remains advisory.
