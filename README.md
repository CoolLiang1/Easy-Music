# Easy Music

Language: [English](README.md) | [简体中文](README.zh-CN.md)

Easy Music is a self-hosted personal cloud music system for scenario-based
listening. It answers "what should I listen to right now?" from your own
library, using scene, type, and feature tags, listening history, and feedback
such as "tired of it" or "not today".

It is a private, single-owner project: a FastAPI backend with PostgreSQL and a
media-processing worker, a React/Vite Web console, and a Kotlin/Jetpack Compose
Android player. Current status and open work are in
[docs/ROADMAP.md](docs/ROADMAP.md).

## Features

- Authenticated personal library with silent session renewal on Web and
  Android.
- Upload of MP3, FLAC, M4A, WAV, OGG, and AAC; audio extraction from
  user-provided video; read-only import preview from configured server
  directories.
- Worker that extracts metadata and covers, records duplicate signals, and
  produces loudness-normalized MP3 playback files while keeping the originals.
- Track, tag, cover, playlist, and queue management in the Web console.
- Web playback, and Android Media3 playback with background, notification,
  lock-screen, and headset controls, manual offline cache, and offline
  playback-event sync.
- Rule-based recommendations with feedback, cooldown modes, `not_today`, and
  playlist signals.
- Optional AI through an OpenAI-compatible provider: natural-language
  listening requests, per-track tag suggestions, batch auto-tagging from
  your own tag catalogue, and reviewed title/artist clean-up for tracks named
  after messy file names. AI never chooses tracks. It is off unless configured.
- Production Docker Compose deployment behind Caddy HTTPS, with an update
  script and database backups.

## Repository Map

| Path | Purpose |
| --- | --- |
| `backend/` | FastAPI app, SQLAlchemy models, Alembic migrations, services, worker, tests. |
| `web/` | React/Vite Web console. |
| `android/` | Kotlin/Jetpack Compose Android app. |
| `deploy/` | Caddy config, host setup, update and backup scripts. |
| `docs/` | Product, architecture, development, deployment, and slice records. |
| `docker-compose.yml`, `docker-compose.prod.yml` | Local and production services. |
| `.env.example`, `.env.production.example` | Environment templates with placeholders only. |

## Quick Start

Prerequisites: Docker with Compose, Node.js 20.19+ or 22.12+, and, for
Android, Android Studio or the Android SDK. From the repository root in
PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres api
docker compose exec api alembic upgrade head
docker compose exec `
  -e EASY_MUSIC_INITIAL_PASSWORD="replace-with-a-local-password" `
  api python -m app.auth.initial_user --username admin
docker compose up -d worker-loop

cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open `http://127.0.0.1:8081/`, log in as `admin`, upload a short audio file,
and wait for it to become `ready`. The API is at `http://127.0.0.1:8000`, with
OpenAPI docs at `/docs`.

Host-side backend setup, Android builds, and checks are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Production deployment is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Documentation guide](docs/README.md): which document owns what.
- [Roadmap](docs/ROADMAP.md): status and open work.
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [API manual testing](docs/API_MANUAL_TESTING.md)
- [Agent guide](AGENTS.md)

## Security

- Only the example env files are committed. Keep `.env`, `.env.production`,
  domains, passwords, API keys, tokens, personal paths, media, and databases
  out of version control.
- Keep import roots explicit and outside the repository, home directories, and
  managed media storage.
- Do not expose PostgreSQL to the internet.

## License

No license file is included. Do not assume reuse rights beyond viewing the
repository.
