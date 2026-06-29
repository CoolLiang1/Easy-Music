# Easy Music

Language: [English](README.md) | [简体中文](README.zh-CN.md)

Easy Music is a self-hosted personal cloud music system for scenario-based
listening. It includes a FastAPI backend, PostgreSQL, a media-processing
worker, a React/Vite Web management console, and a Kotlin/Jetpack Compose
Android listening client.

The project is intended for a personal music library: upload or import tracks,
edit tags and metadata, play music from Web or Android, cache tracks on
Android, manage playlists and queues, and use rule-based recommendations with
optional AI-assisted tag suggestions.

## Status

Current status as of 2026-06-30:

- MVP Phase 0 through Phase 7 are implemented and locally accepted.
- V1.1 workflow improvements, duplicate detection, cover editing, advanced
  recommendation explanations, revived tracks, reports, and Android shortcuts
  are implemented and accepted.
- V2 import/video, playlists, client playback queues, Recommendation V2
  foundation, simplified tags, and AI Tag Suggestions V2 are implemented.
- The first real Ubuntu/domain/HTTPS production smoke test is recorded as
  passed in
  [docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md).
- The next planned product work is UI optimization across the existing Web and
  Android flows.

## Features

- Authenticated personal music library.
- Audio upload for MP3, FLAC, M4A, WAV, and OGG files.
- Optional user-provided video-to-audio extraction.
- Safe server-side import preview and confirmed import from configured roots.
- Background worker for metadata extraction, playback media generation, cover
  extraction, duplicate signals, and processing status updates.
- Track, tag, cover, playlist, and queue management.
- Web playback and Android Media3 playback with background controls.
- Android manual offline cache and playback-event sync.
- Rule-based recommendations with feedback, cooldown modes, `not_today`, and
  playlist scoring signals.
- AI Assistant V1 and AI tag suggestions through an OpenAI-compatible provider,
  disabled by default unless configured.
- Production Docker Compose deployment with Caddy HTTPS reverse proxy, host
  setup, health checks, and database backup helper.

## Project Entry Points

### Runtime URLs

Local development defaults:

| Surface | URL |
| --- | --- |
| Web console | `http://127.0.0.1:8081/` |
| Backend API | `http://127.0.0.1:8000/` |
| Health check | `http://127.0.0.1:8000/health` |
| FastAPI OpenAPI docs | `http://127.0.0.1:8000/docs` |

Production uses the HTTPS origin configured in `.env.production`, for example
`https://music.example.com` or a high-port origin such as
`https://music.example.com:25443` when the upstream network blocks inbound
80/443.

### Repository Map

| Path | Purpose |
| --- | --- |
| `backend/` | FastAPI app, SQLAlchemy models, Alembic migrations, auth, APIs, services, worker, tests. |
| `web/` | React/Vite Web management console. |
| `android/` | Kotlin/Jetpack Compose Android app. |
| `deploy/` | Caddy config, host setup script, database backup script. |
| `docs/` | Product, architecture, workflow, deployment, task, and acceptance docs. |
| `docker-compose.yml` | Local development services. |
| `docker-compose.prod.yml` | Production services. |
| `.env.example` | Development-safe environment reference. |
| `.env.production.example` | Production environment template with placeholders only. |

## Quick Start: Local Development

Prerequisites:

- Docker Engine with the Docker Compose plugin.
- Python 3.12 for backend host-side tests and commands.
- Node.js 20.19+ or 22.12+ for the Web app.
- FFmpeg and ffprobe for local host-side media processing.
- Android Studio or Android SDK platform tools for Android development.

Start the backend stack from the repository root:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres api
docker compose exec api alembic upgrade head
docker compose exec `
  -e EASY_MUSIC_INITIAL_PASSWORD="replace-with-a-local-password" `
  api python -m app.auth.initial_user --username admin
docker compose up -d worker-loop
```

If an initial user already exists, keep using that account. The initial-user
command is intentionally single-use and refuses to create another user.

Start the Web console:

```powershell
cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open `http://127.0.0.1:8081/`, log in with the local admin account, upload a
small supported audio file, and wait for the worker to move it from
`processing` to `ready`.

## Backend Development

Host-side backend setup from `backend/`:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run one pending worker job:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.worker
```

Run the worker continuously:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.worker --loop --poll-interval 5
```

Backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

## Web Development

```powershell
cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Useful checks:

```powershell
cd web
npm run typecheck
npm run build
```

There is no `npm run lint` script configured at this time.

## Android Development and Use

Build and test the Android app:

```powershell
cd android
.\gradlew.bat build
.\gradlew.bat test
```

The default Android API base URL is `http://10.0.2.2:8000`, which is suitable
for an Android emulator talking to a backend on the development machine.

