# V2 Remaining Import And Video Construction Orders

This document converts the remaining V2 import and video tasks into executable
work orders for coding agents. Tasks V2.1 through V2.6 are already implemented
locally as of 2026-06-10 and must not be reimplemented here.

Status update, 2026-06-11: V2.7 through V2.10 are now recorded as implemented
and locally accepted in `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`.
This file is retained as a historical construction order and agent handoff
record. Use the acceptance document, `docs/ROADMAP.md`, and current code as the
source of truth for present project status.

Use this document together with:

- `AGENTS.md`
- `docs/TASKS/V2_IMPORT_AND_VIDEO_TASKS.md`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`

Global boundaries for all tasks below:

- Do not implement internet downloading, URL import, or Bilibili downloading.
- Do not delete, move, rename, or modify source files in import directories.
- Do not expose unrestricted absolute server paths in API responses.
- Do not add Android UI for these V2 tasks.
- Do not introduce Redis, Celery, a new queue, or a new media architecture.
- Do not mark V2 acceptance complete until the relevant automated and manual
  smoke checks have actually passed.

# TASK-V2.7: Worker Video-To-Audio Extraction

## Goal

Teach the backend worker to process `video_extraction` jobs created by
`POST /api/tracks/upload-video`: extract an audio original from the temporary
video, then run the existing audio metadata, duplicate-signal, playback MP3, and
track status pipeline.

## Background

Task V2.6 already added:

- `POST /api/tracks/upload-video`
- `MAX_VIDEO_UPLOAD_MB`
- `TEMP_VIDEOS_DIR`
- `MediaStorage.temporary_video_path()`
- `ProcessingJob.job_type`
- `ProcessingJob.source_path`
- `VIDEO_EXTRACTION_JOB_TYPE = "video_extraction"`

Current worker behavior intentionally claims only `audio_processing` jobs, so
video extraction jobs remain pending. This task starts from that exact state.

## Scope

- Add worker support for `video_extraction` jobs.
- Add a safe FFmpeg helper that extracts the best available audio stream from a
  temporary video into a controlled audio original path.
- Update the track so the extracted audio becomes `tracks.original_file_path`.
- Reuse `process_track()` for metadata extraction, playback MP3 generation,
  duplicate signal storage, and `ready` / `failed` state.
- Record clear user-facing failure messages on the job and track.
- Implement explicit temp video lifecycle policy.
- Add focused backend tests.

## Out of Scope

- No Web UI changes.
- No import-directory video support yet.
- No video thumbnails, previews, stream endpoints, or download endpoints.
- No automatic retry scheduler beyond the existing worker/job behavior.
- No deletion of temp directories or recursive cleanup.
- No changes to Android.

## Files To Inspect

- `backend/app/services/jobs.py`
- `backend/app/worker/jobs.py`
- `backend/app/worker/main.py`
- `backend/app/services/processing.py`
- `backend/app/services/video_uploads.py`
- `backend/app/media/ffmpeg.py`
- `backend/app/media/storage.py`
- `backend/app/media/paths.py`
- `backend/app/models/processing_job.py`
- `backend/app/models/track.py`
- `backend/tests/test_worker_jobs.py`
- `backend/tests/test_processing_service.py`
- `backend/tests/test_video_uploads_api.py`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`

## Files Allowed To Modify

- `backend/app/services/jobs.py`
- `backend/app/worker/jobs.py`
- `backend/app/worker/main.py` only if dispatch behavior requires it
- `backend/app/services/processing.py` only to add a narrow reusable helper if
  needed
- `backend/app/services/video_uploads.py` only for shared video extraction
  helpers or constants
