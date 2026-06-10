# V2 Import And Video Processing Tasks

This document plans two V2 priority features for Easy Music:

1. Automatic import tools.
2. Optional user-provided video-to-audio processing.

These features must extend the accepted upload, media storage, processing job,
worker, duplicate signal, and Web management patterns. They are not a new media
management system.

## Current System To Reuse

- `POST /api/tracks/upload` validates supported audio uploads, saves originals
  under controlled media storage, creates a `Track`, and creates a processing
  job.
- The worker processes pending jobs with ffprobe and FFmpeg, writes normalized
  MP3 playback files, updates track metadata, stores duplicate signals, and
  marks tracks `ready` or `failed`.
- Media paths are generated through backend media storage helpers and must not
  escape `MEDIA_ROOT`.
- Duplicate detection is advisory. It can warn about exact or likely duplicate
  tracks, but it must not delete, merge, overwrite, hide, or block tracks.
- Web upload and library pages already show upload progress, processing state,
  failed state, duplicate warnings, and links to Track Detail.
- Windows / PowerShell is the primary local development environment. Production
  deployment targets Ubuntu with Docker Compose, Caddy, and host bind-mounted
  media directories.

## Global V2 Boundaries

- Do not implement automatic internet downloading.
- Do not implement automatic Bilibili downloading.
- Do not implement a full-library media manager.
- Do not add a large ML or recommendation system.
- Do not add batch delete or dangerous cleanup actions.
- Do not scan arbitrary system directories.
- Do not trust client-provided paths.
- Do not expose internal absolute media paths in API responses.
- Do not introduce Redis, Celery, or a new queue unless a later task explicitly
  approves it.
- Do not rewrite the existing upload, worker, track, or media storage
  architecture.

## Recommended Implementation Order

1. Add import directory configuration and path safety checks.
2. Add read-only audio scanning and preview.
3. Add confirmed audio import by copying into controlled media storage.
4. Add Web import review and import status UI.
5. Add video upload and temporary video storage.
6. Add worker video extraction, then reuse the existing audio processing flow.
7. Extend import scanning to optionally include supported video files.
8. Add final smoke docs and acceptance records.

## Task V2.1: Import Directory Configuration And Safety Policy

### Goal

Allow the administrator to configure a small allowlist of local import roots
that the backend may scan, without allowing arbitrary filesystem access.

### Directories

- `backend/app/core/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/core/config.py`
- New import service module, such as `backend/app/services/imports.py`
- New import schemas, such as `backend/app/schemas/imports.py`
- New or updated backend tests under `backend/tests/`
- `.env.example`
- `.env.production.example`
- `docs/ENVIRONMENT.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`

### Acceptance Criteria

- Configuration defines one or more import roots, such as
  `IMPORT_ALLOWED_ROOTS`.
- Empty import roots mean import tools are disabled and return a clear
  configured-off response.
- All requested scan paths are resolved and verified to be inside one configured
  root.
- Path checks reject `..`, symlink escapes, drive-root scans, home-directory
  broad scans, repository-root scans, and OS root scans.
- Windows paths and Ubuntu paths are both documented.
- Backend tests cover allowed roots, nested allowed directories, path traversal,
  symlink escape where practical, disabled configuration, and platform path
  normalization.
- No source file is deleted, moved, renamed, or modified.

### Do Not

- Do not let the browser choose an arbitrary server filesystem path.
- Do not scan `C:\`, `/`, user home directories, the repository root, or
  production media storage by default.
- Do not store production machine-local paths in committed files.
- Do not add Web UI in this task.

## Task V2.2: Backend Audio Import Scan Preview

### Goal

Scan an allowed local directory for supported audio files and return a safe
preview list before importing anything.

### Directories

- `backend/app/api/routes/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/media/`
- `backend/tests/`
- `docs/`

### Main Files

- New route module, such as `backend/app/api/routes/imports.py`
- `backend/app/api/router.py`
- `backend/app/services/imports.py`
- `backend/app/schemas/imports.py`
- Existing media validation helpers if available
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`

### Dependencies

- Task V2.1.

### Acceptance Criteria

- Backend exposes an authenticated import scan endpoint, for example
  `POST /api/imports/scan`.
- The request identifies one configured import root and an optional relative
  subdirectory.
- Scan is read-only and returns candidate files only.
- Supported audio formats match the existing audio upload support:
  - MP3
  - FLAC
  - M4A
  - WAV
  - OGG
- Unsupported files are ignored or returned in a separate skipped list with a
  safe reason.
- Response includes safe display fields only, such as relative path, basename,
  extension, size, and detected support status.
- Response does not include unrestricted absolute paths.
- Scan limits are configurable or conservative, including maximum file count,
  maximum recursion depth, and maximum per-file size.
