# Development

This document describes the local development workflow for Easy Music.

Easy Music has completed Phase 1–6: backend core, Web management console,
Android Media3 player, Android manual offline cache, Recommendation V1, and AI
Assistant V1.  The FastAPI backend, PostgreSQL migrations, media storage
helpers, upload endpoint, authenticated track/tag APIs, streaming endpoint,
playback-event sync endpoint, Recommendation V1 feedback endpoint, structured
recommendation endpoint, and worker flow exist. The Web app supports browser
login, library viewing, upload, processing refresh, metadata editing, tag
management, track tag assignment, authenticated playback for ready tracks,
a structured Recommendation V1 test panel, and an AI Assistant panel. The
Android app supports authenticated library/detail flows, Media3 playback,
Phase 4 manual offline cache behavior, a structured Recommendation Home, and
natural-language AI recommendation input. V2.1 adds ordinary owner-scoped
playlist management on the backend and Web, plus Web and Android playlist
playback queues for sequence, shuffled-once, and reverse playback.

Production deployment is covered separately.  For the full step-by-step
guide see `docs/DEPLOYMENT.md`.  For production environment variables
refer to `.env.production.example` in the repository root.

Production ML or training platforms, social features, automatic full-library
offline sync, complex download queue management, and background caching of the
entire library remain outside the current scope.

## Workflow

1. Start from the intended development branch.
2. Work on one documented task at a time.
3. Keep changes inside the files and directories named by the current task.
4. Do not implement later tasks early.
5. Inspect `git diff` before committing.
6. Commit completed tasks separately with a concise Conventional Commits
   message.

## Backend Setup

The backend lives in `backend/` and uses FastAPI, SQLAlchemy, Alembic,
PostgreSQL, and FFmpeg/ffprobe.

Check local FFmpeg tools before running real media-processing smoke tests:

```powershell
ffmpeg -version
ffprobe -version
```

From the repository root, start PostgreSQL with Docker Compose:

```powershell
docker compose up -d postgres
```

Create a local backend environment from `backend/` if one does not already
exist:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

Use the repository development database URL when running backend commands from
the host:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
```

User-provided video upload uses a separate size limit and temporary media
subdirectory:

```powershell
$env:TEMP_VIDEOS_DIR = "temp-videos"
$env:MAX_VIDEO_UPLOAD_MB = "1024"
```

The API stores accepted videos under `MEDIA_ROOT\temp-videos` and creates a
`video_extraction` processing job. The worker extracts audio from accepted
videos via `extract_audio_from_video` (FFmpeg with `-vn`), stores the
extracted audio as a controlled original, and then runs the existing audio
processing pipeline (metadata, playback MP3, duplicate signals). Temp videos
are deleted on successful extraction and kept for retry/debug on failure.

V2 import tools are disabled by default. To test import-root safety, the
read-only audio scan preview, confirmed audio import, and import batch history,
configure throwaway directories outside the repository and outside
`MEDIA_ROOT`; semicolons are safest for Windows paths:

```powershell
$env:IMPORT_ALLOWED_ROOTS = "D:\EasyMusicImport;E:\AnotherImport"
$env:IMPORT_SCAN_MAX_FILES = "1000"
$env:IMPORT_SCAN_MAX_DEPTH = "5"
$env:IMPORT_SCAN_MAX_FILE_MB = "200"
```

Do not point import roots at `C:\`, `/`, your home directory, this repository,
or the Easy Music media storage directory. Scan preview is read-only: it does
not create tracks, processing jobs, hashes, copies, moves, or deletes.
Confirmed import copies explicitly selected audio files into controlled Easy
Music media storage, keeps the source files unchanged, creates normal
processing tracks and jobs, and records safe import batch history for the Web.

Apply migrations from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create the initial local user after migrations have been applied:

```powershell
$env:EASY_MUSIC_INITIAL_PASSWORD = "replace-with-a-local-password"
.\.venv\Scripts\python.exe -m app.auth.initial_user --username admin
```

The initial-user command is single-use and refuses to create another user if
any user already exists. It does not define a default production password.

Run the API locally from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run one pending worker job from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.worker
```

