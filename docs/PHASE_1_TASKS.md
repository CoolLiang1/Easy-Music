# Phase 1 Development Tasks

## Execution Principles

- One Codex session should complete exactly one task.
- After each task is completed, run `git diff` and inspect the changes.
- After a task passes verification, commit it separately.
- Do not implement later tasks early.
- Do not expand the task scope.

## Task 1: Implement User Model And Initial Auth Migration

### Goal

Create the single-user authentication database foundation.

### Directories

- `backend/app/models/`
- `backend/app/auth/`
- `backend/alembic/versions/`

### Main Files

- `backend/app/models/user.py`
- `backend/app/auth/password.py`
- Alembic migration file for `users`

### Dependencies

- Phase 0 Task 6.

### Acceptance Criteria

- `users` table includes:
  - `id`
  - `username`
  - `password_hash`
  - `created_at`
- Passwords are hashed with a safe password hashing library.
- There is a clear development-safe way to create the initial user.
- Migration runs cleanly against PostgreSQL.

### Do Not

- Do not implement public registration.
- Do not implement OAuth.
- Do not hard-code a default production password.
- Do not create Web login UI.

## Task 2: Implement Auth API

### Goal

Provide token-based login and current-user endpoints for the single-user system.

### Directories

- `backend/app/auth/`
- `backend/app/api/routes/`
- `backend/app/schemas/`

### Main Files

- `backend/app/auth/tokens.py`
- `backend/app/auth/dependencies.py`
- `backend/app/api/routes/auth.py`
- `backend/app/schemas/auth.py`

### Dependencies

- Task 1.

### Acceptance Criteria

- API implements:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Login returns an access token.
- Protected endpoints can resolve the current user.
- Invalid credentials return HTTP 401.
- Basic tests cover successful login, failed login, and current-user lookup.

### Do Not

- Do not implement user registration.
- Do not implement refresh tokens unless explicitly scoped.
- Do not implement frontend login.
- Do not leave business APIs publicly accessible.

## Task 3: Implement Track, Tag, And TrackTag Models

### Goal

Create the core database models for the music library.

### Directories

- `backend/app/models/`
- `backend/alembic/versions/`

### Main Files

- `backend/app/models/track.py`
- `backend/app/models/tag.py`
- `backend/app/models/track_tag.py`
- Alembic migration file for tracks, tags, and track tags

### Dependencies

- Task 2.

### Acceptance Criteria

- Track includes Phase 1 fields from the architecture draft:
  - `id`
  - `user_id`
  - `title`
  - `artist`
  - `album`
  - `duration_seconds`
  - `content_type`
  - `original_file_path`
  - `playback_file_path`
  - `cover_path`
  - `source_url`
  - `format`
  - `bitrate`
  - `status`
  - `liked`
  - `cooldown_until`
  - `created_at`
  - `updated_at`
- Tag includes:
  - `id`
  - `user_id`
  - `name`
  - `group`
  - `created_at`
- TrackTag includes:
  - `track_id`
  - `tag_id`
  - `confidence`
  - `source`
- Migrations run cleanly.

### Do Not

- Do not implement PlaybackEvent, FeedbackEvent, RecommendationRequest, or RecommendationResult yet.
- Do not implement AI tag suggestion.
- Do not implement complex search.
- Do not implement upload processing in this task.

## Task 4: Implement Tag CRUD API

### Goal

Expose authenticated CRUD endpoints for tag management.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`

### Main Files

- `backend/app/api/routes/tags.py`
- `backend/app/schemas/tag.py`
- `backend/app/services/tags.py`

### Dependencies

- Task 3.

### Acceptance Criteria

- API implements:
  - `GET /api/tags`
  - `POST /api/tags`
  - `PATCH /api/tags/{id}`
  - `DELETE /api/tags/{id}`
- All endpoints require authentication.
- Users can only access their own tags.
- Tag group is limited to:
  - `scenario`
  - `state`
  - `type`
  - `attribute`
- Tests cover create, list, update, delete, and unauthorized access.

### Do Not

- Do not implement batch tag editing.
- Do not implement AI tag suggestions.
- Do not implement Web tag editor.
- Do not implement Recommendation behavior.

## Task 5: Implement Track CRUD API

### Goal

Expose authenticated CRUD endpoints for track metadata management, excluding upload and media processing.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`

### Main Files

- `backend/app/api/routes/tracks.py`
- `backend/app/schemas/track.py`
- `backend/app/services/tracks.py`

### Dependencies

- Task 3.
- Task 4.

### Acceptance Criteria

- API implements:
  - `GET /api/tracks`
  - `GET /api/tracks/{id}`
  - `PATCH /api/tracks/{id}`
  - `DELETE /api/tracks/{id}`
- API supports updating:
  - `title`
  - `artist`
  - `album`
  - `content_type`
  - `source_url`
  - `liked`
  - `cooldown_until`
  - tag associations
- Users can only access their own tracks.
- Tests cover list, detail, update, delete, tag association, and unauthorized access.

### Do Not

- Do not implement upload.
- Do not implement streaming.
- Do not batch-delete media files.
- Do not implement recommendation logic.

## Task 6: Implement Media Storage Path Service

### Goal

Centralize original and playback file path generation with path traversal protection.

### Directories

- `backend/app/media/`
- `backend/app/core/`

### Main Files

- `backend/app/media/storage.py`
- `backend/app/media/paths.py`
- `backend/app/core/config.py`

### Dependencies

- Task 5.

### Acceptance Criteria

- Storage service can generate paths for original uploads and playback MP3 files.
- File names are sanitized.
- Resolved paths cannot escape `MEDIA_ROOT`.
- Path layout supports user and track separation.
- Unit tests cover unsafe file names and path traversal attempts.

### Do Not