- `backend/app/media/ffmpeg.py`
- `backend/app/media/storage.py`
- Backend tests:
  - `backend/tests/test_worker_jobs.py`
  - new `backend/tests/test_video_processing.py`
  - existing regression tests only when behavior legitimately changes
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md` only to append real
  verification results after tests run

## Implementation Steps

1. Audit current job dispatch.
   - Confirm `claim_next_pending_job()` filters to `audio_processing`.
   - Decide the smallest compatible change: either let it claim both job types
     and dispatch in `worker/jobs.py`, or add a new `claim_next_pending_job`
     parameter for allowed job types.
   - Preserve FIFO ordering by `created_at` then `id`.

2. Add an FFmpeg extraction helper in `backend/app/media/ffmpeg.py`.
   - Use an argument array, never shell string concatenation.
   - Input: temp video path and destination audio path.
   - Output: an audio file format already supported by the existing audio
     pipeline. Prefer an `.mp3` or `.m4a` original stored under originals.
   - Use `-vn` so no video stream is carried forward.
   - Let FFmpeg failure raise `FFmpegError` with safe diagnostic context.

3. Add controlled destination path support.
   - Prefer reusing `MediaStorage.original_upload_path(user_id, track_id,
     filename)` for the extracted original.
   - The generated filename should be deterministic enough for tests but still
     safe, for example based on the track title or temp-video stem with an audio
     extension.
   - Never write the extracted audio under `temp-videos`, `playback`, or
     `covers`.

4. Implement video job processing.
   - Resolve `ProcessingJob.source_path` through `MediaStorage.stored_media_path`.
   - Reject missing `source_path`, missing temp file, or a resolved path outside
     `MEDIA_ROOT`.
   - Fetch the target `Track`; fail cleanly if missing.
   - Set `track.status = "processing"` while running.
   - Extract audio into the controlled original path.
   - Set `track.original_file_path` to the extracted audio relative media path.
   - Clear any stale playback path or duplicate signal fields only if rerun
     semantics require it; do not disturb unrelated track metadata.
   - Call the existing `process_track()` so normal audio processing remains the
     source of truth.

5. Handle no-audio and corrupt-video cases.
   - FFmpeg failures should leave the track `failed`.
   - Job `error_message` should be management-friendly, such as
     `Video audio extraction failed.` or `No usable audio stream was found.`
   - Do not expose temp paths, command lines with absolute paths, or raw stack
     traces in API-visible messages.

6. Define temp video lifecycle.
   - Choose one policy and document it in code comments and acceptance notes:
     either delete the one validated temp video file after successful extraction,
     or retain it for a documented retry/debug window.
   - If deletion is implemented, delete only the exact resolved temp file for
     the current job.
   - Do not recursively delete directories.
   - On failure, either keep the exact temp file for retry/debug or delete only
     that exact file after the error is stored.

7. Make reruns safe.
   - If a rerun finds an existing extracted original path, do not corrupt it.
   - If extraction creates a replacement file, write to a fresh controlled path.
   - If processing fails after extraction, leave a consistent track/job state:
     track failed, job failed, no half-written playback path.

8. Update tests.
   - Replace the existing test expectation that video jobs are ignored.
   - Add successful video extraction test using monkeypatched FFmpeg helpers or
     a fake subprocess runner.
   - Add no-audio / FFmpeg failure test.
   - Add missing temp source test.
   - Add temp lifecycle test for the chosen policy.
   - Add rerun/idempotency test.
   - Keep existing audio upload and audio worker tests passing.

## Acceptance Criteria

- Worker claims and processes `video_extraction` jobs.
- Successful extraction produces a normal ready audio track after `process_track`.
- The extracted audio is stored under controlled originals media storage.
- `tracks.original_file_path` points to extracted audio, not the temp video.
- Temp video paths are not exposed through track responses.
- Existing `audio_processing` jobs still work.
- Failure cases mark both track and job failed with useful UI-safe messages.
- FFmpeg subprocess calls use argument arrays.
- Temp cleanup never recursively deletes directories.

## Tests To Run

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_processing.py tests\test_worker_jobs.py
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py tests\test_uploads_api.py tests\test_processing_service.py
.\.venv\Scripts\python.exe -m pytest
```

If tests use real FFmpeg, also run:

```powershell
ffmpeg -version
ffprobe -version
```

## Manual Verification

1. Start the backend and database locally.
2. Upload a small MP4/WebM with an audio stream through
   `POST /api/tracks/upload-video` or an API client.
3. Confirm a track is created with `processing` status and a pending
   `video_extraction` job.