Run the worker continuously from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.worker --loop --poll-interval 5
```

The same loop mode can be enabled with environment variables:

```powershell
$env:WORKER_LOOP = "true"
$env:WORKER_POLL_INTERVAL_SECONDS = "5"
.\.venv\Scripts\python.exe -m app.worker
```

Run the worker for a specific track ID:

```powershell
.\.venv\Scripts\python.exe -m app.worker --track-id 1
```

Sync Android playback events after applying Phase 4 migrations:

```powershell
$eventId = [guid]::NewGuid().ToString()
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $eventId
        track_id = $trackId
        event_type = "play"
        position_seconds = 0
        duration_seconds = 1
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

The endpoint is authenticated, accepts small batches, validates track ownership,
and reports per-event `accepted`, `duplicate`, or `failed` results so Android
can retry offline events safely.

Record Recommendation V1 feedback events after applying Phase 5 Task 5.1
migrations:

```powershell
$feedbackEventId = [guid]::NewGuid().ToString()

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/feedback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $feedbackEventId
        track_id = $trackId
        feedback_type = "not_today"
        scene_tag_ids = @()
        feature_tag_ids = @()
        type_tag_ids = @()
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

The endpoint is authenticated, accepts small batches, validates track and
context-tag ownership, and reports per-event `accepted`, `duplicate`, or
`failed` results. `like` sets `tracks.liked` to `true`; `tired` records feedback
and sets a default 14-day `tracks.cooldown_until` from `occurred_at`; `dislike`
records a strong recommendation penalty without adding a track-level disliked
column.

Request structured Recommendation V1 results after applying Phase 5 Task 5.3:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/recommendations" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    scene_tag_ids = @($sceneTagId)
    feature_tag_ids = @($featureTagId)
    type_tag_ids = @($typeTagId)
    raw_text = "night coding focus"
    cooldown_mode = "soft"
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

The endpoint is authenticated, accepts only structured tag id groups, validates
tag ownership and tag group compatibility, and returns a `request_id` plus up to
three ordered results. Each result includes `rank`, `score`, deterministic
rule-based `reason`, structured explanation details, and the existing track
response payload. V2 Recommendation Foundation keeps `cooldown_mode` optional:
`soft` is the default and applies an active-cooldown score penalty, `off`
ignores active cooldown, and `strict` restores the previous hard exclusion.
Same-day `not_today` feedback remains a hard exclusion. Optional `raw_text`
is not parsed as a natural-language request by this endpoint; it is only a
scoring hint for playlist name/description relevance alongside requested tag
names. The response includes `exclusions_considered` for tracks filtered before
ranking, such as strict cooldown or same-day `not_today` feedback.

Review recently revived ready tracks after playback and feedback events exist:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/recommendations/revived" `
  -Headers $headers
```

The revived endpoint is authenticated, current-user scoped, and read-only. It
returns long-unplayed ready tracks before never-played ready tracks, includes
track tags when available, and suppresses tracks with active cooldown,
same-day `not_today`, or recent strong negative feedback.

Review advisory duplicate candidates after applying V1.1 duplicate migrations
and processing uploads:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/duplicates" `
  -Headers $headers
```

The duplicate endpoint is authenticated, current-user scoped, and read-only. It
returns exact file-hash groups and conservative metadata/duration groups using a
compact track payload that does not include internal media paths. Add
`?track_id=$trackId` to filter groups for one owned track.

Manage V2.1 playlists after applying the playlist migration:

```powershell
$playlist = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playlists" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"name":"Night coding","description":"Deep focus sessions"}'

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playlists/$($playlist.id)/tracks" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ track_id = $trackId } | ConvertTo-Json)

Invoke-RestMethod `
  -Method Put `
  -Uri "http://127.0.0.1:8000/api/playlists/$($playlist.id)/tracks/order" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ track_ids = @($trackId) } | ConvertTo-Json)
