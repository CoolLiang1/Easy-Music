# Phase 0 Development Tasks

## Execution Principles

- One Codex session should complete exactly one task.
- After each task is completed, run `git diff` and inspect the changes.
- After a task passes verification, commit it separately.
- Do not implement later tasks early.
- Do not expand the task scope.

## Task 1: Establish Repository Documentation Skeleton

### Goal

Create the minimal project documentation skeleton so backend, web, Android, deployment, and product documents have clear ownership boundaries.

### Directories

- Root directory
- `docs/`

### Main Files

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/DEPLOYMENT.md`

### Dependencies

- None.

### Acceptance Criteria

- Root README points to PRD, Architecture, Roadmap, Development, Environment, and Deployment documents.
- Documentation clearly explains that backend, web, Android, and deployment areas are planned but not yet implemented.
- Development docs describe the expected local development workflow at a high level.
- Environment docs describe configuration categories without real secrets.
- Deployment docs describe the intended Docker Compose direction without production hardening.

### Do Not

- Do not write backend, web, Android, or deployment business code.
- Do not initialize React, Vite, Android Gradle, or FastAPI.
- Do not delete or move existing documents.
- Do not promise that unimplemented features already work.

## Task 2: Define Repository Structure Plan

### Goal

Document the intended repository structure before creating implementation directories, so future work has a stable layout.

### Directories

- Root directory
- `docs/`

### Main Files

- `docs/DEVELOPMENT.md`
- `docs/ARCHITECTURE.md`

### Dependencies

- Task 1.

### Acceptance Criteria

- The planned roles of `backend/`, `web/`, `android/`, and `deploy/` are documented.
- The document states that these directories should be created only when their corresponding task starts.
- The backend module boundaries are described at a high level:
  - Auth
  - Users
  - Tracks
  - Tags
  - Uploads
  - Media processing
  - Worker
- The document clearly excludes Web UI, Android app, Recommendation, and AI Assistant implementation from Phase 0.

### Do Not

- Do not create implementation directories yet unless the task explicitly asks for it.
- Do not add placeholder source code.
- Do not design detailed APIs beyond what is already in Architecture.
- Do not add Recommendation or AI Assistant implementation details.

## Task 3: Define Environment Variables

### Goal

Create the initial environment variable contract for Phase 0 and Phase 1 backend, database, media storage, authentication, and FFmpeg usage.

### Directories

- Root directory
- `docs/`

### Main Files

- `.env.example`
- `docs/ENVIRONMENT.md`

### Dependencies

- Task 1.

### Acceptance Criteria

- `.env.example` contains development-safe placeholder values.
- Environment variables include:
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `DATABASE_URL`
  - `APP_SECRET_KEY`
  - `ACCESS_TOKEN_EXPIRE_MINUTES`
  - `MEDIA_ROOT`
  - `ORIGINALS_DIR`
  - `PLAYBACK_DIR`
  - `MAX_UPLOAD_MB`
  - `FFMPEG_PATH`
  - `FFPROBE_PATH`
  - `CORS_ORIGINS`
- `docs/ENVIRONMENT.md` explains each variable and whether it is required for development or deployment.
- No real passwords, tokens, private paths, or production secrets are included.

### Do Not

- Do not create `.env`.
- Do not hard-code machine-specific absolute paths.
- Do not introduce AI provider variables as active Phase 0 requirements.
- Do not implement config loading code.

## Task 4: Create Docker Compose Skeleton

### Goal

Add a minimal Docker Compose skeleton for PostgreSQL, API, Worker, and persistent media storage so the backend can later run in a deployable shape.

### Directories

- Root directory
- `docs/`

### Main Files

- `docker-compose.yml`
- `.env.example`
- `docs/DEPLOYMENT.md`

### Dependencies

- Task 3.

### Acceptance Criteria

- Compose defines at least:
  - `postgres`
  - `api`
  - `worker`
- PostgreSQL uses a persistent volume.
- API and Worker are wired to the same future backend build context.
- Media storage paths are reserved for originals and playback MP3 files.
- API exposes a local development port.
- Documentation explains that Caddy and production HTTPS are future deployment hardening work.

### Do Not

- Do not add Caddy production HTTPS configuration.
- Do not add a Web container.
- Do not implement backend application code.
- Do not implement worker processing logic.
- Do not delete or recreate volumes with destructive commands.

## Task 5: Initialize Backend Project Skeleton

### Goal

Create the minimal FastAPI backend project structure required for Phase 1 work, including dependency metadata and a health endpoint.

### Directories

- `backend/`
- `backend/app/`
- `backend/app/api/`
- `backend/app/core/`

### Main Files

- `backend/pyproject.toml`
- `backend/Dockerfile`
- `backend/.dockerignore`
- `backend/app/main.py`
- `backend/app/api/router.py`
- `backend/app/core/config.py`
- `backend/app/__init__.py`

### Dependencies

- Task 3.
- Task 4.

### Acceptance Criteria

- FastAPI application can start locally.
- `GET /health` returns a basic healthy response.
- Configuration is prepared to read from environment variables.
- Dockerfile can run the API app.
- Backend source layout is ready for auth, tracks, tags, uploads, media, and worker modules.

### Do Not

- Do not implement login.
- Do not implement upload.
- Do not implement database models.
- Do not implement Web or Android code.
- Do not add Recommendation or AI Assistant code.

## Task 6: Add Database Migration Setup

### Goal

Add PostgreSQL connection plumbing and Alembic migration infrastructure without implementing business models yet.

### Directories

- `backend/`
- `backend/app/db/`
- `backend/app/models/`
- `backend/alembic/`

### Main Files

- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/app/db/session.py`
- `backend/app/db/base.py`
- `backend/app/models/__init__.py`

### Dependencies

- Task 5.

### Acceptance Criteria

- Alembic reads the database URL from environment configuration.
- Backend has a reusable database session setup.
- Backend has a shared declarative model base.
- An empty or initial migration workflow can run against PostgreSQL.
- Documentation explains how to run migrations locally.

### Do Not

- Do not create all future tables at once.
- Do not bypass migrations by creating tables directly.
- Do not hard-code the database URL.
- Do not implement auth, tracks, tags, uploads, worker, Recommendation, or AI Assistant.