- Scan handles permission errors, missing directories, and empty directories
  without crashing.
- Backend tests cover auth, disabled imports, allowed path scan, traversal
  rejection, supported formats, unsupported formats, scan limits, permission or
  missing path errors, and no mutation.

### Do Not

- Do not create tracks during scanning.
- Do not run FFmpeg or ffprobe for every scanned file in the first version
  unless needed for safe validation.
- Do not compute full hashes for every scanned file in the first version unless
  a later task scopes the performance cost.
- Do not delete or move source files.

## Task V2.3: Backend Confirmed Audio Import

### Goal

Import explicitly selected scanned audio files by copying them into controlled
media storage and then reusing the existing Track and processing job flow.

### Directories

- `backend/app/api/routes/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/app/media/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/imports.py`
- `backend/app/services/imports.py`
- `backend/app/services/uploads.py` or a small shared helper if needed
- `backend/app/services/jobs.py`
- `backend/app/media/storage.py`
- `backend/app/models/track.py`
- New optional model for import batches/items only if needed
- New Alembic migration only if durable import batch/item state is added
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`

### Dependencies

- Task V2.2.

### Acceptance Criteria

- Backend exposes an authenticated confirm endpoint, for example
  `POST /api/imports`.
- The request imports only explicit file selections returned by a prior scan or
  re-validates the same relative paths against configured roots.
- First version strategy is **copy and keep source**:
  - Source files are never deleted.
  - Source files are never moved.
  - Source files are copied into Easy Music controlled original media storage.
  - The copied file becomes the track original used by the existing worker.
- Each imported audio file creates a normal `Track` with `processing` status
  and a normal pending processing job.
- Track ownership uses the authenticated user.
- Import results are per-file and include `imported`, `skipped`, or `failed`.
- Duplicate handling is advisory:
  - Existing duplicate signals may be queried before or after import.
  - Exact duplicate candidates can be returned as warnings.
  - Duplicates do not block import unless the user explicitly deselects them in
    Web.
  - No duplicate is deleted, merged, overwritten, or hidden.
- Partial success is allowed: one failed file does not roll back successful
  imports unless the implementation explicitly documents a small transaction
  boundary.
- Backend tests cover auth, import disabled, path safety, valid copy import,
  source retained, processing job creation, per-file partial failure, duplicate
  warning behavior, unsupported file rejection, oversized file rejection, and
  no deletion.

### Do Not

- Do not import every scanned file automatically.
- Do not change existing upload endpoint behavior.
- Do not move files out of the import directory.
- Do not delete files after success or failure.
- Do not add Android UI.

## Task V2.4: Import Status And Import Batch History

### Goal

Give the Web UI enough status information to explain import success, failure,
and later worker processing state without creating a complex job dashboard.

### Directories

- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/app/api/routes/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- Optional import batch/item models, such as `ImportBatch` and `ImportItem`
- `backend/app/schemas/imports.py`
- `backend/app/services/imports.py`
- `backend/app/api/routes/imports.py`
- New Alembic migration if durable state is added
- New backend tests under `backend/tests/`

### Dependencies

- Task V2.3.

### Acceptance Criteria

- If durable import state is added, it records only safe data:
  - user id
  - configured root identifier
  - relative source path or safe display name
  - status
  - resulting track id when created
  - error message suitable for UI
  - timestamps
- Status values are explicit, such as `scanned`, `importing`, `imported`,
  `skipped`, and `failed`.
- API can return the latest import batch or a specific batch for the current
  user.
- Track processing status remains the source of truth for transcoding results.
- Backend tests cover ownership isolation, safe response fields, partial
  failure state, and link from imported item to created track.

### Do Not

- Do not create a general-purpose workflow engine.
- Do not expose absolute source paths.
- Do not add retry scheduling beyond explicit user re-import.
- Do not duplicate processing job state if existing track/job state is enough.

## Task V2.5: Web Import Scan And Confirmation UI

### Goal

Add a Web management surface where the owner selects an allowed import root,
reviews scanned audio candidates, sees duplicate warnings, and confirms import.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/layout/`
- `docs/`

### Main Files

- New import API wrapper, such as `web/src/api/imports.ts`
- New import types, such as `web/src/types/imports.ts`
- New page, such as `web/src/pages/ImportPage.tsx`
- New components for scan form, candidate table, and result list
- Existing route/sidebar layout files
- `docs/DEVELOPMENT.md`

### Dependencies

- Task V2.2.
- Task V2.3.
- Task V2.4 if durable batch status is implemented first.

### Acceptance Criteria

- Web displays configured import roots by safe label, not arbitrary absolute
  path entry unless the backend explicitly supports a relative subdirectory.
- User can start a scan for one allowed root/subdirectory.
- Candidate list shows supported audio files with relative path, filename,
  extension, size, and support status.