```

Playlist endpoints are authenticated and current-user scoped. Adding the same
track twice is idempotent and leaves one playlist-track row. Reorder requests
must contain exactly the playlist's current track ids. Deleting a track also
removes playlist-track rows for that track. Playlist descriptions are optional
and are used with playlist names as Recommendation V2 Foundation scoring
signals; they do not create smart or generated playlists.

## Docker Compose Local Flow

Docker Compose defines `postgres`, `api`, and `worker` services for local
integration checks. The backend image includes FFmpeg, ffprobe, `alembic.ini`,
and the `alembic/` migration directory.

```powershell
docker compose up -d postgres api
```

Check FFmpeg tools inside the API container:

```powershell
docker compose exec api sh -c "ffmpeg -version && ffprobe -version"
```

The Compose services read development-safe values from `.env.example` and
override container-specific `DATABASE_URL` and `MEDIA_ROOT` values. Run
database migrations inside the API container:

```powershell
docker compose exec api alembic upgrade head
```

You can also run migrations from the host against the Compose PostgreSQL port:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Process pending jobs through Compose with:

```powershell
docker compose run --rm worker
```

Run a continuously polling Compose worker with:

```powershell
docker compose up -d worker-loop
```

## AI Provider Configuration (Development Only)

Phase 6 adds a development-safe AI provider abstraction. All AI features are off
by default. No real API keys are committed.

### Local Backend AI Settings

From `backend/`, set these environment variables before starting the API:

```powershell
$env:AI_ENABLED = "true"
$env:AI_PROVIDER = "openai-compatible"
$env:AI_API_KEY = "your-own-provider-key"
$env:AI_MODEL = "gpt-4o-mini"
$env:AI_BASE_URL = "https://api.openai.com/v1"
```

| Variable       | Default                      | Notes                                      |
| -------------- | ---------------------------- | ------------------------------------------ |
| `AI_ENABLED`   | `false`                      | Must be `true` for any AI feature to work. |
| `AI_PROVIDER`  | `""`                         | Provider identifier; currently only `openai-compatible` is expected. |
| `AI_API_KEY`   | `""`                         | Your own key — never commit it.            |
| `AI_MODEL`     | `""`                         | Model id recognised by the provider, e.g. `gpt-4o-mini`. |
| `AI_BASE_URL`  | `""`                         | Provider API base, e.g. `https://api.openai.com/v1`. |

When `AI_ENABLED` is `false` or `AI_API_KEY` / `AI_MODEL` are empty, the
provider service returns a documented `disabled` or `unconfigured` status.
Downstream AI endpoints can map these to clear responses without crashing.

### Docker Compose

The `.env.example` file at the repository root includes placeholder AI variables.
Copy the AI section to a local `.env` file (never committed) and set your own
values when you need to test AI features locally:

```powershell
AI_ENABLED=true
AI_PROVIDER=openai-compatible
AI_API_KEY=your-own-provider-key
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
```

Recreate the `api` service after changing `.env`:

```powershell
docker compose up -d --force-recreate api
```

### Provider Abstraction

- `backend/app/core/config.py` — settings fields (`AI_ENABLED`, `AI_PROVIDER`,
  `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`).
- `backend/app/services/ai_provider.py` — `AiProviderService` that detects
  disabled/unconfigured state and delegates to an injectable client.
- `backend/app/services/ai_json.py` — `extract_json`, prompt builders, and the
  `complete_and_parse_json` pipeline that validates LLM output against a Pydantic
  model.
- `backend/app/services/ai_intent.py` — `parse_listening_intent` service that
  loads the user's tag catalogue, builds a prompt, calls the AI, and re-validates
  returned tag ids through the Phase 5 recommendation tag checks.
- `backend/app/services/ai_tag_suggestions.py` — `suggest_tags_for_track` service
  that suggests existing tags (by id) and optional new tag names for a track
  using track metadata and the user's tag taxonomy.  Never creates or assigns tags.
- `backend/app/schemas/ai.py` — `AiCompletionRequest`, `AiCompletionResult`,
  `ParseListeningIntentRequest`, `ParsedIntentResponse`, and supporting schemas.

Available AI endpoints after Task 6.5:

- `POST /api/ai/parse-listening-intent` (authenticated) — maps natural-language
  listening requests to Phase 5-compatible structured tag ids using only the
  current user's existing tags.