4. Run the worker:

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m app.worker
   ```

5. Confirm the job becomes `succeeded`.
6. Confirm the track becomes `ready`, has an audio original path, has playback
   MP3, and streams through the existing track stream endpoint.
7. Upload a video with no audio stream and run the worker.
8. Confirm the track and job fail with a clear message and no temp path leak.

## Risks

- A broad job-claim change could accidentally break audio processing order.
- FFmpeg extraction can produce formats that the existing metadata/playback
  pipeline cannot handle if the destination format is chosen poorly.
- Temp cleanup can become dangerous if implemented as directory deletion.
- Reruns can create orphaned extracted originals if failure handling is loose.

## Stop Conditions

- Stop if `ProcessingJob.job_type` or `source_path` migration is missing in the
  local database state.
- Stop if resolving `job.source_path` cannot be proven to stay inside
  `MEDIA_ROOT`.
- Stop if the chosen FFmpeg command requires shell execution.
- Stop if video extraction requires changing existing audio upload API behavior.

## Notes For Coding Agent

- Keep dispatch small and explicit: job type decides the processing branch.
- Use existing `MediaStorage` and `resolve_media_path` helpers; do not manually
  join untrusted paths.
- Keep error messages short and UI-safe.
- Do not update the V2 acceptance status to accepted after automated tests only;
  manual Web smoke still belongs to later tasks.

# TASK-V2.8: Web Video Upload Flow

## Goal

Add an optional Web upload path for user-provided video files that calls
`POST /api/tracks/upload-video`, shows browser upload progress, then displays
the same created-track processing lifecycle used by normal audio uploads.

## Background

The backend video upload API exists from V2.6 and worker extraction is supplied
by V2.7. The current Web upload page has an audio upload flow using
`uploadTrack()`, `UploadForm`, and `UploadResultList`. This task extends Web
management only; it must not change backend behavior unless a tiny API wrapper
typing gap is found.

## Scope

- Add a video upload API wrapper.
- Add Web TypeScript types only if existing `Track` is insufficient.
- Add a distinct optional video upload section to `UploadPage`.
- Show supported video formats: MP4, MKV, MOV, WEBM.
- Show configured or documented video size limit text without hard-coding
  production machine values.
- Reuse existing result, duplicate warning, and processing polling patterns
  where practical.
- Handle extraction failure messages without exposing stack traces or temp
  paths.

## Out of Scope

- No FFmpeg in browser.
- No URL input.
- No downloader.
- No backend worker changes.
- No import-directory video support.
- No Android changes.
- No redesign of the full upload page.

## Files To Inspect

- `web/src/pages/UploadPage.tsx`
- `web/src/components/UploadForm.tsx`
- `web/src/components/UploadResultList.tsx`
- `web/src/api/tracks.ts`
- `web/src/types/track.ts`
- `web/src/config/env.ts`
- `web/src/i18n/zh.ts`
- `web/src/routes/router.ts`
- `web/src/layout/AppLayout.tsx`
- `backend/app/api/routes/tracks.py`
- `backend/app/services/video_uploads.py`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`

## Files Allowed To Modify

- `web/src/api/tracks.ts` or new `web/src/api/videoUploads.ts`
- `web/src/pages/UploadPage.tsx`
- `web/src/components/UploadForm.tsx` only if generalized without breaking
  audio upload
- `web/src/components/UploadResultList.tsx` only if result text needs video
  context
- New small component such as `web/src/components/VideoUploadForm.tsx`
- `web/src/types/track.ts` only if response typing needs extension
- `web/src/config/env.ts` only if an existing env pattern supports public
  upload-limit display