- User explicitly selects files before confirming import.
- Web shows duplicate warnings as advisory information.
- Web shows per-file import result and links created tracks to Track Detail.
- Web can refresh processing state for imported tracks using existing track
  status behavior.
- Loading, empty, disabled configuration, unauthorized, backend error,
  unsupported file, duplicate warning, partial success, and failed import states
  are handled.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not add a file manager UI with arbitrary browsing.
- Do not add delete, move, rename, or cleanup buttons.
- Do not auto-select every file if duplicate warnings or unsupported entries
  exist.
- Do not add Android changes.

## Task V2.6: Video Upload API And Temporary Storage

### Goal

Allow the Web user to upload a user-provided video file as an explicit
audio-extraction request while keeping the original video out of the music
library.

### Directories

- `backend/app/api/routes/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/app/media/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- New route module or upload extension, such as
  `backend/app/api/routes/video_imports.py`
- New service, such as `backend/app/services/video_imports.py`
- `backend/app/services/jobs.py`
- `backend/app/media/storage.py`
- `backend/app/media/paths.py`
- New optional processing job kind/source fields if needed
- New Alembic migration if model fields are added
- New backend tests under `backend/tests/`
- `.env.example`
- `.env.production.example`
- `docs/API_MANUAL_TESTING.md`
- `docs/ENVIRONMENT.md`

### Acceptance Criteria

- Backend exposes an authenticated video upload endpoint, for example
  `POST /api/tracks/upload-video`.
- Supported first-version video formats are explicit and conservative, such as
  MP4, MKV, MOV, and WEBM.
- Video upload size limit is separately configurable from audio upload size or
  clearly documented if it reuses the same limit.
- File extension, content type, and basic signature checks are validated where
  practical.
- Uploaded video is stored in a controlled temporary location under
  `MEDIA_ROOT`, not in originals/playback/covers.
- A normal `Track` is created with `processing` status only after the temporary
  video is accepted.
- A processing job is created with enough metadata for the worker to know this
  is a video extraction job.
- API response uses the existing safe track response shape plus optional
  processing status fields.
- Backend tests cover auth, valid upload, unsupported type, oversized file,
  temporary path safety, job creation, and no exposure of raw temp paths.

### Do Not

- Do not store the original video as the track original media.
- Do not expose the temporary video through stream or download endpoints.
- Do not run FFmpeg extraction inside the request.
- Do not accept URLs.
- Do not download from Bilibili or any external site.

## Task V2.7: Worker Video-To-Audio Extraction

### Goal

Teach the worker to extract audio from a temporary user-provided video file,
then pass the extracted audio into the existing audio processing pipeline.

### Directories

- `backend/app/worker/`
- `backend/app/services/`
- `backend/app/media/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/worker/main.py`
- `backend/app/worker/jobs.py`
- `backend/app/services/processing.py`
- `backend/app/services/video_imports.py`
- `backend/app/media/ffmpeg.py`
- `backend/app/media/storage.py`
- New backend tests under `backend/tests/`

### Dependencies

- Task V2.6.

### Acceptance Criteria

- Worker recognizes video extraction jobs without changing normal audio upload
  processing.
- FFmpeg extracts the best available audio stream from the temporary video into
  a controlled audio original path.
- Extracted audio becomes the track original file for existing metadata,
  playback MP3 generation, cover extraction if already supported, duplicate
  signal storage, and `ready`/`failed` status updates.
- If no audio stream exists, the track and job are marked failed with a clear
  user-facing error.
- FFmpeg subprocess calls use argument arrays, not shell string concatenation.
- Re-running a failed or interrupted video job does not corrupt existing track
  or media state.
- Temporary video cleanup is explicit and safe:
  - On success, delete only the one validated temporary video file if cleanup is
    implemented in this task.
  - On failure, either retain the temp file for a short documented retry window
    or delete only the one validated temp file after recording a useful error.
  - Never recursively delete temp directories.
- Backend tests cover successful extraction, no-audio failure, FFmpeg failure,
  temp file lifecycle, rerun behavior, and existing audio upload regression.

### Do Not

- Do not keep video files as library media.
- Do not generate video previews or thumbnails in the first version.
- Do not add automatic retry loops beyond existing worker/job behavior.
- Do not modify Android playback.

## Task V2.8: Web Video Upload Flow

### Goal

Add an optional Web upload path for user-provided video files that shows
extraction and processing status through the existing status patterns.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`
- `docs/`

### Main Files

- `web/src/api/tracks.ts` or new `web/src/api/videoUploads.ts`
- `web/src/types/track.ts` or new video upload types
- `web/src/pages/UploadPage.tsx` or a small dedicated Video Upload section
- Existing upload result/status components where practical
- `docs/DEVELOPMENT.md`