- `POST /api/ai/recommend` (authenticated) — parses natural-language intent via
  the AI, then delegates ranking to the existing Phase 5 recommendation service.
  The LLM never selects track ids and never bypasses active-cooldown scoring,
  recent-playback penalties, playlist scoring, or feedback exclusions and
  penalties.
- `POST /api/ai/tracks/{track_id}/suggest-tags` (authenticated) — suggests
  existing tags and optional new tag names for a track using AI-assisted
  metadata analysis. The endpoint never creates or assigns tags.

Later tasks will add the actual HTTP provider client and additional AI endpoints.

## Web Setup

The Web app lives in `web/` and uses React, TypeScript, and Vite.

Install Web dependencies from `web/`:

```powershell
cd web
npm install
```

Configure the Web API base URL for the current terminal when the backend does
not run at the default `http://127.0.0.1:8000`:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
```

Run the Web development server from `web/`:

```powershell
npm run dev
```

Vite prints the local browser URL, usually `http://127.0.0.1:8081/`. The Web
console calls the backend API after login, so run PostgreSQL, migrations, the
API, and an initial local user before doing a full browser smoke test.

On Windows, common Vite/dev ports such as `5173` or `3000` can fall inside TCP
port ranges reserved by the OS or Hyper-V/WSL. The checked-in Vite config
therefore uses `127.0.0.1:8081` for local Web development.

The V2.1 playlist page is available at `/playlists` after login. It can create,
rename, delete, and open ordinary user playlists, add owned tracks, remove
tracks, save order changes, and start a local Web playback queue in sequence,
one-time shuffled, or reverse order. It does not create smart playlists,
persist queue state on the backend, or automatically generate playlists.
V2 Recommendation Foundation uses manually curated playlist membership plus
playlist name/description relevance as backend recommendation scoring signals.

V2.2 promotes Queue to first-class local temporary client state. Web exposes a
global queue drawer for current/upcoming management, previous/next, remove,
clear, upcoming drag reorder, and playlist-only repeat. Android exposes the
same local queue model through Media3 state and the Now Playing queue
management surface. Queue remains process/page-local; there is no backend queue
API and no cross-device queue sync.

V2.2 acceptance is recorded in
`docs/ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md`. Web automated checks and
browser smoke are recorded as passed. Android automated checks and
emulator/device smoke are recorded as passed.

Android playback performance debugging notes are recorded in
`docs/DEBUGGING/ANDROID_PLAYBACK_QUEUE_PERFORMANCE.md`. Start there if playback
or playlist queue startup causes sustained app-wide jank, high main-thread CPU,
or repeated media notification updates.

The V2 import page is available at `/imports` after login. It reads the
configured import roots from the backend, scans one configured root and optional
relative subdirectory, lets the user explicitly select supported audio
and video candidates, confirms import, and refreshes the latest import batch
status using the existing track processing status. Video candidates are copied
into temporary video storage and create `video_extraction` processing jobs;
the worker extracts audio from them into the normal audio processing pipeline.

Run the Web type check from `web/`:

```powershell
npm run typecheck
```

Build the Web app from `web/`:

```powershell
npm run build
```

There is no `npm run lint` script configured for the Web app at this time.

## Phase 2 Web Browser Smoke Test

Use this flow to verify the completed Phase 2 Web console against the local
backend:

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply database migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial user. If the database already has a user, keep
   using that account instead of creating another one.

   Host flow from `backend/`:

   ```powershell
   $env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
   $env:MEDIA_ROOT = ".\media"
   $env:APP_SECRET_KEY = "development-secret-key-change-before-deploy"
   $env:EASY_MUSIC_INITIAL_PASSWORD = "replace-with-a-local-password"
   .\.venv\Scripts\python.exe -m app.auth.initial_user --username admin
   ```

4. From `web/`, install dependencies if needed, then start Vite:

   ```powershell
   npm install
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

5. Open the Vite URL, usually `http://127.0.0.1:8081/`, and log in with the
   local user.
6. Visit `Upload`, upload an MP3, FLAC, M4A, WAV, or OGG file, and confirm the
   page shows per-file browser upload progress, then creates a track with an
   initial processing status.
7. Run a worker from the repository root:

   ```powershell
   docker compose run --rm worker
   ```

   Or keep the worker running:

   ```powershell
   docker compose up -d worker-loop
   ```