- `docs/DEVELOPMENT.md` only for Web local verification notes if needed
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md` only to append real
  verification results after tests/manual smoke

## Implementation Steps

1. Add the Web API wrapper.
   - Implement `uploadVideoTrack(accessToken, file, onProgress?)`.
   - Mirror the existing `uploadTrack()` XMLHttpRequest progress behavior.
   - POST to `/api/tracks/upload-video`.
   - Use the same `ApiClientError` handling pattern as audio upload.

2. Add video file validation in Web.
   - Accept `.mp4`, `.mkv`, `.mov`, and `.webm`.
   - Include common MIME types:
     `video/mp4`, `video/x-matroska`, `video/matroska`, `video/quicktime`,
     and `video/webm`.
   - Treat extension support as the primary browser-side hint because browser
     MIME reporting can vary.
   - Keep backend as the source of truth for real validation.

3. Add a distinct video upload section.
   - Put it on `UploadPage` as a separate panel or small section below/near the
     existing audio upload.
   - Clearly label it as optional video-to-audio extraction.
   - Keep the audio upload flow intact.
   - Do not add URL fields or downloader language.

4. Reuse status polling.
   - After successful video upload, poll `getTrack()` just like audio upload.
   - Show `processing` as extraction/processing in progress.
   - Show `ready` as normal playable track.
   - Show `failed` with `track.processing_error_message` when available.
   - Do not expose temp video paths.

5. Reuse or extend result rendering.
   - If `UploadResultList` is reused, add an optional context field such as
     `kind: "audio" | "video"` only if needed for better labels.
   - Keep duplicate warnings advisory. Video-derived tracks can be checked after
     processing like normal tracks.
   - Ensure long filenames, progress text, and errors fit existing responsive
     layout.

6. Add local docs only if workflow changes.
   - `docs/DEVELOPMENT.md` may mention the Web video upload smoke flow and
     required backend worker command.
   - Do not mark acceptance complete unless manual smoke is actually run.

## Acceptance Criteria

- Web upload page contains audio upload and a distinct optional video upload
  path.
- Video upload accepts only MP4, MKV, MOV, and WEBM in browser hints.
- Upload progress is visible.
- A successful upload shows the created processing track.
- Processing/ready/failed states refresh from `GET /api/tracks/{id}`.
- Failure messages are useful and do not expose stack traces or temp paths.
- Audio upload behavior remains unchanged.
- `npm run typecheck` and `npm run build` pass.

## Tests To Run

From `web/`:

```powershell
npm run typecheck
npm run build
```

Optional backend regression from `backend/` if Web work reveals API mismatch:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_video_uploads_api.py
```

## Manual Verification

1. Start API, worker-capable backend environment, and Web dev server:

   ```powershell
   cd web
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

2. Log in through Web.
3. Open Upload.
4. Confirm normal audio upload UI still works.
5. Upload a small supported video with audio.
6. Confirm browser upload progress appears.
7. Confirm a processing track appears in the result list.
8. Run the worker from `backend/`:

   ```powershell
   .\.venv\Scripts\python.exe -m app.worker
   ```

9. Confirm the Web status reaches `ready`.
10. Open the created track detail and confirm normal playback.
11. Upload an unsupported or no-audio video and confirm a readable failure
    message after worker processing.

## Risks

- Sharing audio and video upload state too aggressively can regress normal audio
  upload.
- Browser MIME types are inconsistent; frontend validation must remain advisory.
- Polling may time out before slow video extraction completes.
- Existing Chinese UI strings may display oddly in PowerShell output; do not
  rewrite unrelated text.

## Stop Conditions

- Stop if `/api/tracks/upload-video` is missing or returns a different response
  shape than `Track`.
- Stop if V2.7 worker extraction is not implemented; in that case Web can show
  upload-created processing state, but cannot satisfy ready/failure smoke.
- Stop if a required UI change would require redesigning navigation or auth.

## Notes For Coding Agent

- Prefer adding a small `VideoUploadForm` over making `UploadForm` too generic.
- Keep status text focused on user action: upload accepted, extracting audio,
  processing track, ready, failed.
- Do not expose `ProcessingJob.source_path` or temp-video details.

# TASK-V2.9: Import Scan Support For User-Provided Video Files

## Goal

Extend the configured import-directory flow so scans can classify supported
video files and confirmed imports can accept selected videos for the same
temporary-video extraction pipeline used by Web video upload.

## Background

Tasks V2.1 to V2.5 implemented safe audio import roots, audio scan preview,
confirmed audio import, batch history, and Web import UI. Tasks V2.6 to V2.8
provide direct video upload and worker extraction. This task joins those paths:
audio candidates still use copy-and-process; video candidates become
video-extraction jobs.

## Scope

- Add `media_kind` or equivalent classification to import scan candidates:
  `audio`, `video`, or `unsupported`.
- Extend backend scan to recognize MP4, MKV, MOV, and WEBM.
- Extend confirmed import to process selected audio and video files explicitly.
- For video selections, copy the source video into controlled temp-video
  storage and create a `video_extraction` job.
- Preserve source files unchanged.
- Extend safe batch/item responses so Web can distinguish audio import results
  from video extraction results.
- Update Web import page to filter/select/show audio and video candidates.
- Add focused backend and Web tests/checks.

## Out of Scope

- No automatic import of every video in a directory.
- No source video deletion, move, rename, or cleanup.
- No external download support.
- No permanent library storage of source videos.
- No Android changes.
- No general file manager UI.

## Files To Inspect

- `backend/app/services/imports.py`
- `backend/app/schemas/imports.py`
- `backend/app/api/routes/imports.py`
- `backend/app/services/video_uploads.py`
- `backend/app/services/jobs.py`
- `backend/app/media/storage.py`
- `backend/app/media/paths.py`
- `backend/app/models/import_batch.py`
- `backend/app/models/processing_job.py`
- `backend/tests/test_imports_scan_api.py`
- `backend/tests/test_imports_confirm_api.py`
- `backend/tests/test_imports_batch_history_api.py`
- `backend/tests/test_video_uploads_api.py`
- `web/src/api/imports.ts`
- `web/src/types/imports.ts`
- `web/src/pages/ImportPage.tsx`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`

