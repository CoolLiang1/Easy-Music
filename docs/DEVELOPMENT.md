# Development

This document describes the local development workflow for Easy Music.

Easy Music is currently in Phase 1 backend development. The FastAPI backend,
PostgreSQL migrations, media storage helpers, upload endpoint, authenticated
track/tag APIs, streaming endpoint, and one-track worker flow exist. Web,
Android, Recommendation, AI Assistant, and production deployment hardening are
outside Phase 1 backend verification.

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
- Upload validation, original-file storage, and processing-job creation.
- Media storage path generation and path traversal protection.
- FFmpeg/ffprobe argument construction and structured failures.
- Track processing success, rerun behavior, and failure handling.
- Worker job success, failure, and empty-queue behavior.

Manual API verification steps are documented in
`docs/API_MANUAL_TESTING.md`.

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

Phase 1 backend verification must not add Web tests, Android tests,
Recommendation behavior, AI Assistant behavior, or production deployment
hardening. Those areas may remain described in planning documents, but they are
not part of the current backend test and manual verification scope.