8. Return to `Upload`, `Library`, or the track detail page and use refresh, or
   wait for lightweight polling while the track is processing, until the status
   becomes `ready`. Failed processing should show the backend processing error
   message when one is available.
9. Select two or more tracks in Library, choose existing tags from the batch
   tag panel, confirm adding and removing tags, and verify the affected rows
   update without changing unselected tracks.
10. Open `Reports` and confirm the read-only organization sections load:
    untagged ready tracks, missing metadata, processing attention, duplicate
    candidates, never played, rarely played, and expired cooldowns.
11. Open the track detail page and edit title, artist, album, content type,
   source URL, liked state, cooldown date, cover image, and assigned tags as
   needed.
12. Visit `Recommendations` and confirm the read-only Recently Revived section
    loads quiet ready tracks, links to Track Detail, and does not auto-play,
    auto-cache, or modify feedback.
13. Visit `Tags`, create a tag in one of the supported groups (`scene`,
    `type`, `feature`), rename it, change its group, and delete one
    explicit tag.
14. For a ready track, use the playback control from the library row or track
    detail page and confirm audio loads through the authenticated stream
    endpoint.

Expected result:

- Login stores a browser session and protected pages load after refresh.
- Upload creates a processing track.
- Worker processing updates the track to `ready`.
- Metadata and tag edits persist after refresh.
- Ready tracks play in the browser.
- Non-ready tracks keep playback disabled.

## V1.1 Duplicate Detection Web Smoke Test

Use this flow to verify the advisory duplicate-detection Web workflow after
applying the V1.1 duplicate backend and Web tasks. Do not commit generated test
media or local media/database state.

1. Start PostgreSQL, apply migrations, start the API, and create or reuse a
   local user.
2. From `web/`, start Vite against the local API:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Log in through the Web console.
4. Upload a unique supported audio file and confirm the upload result shows no
   duplicate warning after the duplicate check finishes.
5. Process the uploaded track with the worker until it is `ready`.
6. Upload the same audio file again and confirm upload completion is not
   blocked.
7. Confirm the upload result shows an advisory duplicate warning with candidate
   metadata and match reason.
8. Open Library, then open `Review duplicates` or the sidebar `Duplicates`
   route.
9. Confirm `/duplicates` shows grouped exact or likely candidates.
10. Open a candidate Track Detail link and confirm the existing detail page
    still loads.
11. Confirm no duplicate workflow deletes, merges, overwrites, hides, or
    modifies tracks automatically.

Record the result in
`docs/ACCEPTANCE/V1_1_DUPLICATE_DETECTION_ACCEPTANCE.md`. Do not mark duplicate
detection accepted until this browser smoke has passed.

## Automated Checks