## Files Allowed To Modify

- `backend/app/services/imports.py`
- `backend/app/schemas/imports.py`
- `backend/app/api/routes/imports.py` only if request/response shape changes
  require route-level updates
- `backend/app/services/video_uploads.py` only to reuse validation/copy helpers
- `backend/app/media/storage.py` only if temp-video path helper needs a
  source-file import variant
- `backend/app/models/import_batch.py` and Alembic migration only if durable
  item kind cannot be represented safely without schema change
- Backend tests:
  - `backend/tests/test_imports_scan_api.py`
  - `backend/tests/test_imports_confirm_api.py`
  - `backend/tests/test_imports_batch_history_api.py`
  - `backend/tests/test_video_processing.py`
- `web/src/api/imports.ts`
- `web/src/types/imports.ts`
- `web/src/pages/ImportPage.tsx`
- New small Web import components only if they keep `ImportPage` simpler
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md` only after real checks

## Implementation Steps

1. Design the API shape with backward compatibility in mind.
   - Add `media_kind` to `ImportScanCandidate`, with values `audio` and
     `video`.
   - Keep existing fields: `relative_path`, `basename`, `extension`,
     `size_bytes`, `status`.
   - For unsupported files, either keep them in `skipped` with reasons or add a
     safe `media_kind: "unsupported"` only if existing Web can handle it.
   - Add `media_kind` to confirm results and batch items if Web needs it.

2. Extend backend scan.
   - Continue using the same root allowlist and path safety checks.
   - Audio extensions remain MP3, FLAC, M4A, WAV, OGG.
   - Video extensions are MP4, MKV, MOV, WEBM.
   - Apply scan limits to both audio and video.
   - Do not run FFmpeg/ffprobe during scan.
   - Do not compute hashes for video scan candidates.

3. Extend confirm import request handling.
   - Keep explicit selected relative paths; do not auto-import scan results.
   - Re-validate every selected path against the configured root.
   - Classify each selected file by extension at confirmation time.
   - Audio files use existing copy-to-originals and `audio_processing` job
     behavior.
   - Video files are copied into controlled temp-video storage and create a
     normal `Track` with `processing` status plus `video_extraction` job.
   - Use the authenticated user as track owner.
   - Source files remain unchanged.

4. Reuse video validation carefully.
   - For directory import, content type may be unavailable. Use extension and
     basic signature checks where practical.
   - Reuse `validate_saved_video_signature()` or extract a path-based helper
     from `video_uploads.py`.
   - If signature validation fails, report per-file `skipped` or `failed` with
     a UI-safe message.

5. Keep duplicate behavior advisory.
   - Existing exact-file duplicate warnings apply naturally to audio imports.
   - For video files, do not block import based on duplicate signals unless a
     simple safe warning is already available.
   - Do not delete, merge, overwrite, hide, or auto-deselect duplicates.

6. Update durable batch history.
   - Store only safe fields.
   - If adding `media_kind`, migrate `ImportItem` with a conservative default
     such as `audio` for existing rows.
   - Batch item track links should work for both audio imported tracks and
     video extraction tracks.
   - Track processing status remains source of truth.

7. Update Web import UI.
   - Show candidate kind as Audio or Video.
   - Add a small filter or segmented control only if it improves clarity:
     All / Audio / Video.
   - Allow explicit selection of both kinds.
   - Confirm button text can remain generic, such as `Import selected`.
   - Result list should distinguish imported audio from accepted video
     extraction jobs.
   - Continue showing skipped unsupported files separately.

8. Update tests.
   - Mixed scan: audio, video, unsupported.
   - Mixed confirm: one audio and one video create two tracks and two correct
     job types.
   - Video path safety: traversal and root escapes rejected.
   - Unsupported video or bad signature returns per-file skipped/failed.
   - Partial failure does not roll back successful files.
   - Source audio and source video files remain unchanged.
   - Web typecheck/build pass after type changes.

## Acceptance Criteria

- Import scan classifies candidates as audio, video, or unsupported/skipped.
- User explicitly selects audio/video candidates before confirmation.
- Audio selections follow V2.3 copy-and-process behavior.
- Video selections follow V2.6/V2.7 temp-video extraction behavior.
- Results distinguish imported audio tracks from accepted video extraction jobs.
- Source files are never deleted, moved, renamed, or modified.
- Batch history remains safe and current-user scoped.
- Web import page supports mixed audio/video review and selection.
- Backend focused tests and Web build checks pass.

## Tests To Run

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_scan_api.py tests\test_imports_confirm_api.py tests\test_imports_batch_history_api.py
.\.venv\Scripts\python.exe -m pytest tests\test_video_processing.py tests\test_worker_jobs.py
.\.venv\Scripts\python.exe -m pytest
```

