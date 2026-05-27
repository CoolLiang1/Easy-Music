# API Manual Testing

This document provides a repeatable local smoke test for the Phase 1 backend.
It verifies migrations, initial-user creation, login, upload validation, worker
processing, and authenticated audio streaming.

## Prerequisites

- Docker Desktop or a compatible Docker Compose environment.
- Python 3.12 or newer for local backend commands.
- Backend development dependencies installed in `backend/.venv`.
- `ffmpeg` and `ffprobe` available on `PATH` for real media processing.

Check local media tools:

```powershell
ffmpeg -version
ffprobe -version
```

From the repository root, start PostgreSQL:

```powershell
docker compose up -d postgres
```

From `backend/`, configure local command environment:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
$env:APP_SECRET_KEY = "development-secret-key-change-before-deploy"
```

Apply migrations:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create the initial user:

```powershell
$env:EASY_MUSIC_INITIAL_PASSWORD = "replace-with-a-local-password"
.\.venv\Scripts\python.exe -m app.auth.initial_user --username admin
```

If a user already exists, keep using that user instead of creating another one.

## Start The API

Run the API from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second PowerShell window, verify health:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/health"
```

## Login

```powershell
$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"replace-with-a-local-password"}'

$token = $login.access_token
$headers = @{ Authorization = "Bearer $token" }
```

Verify the current user:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/auth/me" `
  -Headers $headers
```

## Upload A Test Audio File

Create a tiny WAV file with FFmpeg:

```powershell
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" test-tone.wav
```

Upload it:

```powershell
$upload = curl.exe `
  -s `
  -X POST `
  -H "Authorization: Bearer $token" `
  -F "file=@test-tone.wav;type=audio/wav" `
  "http://127.0.0.1:8000/api/tracks/upload" | ConvertFrom-Json

$trackId = $upload.id
$upload
```

Expected result:

- HTTP response creates a track.
- `status` is `processing`.
- `original_file_path` is under the configured media root.
- `playback_file_path` is `null`.
- A pending processing job exists in the database.

## Run The Worker

From `backend/`, process one pending job:

```powershell
.\.venv\Scripts\python.exe -m app.worker
```

Or process the uploaded track directly:

```powershell
.\.venv\Scripts\python.exe -m app.worker --track-id $trackId
```

Run the local worker continuously:

```powershell
.\.venv\Scripts\python.exe -m app.worker --loop --poll-interval 5
```

Verify the track is ready:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/$trackId" `
  -Headers $headers
```

Expected result:

- `status` is `ready`.
- `duration_seconds`, `format`, or `bitrate` are populated when ffprobe can
  read them.
- `playback_file_path` points at a generated MP3 playback file.

## Stream A Ready Track

Download the full stream:

```powershell
curl.exe `
  -L `
  -H "Authorization: Bearer $token" `
  "http://127.0.0.1:8000/api/tracks/$trackId/stream" `
  --output playback.mp3
```

Verify a range request:

```powershell
curl.exe `
  -i `
  -H "Authorization: Bearer $token" `
  -H "Range: bytes=0-99" `
  "http://127.0.0.1:8000/api/tracks/$trackId/stream"
```

Expected result:

- Full stream returns `200 OK`.
- Range stream returns `206 Partial Content`.
- Response includes `Accept-Ranges: bytes`.
- Invalid or missing auth returns `401 Unauthorized`.

## Docker Compose API Flow

Start the Compose API stack from the repository root:

```powershell
docker compose up -d postgres api
```

Check FFmpeg and ffprobe inside Docker:

```powershell
docker compose exec api sh -c "ffmpeg -version && ffprobe -version"
```

Run migrations inside the API container:

```powershell
docker compose exec api alembic upgrade head
```

Alternatively, run migrations from the host against the Compose PostgreSQL port:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create the initial user from the host as shown above, then use the same login,
upload, and stream commands against `http://127.0.0.1:8000`.

Return to the repository root and process one pending job through Compose:

```powershell
cd ..
docker compose run --rm worker
```

Or run a continuously polling Compose worker:

```powershell
docker compose up -d worker-loop
```

## Full Upload To Stream Closure

1. Start PostgreSQL and API with `docker compose up -d postgres api`.
2. Run `docker compose exec api alembic upgrade head`.
3. Create or reuse the initial user.
4. Generate `test-tone.wav` with FFmpeg.
5. Log in and upload `test-tone.wav` to `POST /api/tracks/upload`.
6. Confirm the upload response has `status: processing`.
7. Run `docker compose run --rm worker`, or keep `worker-loop` running.
8. Fetch `GET /api/tracks/$trackId` until `status` is `ready`.
9. Call `GET /api/tracks/$trackId/stream` with the bearer token.

Expected result:

- Upload creates a pending processing job.
- Worker extracts metadata with ffprobe and writes playback MP3 with FFmpeg.
- Track becomes `ready`.
- Stream endpoint returns `200 OK` for full playback and `206 Partial Content`
  for Range requests.

## Phase 2 Web Browser Smoke Test

This browser flow verifies the completed Phase 2 Web management console against
the Phase 1 backend API. Android, Recommendation, AI Assistant, playback
history, feedback events, offline cache behavior, and production deployment
hardening are outside this smoke test.

From the repository root, start the services required by the Web console:

```powershell
docker compose up -d postgres api
docker compose exec api alembic upgrade head
```

Create or reuse the initial user. If a user already exists, keep using that
account.

From `web/`, start the development server:

```powershell
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open the Vite URL in a browser, usually `http://localhost:5173/`, then verify:

1. Log in with the local initial user.
2. Open `Library` and confirm the track list loads, including empty, processing,
   failed, or ready states depending on local data.
3. Open `Upload`, select an MP3, FLAC, M4A, WAV, or OGG file, and confirm the
   page shows the created track and initial processing status.
4. Run `docker compose run --rm worker` once, or run
   `docker compose up -d worker-loop`, to process pending tracks.
5. Return to `Library` or the uploaded track detail page and confirm the status
   becomes `ready` after refresh or polling.
6. Open the track detail page, edit metadata, save it, refresh, and confirm the
   saved values are still shown.
7. Open `Tags`, create a tag using only `scenario`, `state`, `type`, or
   `attribute`, rename it, change its group, and delete one explicit tag.
8. On the track detail page, assign and remove existing tags, save, refresh, and
   confirm the associations persist.
9. On a ready track, use the browser playback control from the library or detail
   page and confirm audio plays through the authenticated stream endpoint.

Expected Web result:

- Protected pages redirect unauthenticated users to login.
- Refreshing the browser preserves a valid session.
- Upload, processing refresh, metadata edits, tag CRUD, track tag assignment,
  and ready-track playback all work without adding any backend endpoints.
- Non-ready tracks remain visible but cannot be played.

## Automated Regression Check

Run the backend test suite from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Expected result for the current Phase 1 backend suite:

- All tests pass.
- Coverage includes Auth, Tags, Tracks, upload validation, storage path safety,
  FFmpeg wrappers, worker processing behavior, and streaming.