Run all Phase 1 backend tests from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Run the focused V2 import-root safety, scan-preview, confirmed-import, and
batch-history checks from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_imports_config.py tests\test_imports_path_safety.py tests\test_imports_scan_api.py tests\test_imports_confirm_api.py tests\test_imports_batch_history_api.py
```

The test suite covers:

- Auth login, invalid credentials, and current-user lookup.
- Authenticated tag create, list, update, delete, validation, and ownership.
- Authenticated track list, detail, update, delete, tag association, ownership,
  and streaming behavior.
- Authenticated playlist CRUD, optional descriptions, ownership isolation,
  add/remove, idempotent duplicate add, reorder validation, track-delete
  relationship cleanup, and playlist signal isolation.
- Authenticated playback-event bulk sync, validation, ownership, and duplicate
  retry behavior.
- Authenticated feedback-event sync, context tag validation, `like`, `dislike`,
  `tired`, and duplicate retry behavior.
- Authenticated structured recommendation requests, tag ownership/group
  validation, empty results, ordered results, cooldown `off`/`soft`/`strict`,
  playlist scoring, feedback scoring, and deterministic reason fields.
- Upload validation, original-file storage, and processing-job creation.
- Media storage path generation and path traversal protection.
- FFmpeg/ffprobe argument construction and structured failures.
- Track processing success, rerun behavior, and failure handling.
- Worker job success, failure, and empty-queue behavior.

Manual API verification steps are documented in
`docs/API_MANUAL_TESTING.md`.

Run the Phase 2 Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript completes without errors.
- Vite produces a production build under `web/dist/`.
- No Web lint command is expected until a lint script is added to
  `web/package.json`.

## Android Local Backend

The Android app lives in `android/` and uses Kotlin, Jetpack Compose, Material
3, AndroidX DataStore, and AndroidX Media3.

Build and test from `android/`:

```powershell
cd android
.\gradlew.bat build
.\gradlew.bat test
```

V1.1 Android launcher shortcuts are static shortcuts for Library,
Recommendations, Cached Tracks, and Now Playing. They route through
`MainActivity` and the existing auth/session recovery flow: signed-out launches
show Login, while authenticated launches open the requested screen. The Now
Playing shortcut opens the existing Now Playing screen and does not auto-start
playback or create a new playback service.

The Android backend base URL must stay configurable. Do not write production
hosts, usernames, passwords, or bearer tokens into source files.

V2.1 Android playlists are available from the bottom navigation after login.
The Android client reads `GET /api/playlists` and `GET /api/playlists/{id}`,
opens a selected playlist, and can start Media3 playback queues in sequence,
one-time shuffled, or reverse order. Media3 owns next/previous navigation after
the queue is built, so notification, lock-screen, and headset controls continue
to target the current queue. It does not edit playlists on Android, persist
queue state on the backend, or automatically generate playlists. Manual
playlist membership and playlist text can still affect backend recommendation
scoring through V2 Recommendation Foundation.

- Android emulator to host backend: use `http://10.0.2.2:8000`.
- Connected device or emulator with port reverse: run
  `adb reverse tcp:8000 tcp:8000`, then configure the app for
  `http://127.0.0.1:8000`.
- Physical device without port reverse: use the host machine LAN URL, for
  example `http://<host-lan-ip>:8000`, and update the debug network security
  config if cleartext HTTP is needed for that host.
- Production environments should use HTTPS.

## Phase 3 Android Smoke Test

Use this flow to verify the completed Phase 3 Android player against the local
Phase 1 backend:

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply database migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial local user. If the database already has a user,
   keep using that account instead of creating another one.
4. Upload a supported audio file through the Web console if a ready track does
   not already exist.
5. Process pending media jobs until at least one track is `ready`:

   ```powershell
   docker compose run --rm worker
   ```

   Or keep the worker running:

   ```powershell
   docker compose up -d worker-loop
   ```

6. Open the Android project in Android Studio or install a debug build on an
   emulator or device.
7. Configure the Android API base URL for the target environment. The stock
   emulator host-loopback URL is usually `http://10.0.2.2:8000`.
8. Log in with the local user and confirm Library loads tracks from
   `GET /api/tracks`.
9. Open a track detail screen and confirm fresh metadata loads from
   `GET /api/tracks/{track_id}`.
10. Play a `ready` track and confirm streaming uses
    `GET /api/tracks/{track_id}/stream` with bearer authentication.
11. Confirm foreground controls, mini player state, background playback,
    notification controls, lock screen controls, and headset/media-button
    play-pause behavior.
12. Record the emulator or device result in `docs/ACCEPTANCE/PHASE_3_ACCEPTANCE.md`.

Phase 3 acceptance must not be marked complete without an actual emulator or
device playback run. Offline cache, recommendation, AI Assistant, playback
history, feedback events, production deployment hardening, and new backend
endpoints remain outside this phase.

## Phase 4 Android Offline Cache Smoke Test

Use this flow to verify the completed Phase 4 Android offline cache against the
local backend while preserving the Phase 3 Media3 playback architecture:

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply database migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial local user. If the database already has a user,
   keep using that account instead of creating another one.
4. Upload a supported audio file through the Web console if a ready track does
   not already exist.
5. Process pending media jobs until at least one track is `ready`:

   ```powershell
   docker compose run --rm worker
   ```

   Or keep the worker running:

   ```powershell
   docker compose up -d worker-loop
   ```

6. Open the Android project in Android Studio or install a debug build on an
   emulator or device.
7. Configure the Android API base URL for the target environment. The stock
   emulator host-loopback URL is usually `http://10.0.2.2:8000`.