### Dependencies

- Task V2.6.
- Task V2.7.

### Acceptance Criteria

- Web has a clearly optional video upload section distinct from audio upload.
- Accepted video extensions and size limits are visible before upload.
- Browser upload progress is shown where available.
- Successful video upload shows a created processing track.
- Web status text explains extraction, processing, ready, and failed states
  without exposing stack traces or temp paths.
- Failed video extraction shows a useful message, such as unsupported format,
  no audio stream, oversized file, or FFmpeg failure.
- Ready extracted tracks behave like normal ready audio tracks in Library,
  Track Detail, duplicate review, recommendations, AI tag suggestions, and Web
  playback.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not run FFmpeg in the browser.
- Do not accept URLs.
- Do not embed a downloader.
- Do not show temporary video storage paths.

## Task V2.9: Import Scan Support For User-Provided Video Files

### Goal

Extend automatic import tools so an allowed import directory can include
supported user-provided video files for batch audio extraction.

### Directories

- `backend/app/api/routes/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/media/`
- `backend/tests/`
- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`
- `docs/`

### Main Files

- `backend/app/services/imports.py`
- `backend/app/services/video_imports.py`
- `backend/app/schemas/imports.py`
- `backend/app/api/routes/imports.py`
- Existing Web import page and components
- New backend and Web tests as available

### Dependencies

- Task V2.5.
- Task V2.6.
- Task V2.7.
- Task V2.8.

### Acceptance Criteria

- Import scan can classify candidates as `audio`, `video`, or `unsupported`.
- User can filter or select audio and video candidates before confirming
  import.
- Audio candidates follow the Task V2.3 copy-and-process behavior.
- Video candidates follow the Task V2.6/V2.7 temporary-video extraction
  behavior.
- Per-file results distinguish imported audio tracks from accepted video
  extraction jobs.
- Duplicate warnings remain advisory.
- Source files in the import directory are never deleted, moved, renamed, or
  modified.
- Backend tests cover mixed audio/video scans, mixed confirm imports, video
  path safety, unsupported video handling, partial failure, and source
  retention.
- Web `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not automatically import every video in a directory.
- Do not keep source videos as library originals.
- Do not add external download support.
- Do not add destructive cleanup actions.

## Task V2.10: Documentation And Smoke-Test Updates

### Goal

Document repeatable local and production-aware checks for the V2 import and
video features.

### Directories

- `docs/`
- Repository root env examples

### Main Files

- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `.env.example`
- `.env.production.example`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`

### Dependencies

- Relevant implementation tasks.

### Acceptance Criteria

- API manual tests cover:
  - configured import roots
  - scan preview
  - confirmed audio import
  - duplicate warning behavior
  - video upload
  - video extraction
  - mixed import directory with audio and video
- Development docs use PowerShell-first local commands.
- Deployment docs explain Ubuntu host paths, bind mounts, permissions, and
  FFmpeg availability without committing machine-local paths.
- Architecture docs mention import roots, temporary video storage, and the
  reuse of existing Track, processing job, worker, and media storage flows.
- Acceptance document records automated and manual checks before features are
  marked accepted.

### Do Not

- Do not mark acceptance complete until backend, Web, worker, and manual smoke
  checks have actually passed.
- Do not document automatic internet download behavior.
- Do not suggest deleting source files as part of normal verification.

## Risk Register

- Server-side path selection can become dangerous if allowlist checks are weak.
  Keep configured roots explicit and reject broad directories.
- Directory scans can be expensive. Keep file count, recursion depth, and size
  limits conservative.
- Copying large files can fill disks. Surface partial failures and document
  storage expectations.
- FFmpeg video extraction can fail for files with no audio stream, unusual
  codecs, or corrupt containers. Keep errors clear and testable.
- Temporary video lifecycle must be explicit. Delete only validated individual
  temp files or retain them under a documented retry policy.
- Import and video features can create many processing jobs. Reuse existing
  worker behavior first; do not add distributed queue complexity prematurely.
- Duplicate warnings remain advisory. Users may still import duplicates by
  choice.

## V2 Completion Checklist

- Import roots are configured safely and documented.
- Audio scan preview is read-only and path-safe.
- Confirmed audio import copies files into controlled media storage and creates
  normal processing jobs.
- Web import review supports scan, select, confirm, result, duplicate warning,
  and processing refresh states.
- Video upload creates extraction jobs and stores videos only temporarily.
- Worker extracts audio and then reuses existing audio processing behavior.
- Import directory flow can optionally include supported video files.
- Automated backend and Web checks pass.
- Manual Web smoke passes on Windows local development.
- Production docs cover Ubuntu host directory and permission requirements.
- Acceptance document is updated with real results.