If a migration is added:

```powershell
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m alembic upgrade head
```

From `web/`:

```powershell
npm run typecheck
npm run build
```

## Manual Verification

1. Configure a throwaway allowed import root outside the repository.
2. Put these files in it:
   - one supported audio file
   - one supported video file with audio
   - one unsupported file
   - one bad-signature video if practical
3. Log in to Web and open Import.
4. Scan the root.
5. Confirm audio/video candidates are classified safely and unsupported files
   are skipped or explained.
6. Select one audio and one video candidate.
7. Confirm import.
8. Confirm source files still exist and are unchanged.
9. Run the worker until both tracks finish.
10. Confirm audio import becomes ready.
11. Confirm video import extracts audio and becomes ready.
12. Confirm unsupported/bad files are not imported.

## Risks

- Request/response shape changes can break the existing Web import page.
- Video validation from server-side files has less MIME information than upload.
- Mixed imports can partially succeed; result counts and batch status must be
  accurate.
- Copying large videos into temp storage can fill disk if limits are too loose.

## Stop Conditions

- Stop if V2.7 worker video extraction is not implemented.
- Stop if Web V2.5 import UI is missing or has diverged from current API types.
- Stop if adding `media_kind` requires a breaking API change not covered by Web
  updates in the same task.
- Stop if path safety cannot be reused from `ImportRootPolicy`.

## Notes For Coding Agent

- Keep scan cheap: extension, size, and path checks only.
- Keep confirm authoritative: revalidate path, extension, size, and video
  signature.
- Prefer small helpers inside `imports.py` over a broad import architecture
  rewrite.
- If adding a migration, update tests and acceptance notes, but do not mark V2
  accepted without manual smoke.

# TASK-V2.10: Documentation And Smoke-Test Updates

## Goal

Update operational docs and acceptance records so V2 import and video features
have repeatable local and production-aware verification steps.

## Background

The acceptance document already contains gates and smoke flows, but it must be
updated with actual implementation reality and real verification results after
V2.7 to V2.9 are complete. This is a documentation and verification task only.

## Scope

- Update API manual testing steps.
- Update development workflow notes.
- Update environment and deployment docs.
- Update architecture notes if implementation details changed.
- Update env examples if new configuration was added.
- Append real dated acceptance results.
- Keep PowerShell-first local commands.

## Out of Scope

- No feature implementation.
- No test code changes unless a documentation command is discovered to be wrong
  and a separate task is opened.
- No acceptance completion claims without actual checks.
- No production secrets, real local paths, or personal media filenames.
- No automatic download documentation.
- No source-file cleanup recommendations.

## Files To Inspect

- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`
- `docs/TASKS/V2_IMPORT_AND_VIDEO_TASKS.md`
- `.env.example`
- `.env.production.example`
- `docker-compose.prod.yml`
- `deploy/`

## Files Allowed To Modify

- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`
- `.env.example`
- `.env.production.example`
- `README.md` only if top-level status changes after real acceptance
- `docs/ROADMAP.md` only if V2 status changes after real acceptance

## Implementation Steps