8. Log in with the local user and confirm Library loads tracks from
   `GET /api/tracks`.
9. Open a `ready` track and manually cache it from Track Detail.
10. Confirm caching progress, success state, and retry/error handling if the
    download is interrupted.
11. Confirm Library and Track Detail show the cached state.
12. Open Cached Tracks and confirm the cached track appears from local Room
    data.
13. Disable network access or stop the backend API, then confirm Cached Tracks
    remains reachable.
14. Play the cached track offline and confirm Now Playing identifies the cached
    playback source.
15. Confirm background playback, notification controls, lock screen controls,
    and headset/media-button play-pause behavior still work for cached
    playback.
16. While offline, pause, resume, seek, stop before completion, and complete
    playback where practical to create queued playback events.
17. Restore network access and confirm queued playback events sync through
    `POST /api/playback-events`.
18. Delete one selected cached track from Track Detail or Cached Tracks and
    confirm the app asks for confirmation first.
19. Refresh Library or fetch `GET /api/tracks/{track_id}` to confirm deleting
    the local cache did not delete the server track.
20. Record the emulator or device result in `docs/ACCEPTANCE/PHASE_4_ACCEPTANCE.md`.

Phase 4 acceptance must not be marked complete without an actual emulator or
device offline playback run. Recommendation, AI Assistant, Web new features,
production deployment hardening, automatic full-library offline sync, complex
download queue management, and background caching of the entire library remain
outside this phase.

## Phase 5 Recommendation V1 Smoke Test

Use this flow to verify the completed Phase 5 structured recommendation loop
against the local backend while preserving the Phase 3 Media3 playback
architecture and Phase 4 cached playback source selection:

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply database migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial local user. If the database already has a user,
   keep using that account instead of creating another one.
4. Upload and process enough audio files until at least three tracks are
   `ready`:

   ```powershell
   docker compose run --rm worker
   ```

   Or keep the worker running:

   ```powershell
   docker compose up -d worker-loop
   ```

5. In the Web console, create or reuse tags in the supported groups:
   `scene`, `type`, and `feature`.
6. Assign those tags to at least three ready tracks.
7. Use the feedback and recommendation API smoke tests in
   `docs/API_MANUAL_TESTING.md` to verify `POST /api/feedback-events` and
   `POST /api/recommendations`.
8. From `web/`, run the Web app and open `/recommendations` after login:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

9. Select structured tags, request recommendations, send feedback, and confirm
   existing Library, Upload, Tags, Track Detail, and Web playback still work.
10. Open the Android app on an emulator or device, configure the local backend
    URL, log in, and open Recommendation Home.
11. Select structured tags, request recommendations, confirm primary result and
    alternatives, and select a recommendation to hand off to the existing Now
    Playing flow.
12. Cache one recommended ready track through the existing Track Detail cache
    action, then confirm selecting that recommended track can use Phase 4
    cached playback source selection.
13. Send Recommendation V1 feedback actions from Android and manually request
    recommendations again to confirm subsequent results can change.
14. Record the automated and manual results in `docs/ACCEPTANCE/PHASE_5_ACCEPTANCE.md`.

Phase 5 acceptance must not be marked complete without actual Android and Web
manual structured recommendation verification. AI Assistant, natural-language
parsing, AI-generated reasons, production ML or training platforms, social
features, and deployment hardening remain outside this phase.

## Phase 6 AI Assistant V1 Smoke Test

Use this flow to verify the completed Phase 6 AI Assistant V1 loop against the
local backend while preserving Phase 5 rule-based ranking, Phase 3 Media3
playback, and Phase 4 cached playback source selection:

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply database migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial local user. If the database already has a user,
   keep using that account instead of creating another one.
4. Upload and process enough audio files until at least three tracks are
   `ready`, then assign structured tags in the `scene`, `type`, and `feature`
   groups.
5. Configure development-only AI provider values if testing provider-ok
   behavior. Never commit a real key, production secret, or bearer token.