- Do not delete directories.
- Do not batch-clean media files.
- Do not use the raw uploaded filename as the final storage path.
- Do not implement cloud storage.

## Task 7: Implement Upload Endpoint And Original File Storage

### Goal

Allow authenticated users to upload supported audio files, save originals, and create processing-ready Track records.

### Directories

- `backend/app/api/routes/`
- `backend/app/services/`
- `backend/app/media/`

### Main Files

- `backend/app/api/routes/uploads.py`
- `backend/app/services/uploads.py`
- `backend/app/media/storage.py`

### Dependencies

- Task 5.
- Task 6.

### Acceptance Criteria

- API implements `POST /api/tracks/upload`.
- Supported upload formats:
  - MP3
  - FLAC
  - M4A
  - WAV
  - OGG
- Upload size is limited by configuration.
- File extension and basic content type are validated.
- Original file is saved under controlled media storage.
- Track is created with `uploading` or `processing` status.
- API returns the created Track.

### Do Not

- Do not run heavy FFmpeg transcoding inside the request.
- Do not implement Web upload UI.
- Do not accept arbitrary file types.
- Do not trust client-provided paths.

## Task 8: Implement FFmpeg And ffprobe Wrapper

### Goal

Provide testable media processing primitives for metadata extraction and MP3 generation.

### Directories

- `backend/app/media/`

### Main Files

- `backend/app/media/ffmpeg.py`
- `backend/app/media/metadata.py`

### Dependencies

- Task 6.

### Acceptance Criteria

- `ffprobe` wrapper extracts:
  - duration
  - format
  - bitrate
  - title, artist, and album when available
- `ffmpeg` wrapper generates MP3 playback files.
- Subprocess calls use argument arrays, not shell string concatenation.
- Media processing failures raise structured exceptions.
- Tests can mock subprocess calls.

### Do Not

- Do not implement BPM, vocal, mood, language, or embedding analysis.
- Do not call AI services.
- Do not execute shell commands through concatenated strings.
- Do not implement worker orchestration in this task.

## Task 9: Implement Worker Processing Pipeline For One Track

### Goal

Process one uploaded Track from original file to ready playback MP3.

### Directories

- `backend/app/worker/`
- `backend/app/media/`
- `backend/app/services/`

### Main Files

- `backend/app/worker/main.py`
- `backend/app/worker/jobs.py`
- `backend/app/services/processing.py`

### Dependencies

- Task 7.
- Task 8.

### Acceptance Criteria

- Worker can process a specified Track ID.
- Pipeline:
  - Loads the Track.
  - Extracts metadata with `ffprobe`.
  - Generates playback MP3 with `ffmpeg`.
  - Updates Track metadata and playback path.
  - Marks success as `ready`.
  - Marks failure as `failed`.
- Re-running the same track does not corrupt database state.
- Docker Compose worker has a runnable entrypoint.

### Do Not

- Do not introduce Redis or Celery unless explicitly scoped.
- Do not implement AI tag suggestions.
- Do not implement cover extraction unless separately scoped.
- Do not batch-delete old media files.

## Task 10: Connect Uploads To Worker Jobs

### Goal

Make uploaded tracks enter a background processing queue or job table so API requests can return quickly.

### Directories

- `backend/app/models/`
- `backend/app/services/`
- `backend/app/worker/`
- `backend/alembic/versions/`

### Main Files

- `backend/app/models/processing_job.py`
- `backend/app/services/jobs.py`
- `backend/app/worker/main.py`
- Alembic migration file for processing jobs

### Dependencies

- Task 9.

### Acceptance Criteria

- Upload creates a processing job.
- Worker can pick up pending jobs and process them.
- Job statuses include:
  - `pending`
  - `running`
  - `succeeded`
  - `failed`
- Failure records an error message.
- API upload response does not wait for full media processing.

### Do Not

- Do not implement complex retry scheduling.
- Do not implement multi-worker distributed locking beyond basic duplicate protection.
- Do not introduce Recommendation or AI jobs.
- Do not add external queue infrastructure unless explicitly approved.

## Task 11: Implement Track Stream Endpoint

### Goal

Expose ready playback MP3 files through an authenticated streaming endpoint.

### Directories

- `backend/app/api/routes/`
- `backend/app/media/`

### Main Files

- `backend/app/api/routes/tracks.py`
- `backend/app/media/responses.py`

### Dependencies

- Task 9 or Task 10.

### Acceptance Criteria

- API implements `GET /api/tracks/{id}/stream`.
- Users can only stream their own tracks.
- Only `ready` tracks with playback files can be streamed.
- Endpoint supports basic Range requests suitable for audio playback.
- File paths are resolved through the media storage service.

### Do Not

- Do not implement Android playback client.
- Do not implement Web audio player.
- Do not expose original files publicly.
- Do not bypass authentication.

## Task 12: Add Phase 1 Backend Tests And Manual Verification Docs

### Goal

Make Phase 1 backend behavior repeatably verifiable through automated tests and manual local commands.

### Directories

- `backend/tests/`
- `docs/`

### Main Files

- `backend/tests/`
- `docs/DEVELOPMENT.md`
- `docs/API_MANUAL_TESTING.md`

### Dependencies

- Tasks 1 through 11.

### Acceptance Criteria

- Tests cover:
  - Auth
  - Tags
  - Tracks
  - Upload validation
  - Storage path safety
  - Worker processing behavior
- Manual documentation explains how to:
  - Start local services.
  - Run migrations.
  - Create the initial user.
  - Upload a test audio file.
  - Run the worker.
  - Stream a ready track.
- Docker Compose local flow is documented.

### Do Not

- Do not write Web tests.
- Do not write Android tests.
- Do not test Recommendation or AI Assistant.
- Do not add production deployment hardening.
