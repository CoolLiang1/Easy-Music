# Development

This document describes the local development workflow for Easy Music.

Easy Music has completed Phase 1 backend development, the Phase 2 Web
management console, and the Phase 3 Android player. The FastAPI backend,
PostgreSQL migrations, media storage helpers, upload endpoint, authenticated
track/tag APIs, streaming endpoint, playback-event sync endpoint, and worker
flow exist. The Web app supports browser login, library viewing, upload,
processing refresh, metadata editing, tag management, track tag assignment, and
authenticated playback for ready tracks. The Android app supports authenticated
library/detail flows, Media3 playback, and Phase 4 manual offline cache
behavior.

Recommendation, AI Assistant, Web new features, production deployment
hardening, automatic full-library offline sync, complex download queue
management, and background caching of the entire library remain outside the
Phase 4 Android offline-cache scope.

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

Vite prints the local browser URL, usually `http://localhost:5173/`. The Web
console calls the backend API after login, so run PostgreSQL, migrations, the
API, and an initial local user before doing a full browser smoke test.

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

5. Open the Vite URL, usually `http://localhost:5173/`, and log in with the
   local user.
6. Visit `Upload`, upload an MP3, FLAC, M4A, WAV, or OGG file, and confirm the
   upload result creates a track with an initial processing status.
7. Run a worker from the repository root:

   ```powershell
   docker compose run --rm worker
   ```

   Or keep the worker running:

   ```powershell
   docker compose up -d worker-loop
   ```

8. Return to `Library` or the track detail page and use refresh, or wait for
   lightweight polling while the track is processing, until the status becomes
   `ready`.
9. Open the track detail page and edit title, artist, album, content type,
   source URL, liked state, cooldown date, and assigned tags as needed.
10. Visit `Tags`, create a tag in one of the supported groups (`scenario`,
    `state`, `type`, `attribute`), rename it, change its group, and delete one
    explicit tag.
11. For a ready track, use the playback control from the library row or track
    detail page and confirm audio loads through the authenticated stream
    endpoint.

Expected result:

- Login stores a browser session and protected pages load after refresh.
- Upload creates a processing track.
- Worker processing updates the track to `ready`.
- Metadata and tag edits persist after refresh.
- Ready tracks play in the browser.
- Non-ready tracks keep playback disabled.

## Automated Checks

Run all Phase 1 backend tests from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

The test suite covers:

- Auth login, invalid credentials, and current-user lookup.
- Authenticated tag create, list, update, delete, validation, and ownership.
- Authenticated track list, detail, update, delete, tag association, ownership,
  and streaming behavior.
- Authenticated playback-event bulk sync, validation, ownership, and duplicate
  retry behavior.
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

The Android backend base URL must stay configurable. Do not write production
hosts, usernames, passwords, or bearer tokens into source files.

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
12. Record the emulator or device result in `docs/PHASE_3_ACCEPTANCE.md`.

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
20. Record the emulator or device result in `docs/PHASE_4_ACCEPTANCE.md`.

Phase 4 acceptance must not be marked complete without an actual emulator or
device offline playback run. Recommendation, AI Assistant, Web new features,
production deployment hardening, automatic full-library offline sync, complex
download queue management, and background caching of the entire library remain
outside this phase.

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

## Scope Notes

Phase 2 Web verification must not add Android behavior, Recommendation
behavior, AI Assistant behavior, playback history, feedback events, offline
cache behavior, or production deployment hardening. Those areas may remain
described in planning documents, but they are outside the current Web console
verification scope.