6. Use the AI endpoint smoke tests in `docs/API_MANUAL_TESTING.md` to verify
   disabled/unconfigured provider behavior, `POST
   /api/ai/parse-listening-intent`, `POST /api/ai/recommend`, `POST
   /api/ai/tracks/{track_id}/suggest-tags`, Phase 5 ranking integrity, and tag
   suggestions that do not auto-create or auto-assign tags.
7. From `web/`, run the Web app and open the AI Assistant after login:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

8. Submit a natural-language request, confirm parsed structured context,
   primary recommendation and alternatives, existing feedback actions, and
   tag-suggestion confirmation behavior.
9. Confirm existing Library, Upload, Tags, Track Detail, structured
   Recommendation, and Web playback still work.
10. Open the Android app on an emulator or device, configure the local backend
    URL, log in, and open Recommendation Home.
11. Confirm structured controls still work, submit a natural-language request,
    confirm parsed context and results, and select a recommendation to hand off
    to existing Now Playing/Media3 playback.
12. Cache one recommended ready track through the existing manual Track Detail
    cache action, then confirm selecting that recommended track can use Phase 4
    cached playback source selection.
13. Confirm AI loading, unauthorized, offline, provider unavailable, backend
    error, and empty-result states are understandable.
14. Record the automated and manual results in `docs/ACCEPTANCE/PHASE_6_ACCEPTANCE.md`.

Phase 6 acceptance must not be marked complete without actual Web AI Assistant
verification and actual Android natural-language recommendation verification.
Production deployment hardening, embeddings, audio analysis, training
platforms, social features, automatic downloads, and playback rewrites remain
outside this phase.

## V1.1 Android Shortcut Smoke Test

Use this flow after installing a debug build on an emulator or device:

1. Long-press the Easy Music launcher icon and confirm shortcuts appear for
   Library, Recommendations, Cached Tracks, and Now Playing.
2. While signed out, open each shortcut and confirm the app lands on the
   existing Login flow.
3. Sign in, then open each shortcut again and confirm it routes to the named
   screen.
4. Open the Now Playing shortcut and confirm it does not auto-start playback;
   it should show the existing Now Playing state or its empty state.
5. Confirm normal Library navigation, cached playback selection, recommendation
   selection, and background playback behavior still work.

## Database Migrations

Backend migrations use Alembic with SQLAlchemy. The migration environment reads
`DATABASE_URL` through the same backend settings used by the FastAPI
application, so local runs should set `DATABASE_URL` instead of editing
`backend/alembic.ini`.

Local migration workflow:

1. Start PostgreSQL.
2. Change into `backend/`.
3. Set `DATABASE_URL` for the target database.
4. Run `.\.venv\Scripts\python.exe -m alembic current` to check connectivity.
5. Apply migrations with `.\.venv\Scripts\python.exe -m alembic upgrade head`.

## Production Host Directories

For production deployments the application containers run as a non-root user
(UID 1100 / GID 1100, defined in `backend/Dockerfile`).  Host directories used
as bind mounts must be writable by this user.

The recommended layout follows `docs/ARCHITECTURE.md`:

| Host path | Container path | Used by |
|---|---|---|
| `/srv/easy-music/media/originals` | `/app/media/originals` | api, worker |
| `/srv/easy-music/media/playback` | `/app/media/playback` | api, worker |
| `/srv/easy-music/media/covers` | `/app/media/covers` | api, worker |
| `/srv/easy-music/media/temp-videos` | `/app/media/temp-videos` | api, worker |
| `/srv/easy-music/postgres` | `/var/lib/postgresql/data` | postgres |
| `/srv/easy-music/backups` | (host only) | backup script |

All paths are configurable through `.env.production`.  See
`.env.production.example` for the variable names and defaults.

A convenience script at `deploy/setup-host.sh` creates the directories and
sets ownership.  Run it once before the first `docker compose up -d`:

```bash
sudo ./deploy/setup-host.sh
```

The script is non-destructive: it only runs `mkdir -p` and `chown`; it never
deletes existing data.

## Scope Notes

Phase 2 Web verification must not add Android behavior, Recommendation
behavior, AI Assistant behavior, playback history, feedback events, offline
cache behavior, or production deployment hardening. Those areas may remain
described in planning documents, but they are outside the current Web console
verification scope.
