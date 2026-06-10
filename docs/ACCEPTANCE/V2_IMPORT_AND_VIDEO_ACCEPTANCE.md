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