For a connected physical device using a local backend, either use `adb reverse`
or build a package with a reachable API origin:

```powershell
adb reverse tcp:8000 tcp:8000
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=http://127.0.0.1:8000
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

For production Android use, pass the deployed HTTPS origin at build time. Do
not commit real domains into source files:

```powershell
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=https://music.example.com
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

For a high-port HTTPS deployment:

```powershell
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=https://music.example.com:25443
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

After installation, open Easy Music on the device, log in with the same account
used by the server, browse the library, and play a `ready` track.

## Production Deployment Summary

The full production guide is
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Use this README section only as a
command overview.

Production rules:

- Never commit `.env.production`.
- Never commit real domains, passwords, API keys, bearer tokens, or private
  host paths.
- Build the Web app with `VITE_API_BASE_URL` set to the public HTTPS origin.
- For Android production APKs, pass the public API origin through
  `-PeasyMusicApiBaseUrl=...`.
- Use DNS-validated certificates and `deploy/Caddyfile.manual-cert` when
  inbound 80/443 are blocked and a high HTTPS port is required.

Typical Ubuntu deployment flow:

```bash
cd /srv/easy-music/repo
if [ ! -f .env.production ]; then cp .env.production.example .env.production; fi
nano .env.production

chmod +x deploy/setup-host.sh deploy/backup-db.sh
sudo ./deploy/setup-host.sh

cd web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..

docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl -sS https://music.example.com/health
```

Create the first production user only once:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -e EASY_MUSIC_INITIAL_PASSWORD='your-admin-password-at-least-12-chars' \
  api python -m app.auth.initial_user --username admin
```

For a non-standard HTTPS port, configure `.env.production` with the matching
origin and rebuild Web:

```env
CORS_ORIGINS=https://music.example.com:25443
VITE_API_BASE_URL=https://music.example.com:25443
CADDY_DOMAIN=music.example.com
CADDY_HTTPS_PORT=25443
CADDYFILE_PATH=./deploy/Caddyfile.manual-cert
CADDY_CERT_DIR=/srv/easy-music/caddy-certs
```

## Operations Commands

Run production commands from the repository root on the server:

```bash
cd /srv/easy-music/repo
```

Service status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Follow all logs or one service:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 worker
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 caddy
```

Restart services:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production restart api
docker compose -f docker-compose.prod.yml --env-file .env.production restart worker
docker compose -f docker-compose.prod.yml --env-file .env.production restart caddy
```

Apply migrations:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
```

Back up the database:

```bash
./deploy/backup-db.sh /srv/easy-music/backups
ls -lh /srv/easy-music/backups
```

Update a production deployment:

```bash
cd /srv/easy-music/repo
./deploy/backup-db.sh /srv/easy-music/backups
git pull --ff-only origin main

cd web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..

docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

If you deploy from `develop` for pre-production, replace `main` with `develop`
in the pull command.

Health and disk checks:

```bash
curl -sS https://music.example.com/health
df -h /srv/easy-music
du -sh /srv/easy-music/media /srv/easy-music/postgres /srv/easy-music/backups
```

## Verification

Recommended checks before opening a pull request or deploying:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

```powershell
cd web
npm run typecheck
npm run build
```

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat build
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
```

Choose focused checks based on the files changed. Deployment changes should
also review `.env.production.example`, `docker-compose.prod.yml`, Caddy config,
host setup, backup scripts, and `docs/DEPLOYMENT.md`.

## Documentation

Start here:

- [Product Requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Development Workflow](docs/DEVELOPMENT.md)
- [Environment Variables](docs/ENVIRONMENT.md)
- [Production Deployment](docs/DEPLOYMENT.md)
- [API Manual Testing](docs/API_MANUAL_TESTING.md)
- [Git Workflow](docs/GIT_WORKFLOW.md)
- [Ubuntu Production Smoke Acceptance](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md)
- [Next UI Optimization Tasks](docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md)

Historical acceptance records live under `docs/ACCEPTANCE/`, and task records
live under `docs/TASKS/`.

## Security and Secrets

- Commit only example environment files.
- Keep `.env`, `.env.production`, production domains, passwords, API keys,
  bearer tokens, personal paths, media libraries, build outputs, dependency
  directories, and database files out of version control.
- Leave AI features disabled until provider credentials are intentionally
  configured.
- Keep import roots explicit, dedicated, and outside the repository, user home
  directories, and managed media storage.
- Do not expose PostgreSQL directly to the public internet in production.

## License

No license file is currently included. Until one is added, do not assume public
reuse rights beyond viewing the repository.