1. Audit completed implementation state.
   - Confirm V2.7, V2.8, and V2.9 are implemented before documenting them as
     available.
   - Confirm exact endpoint shapes and response fields from backend schemas and
     Web types.
   - Confirm exact env variable names from `backend/app/core/config.py`.

2. Update API manual testing.
   - Add commands or HTTP examples for import configuration, scan, confirm, and
     batch status.
   - Add video upload API smoke steps.
   - Add mixed audio/video import smoke steps.
   - Keep examples free of real personal paths and media names.

3. Update development docs.
   - Use Windows PowerShell commands first.
   - Include how to configure a throwaway import root outside the repository.
   - Include how to run API, Web, and worker for local smoke.
   - Include FFmpeg/ffprobe availability checks.

4. Update environment docs and examples.
   - Ensure import roots are documented as disabled by default when empty.
   - Ensure scan limits and video upload limits are documented.
   - Ensure temp video directory config is documented.
   - Do not add machine-local absolute paths to committed env examples.

5. Update deployment docs.
   - Explain Ubuntu host directories, bind mounts, permissions, and container
     read/write needs.
   - Clarify that API and worker need access to media and temp video storage.
   - Clarify that API and worker need read access to enabled import roots.
   - Mention Caddy body-size compatibility for video uploads.
   - Keep production import roots disabled by default unless operator enables
     them.

6. Update architecture docs if implementation differs.
   - Keep references concise.
   - Mention import roots, temp video storage, job types, and reuse of existing
     track/worker/media flows.
   - Do not expand future roadmap items.

7. Update acceptance record.
   - Append dated entries for V2.7, V2.8, V2.9, and final smoke only after each
     check actually runs.
   - Record exact commands and pass/fail results.
   - Record any skipped checks and why.
   - Mark final V2 acceptance only if automated and manual smoke criteria are
     satisfied.

8. Review docs for prohibited behavior.
   - Search for accidental references to deleting source files, URL downloads,
     Bilibili downloading, arbitrary filesystem browsing, or committed local
     paths.
   - Remove or reword any such guidance.

## Acceptance Criteria

- Docs cover configured import roots, scan preview, confirmed audio import,
  duplicate warnings, video upload, worker extraction, and mixed audio/video
  import.
- Development docs use PowerShell-first local commands.
- Deployment docs cover Ubuntu host paths, bind mounts, permissions, Caddy body
  size, and FFmpeg availability.
- Env docs/examples describe configuration without secrets or real local paths.
- Architecture docs match the actual implemented module boundaries.
- Acceptance document contains real dated verification results.
- No docs describe automatic internet download or source-file deletion as
  normal behavior.

## Tests To Run

Documentation-only checks:

```powershell
rg "Bilibili|download|delete|move|rename|C:\\\\|/Users/|/home/" docs .env.example .env.production.example
```

Run the final implementation checks before acceptance, from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet
```

From `web/`:

```powershell
npm run typecheck
npm run build
```

If Android-facing track response fields changed unexpectedly, run the relevant
Android build/test command documented in `docs/DEVELOPMENT.md`.

## Manual Verification

Run and record these three smoke flows from
`docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md`:

1. Manual Local Smoke Flow: Audio Import.
2. Manual Local Smoke Flow: Video Upload.
3. Manual Local Smoke Flow: Mixed Import Directory.

Also perform deployment-aware review:

- `.env.production.example` has no real host paths or secrets.
- Production compose config validates.
- Deployment docs explain import roots are optional and disabled by default.
- API and worker mount/access requirements are documented.

## Risks

- Docs can accidentally claim acceptance before manual smoke actually happened.
- Env examples can accidentally leak local paths.
- Deployment notes can imply dangerous source cleanup if wording is careless.
- Architecture docs can drift if implementation details are assumed instead of
  checked.

## Stop Conditions

- Stop if V2.7 to V2.9 are not implemented but docs would present them as
  complete.
- Stop if manual smoke cannot run; record it as not run with a clear reason
  instead of marking accepted.
- Stop if production env examples require real operator secrets or paths.

## Notes For Coding Agent

- This is a documentation task, but verification matters: commands and results
  must be real.
- Keep docs concise and operational.
- Prefer adding dated acceptance notes over rewriting the whole acceptance
  document.
- If a check fails, document the failure only if asked; otherwise fix the
  underlying task in a separate scoped implementation pass.
