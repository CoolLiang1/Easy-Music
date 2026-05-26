# Development

This document describes the expected local development workflow for Easy Music.

The project is currently in Phase 0. Backend, Web, Android, and deployment code are planned but not yet implemented. Do not assume any local server, web app, Android project, Docker Compose stack, or automated test suite exists until the corresponding task creates it.

## Workflow

1. Start from the `develop` branch.
2. Work on one documented task at a time.
3. Keep changes inside the files and directories named by the current task.
4. Avoid creating implementation directories before their scoped task starts.
5. Inspect `git diff` before committing.
6. Commit completed tasks separately with a concise message.

## Planned Development Areas

The repository structure is planned before implementation directories are created. Do not create `backend/`, `web/`, `android/`, or `deploy/` until the task for that area starts.

Planned top-level directories:

- `backend/`: future FastAPI service, database migrations, backend tests, media-processing integration, and worker entry points.
- `web/`: future React/Vite management console source, browser UI tests, and web build configuration.
- `android/`: future Kotlin, Jetpack Compose, and Media3 Android client source and Android build configuration.
- `deploy/`: future deployment assets such as Docker Compose hardening, reverse proxy configuration, and host setup notes.
- `docs/`: project planning, architecture, development, environment, and deployment documentation.

### Backend

The backend is planned as a FastAPI service with PostgreSQL, Alembic migrations, media storage, FFmpeg integration, authentication, track management, tag management, upload handling, and background worker support.

It is not implemented yet.

High-level backend module boundaries are planned as:

- Auth: login, session/token handling, password hashing, and authenticated API access.
- Users: user profile and ownership boundaries, starting with the single-user version.
- Tracks: music metadata, playback file references, track status, and library records.
- Tags: user-managed tag taxonomy and track-tag relationships.
- Uploads: accepted audio uploads, validation, original file storage, and upload lifecycle state.
- Media processing: metadata extraction, playback MP3 generation, cover extraction, and FFmpeg integration.
- Worker: background job entry points for media processing and other asynchronous backend work.

### Web

The web app is planned as a React/Vite management console for login, upload, library management, track editing, tag editing, recommendation testing, and browser playback.

It is not implemented yet. Web UI implementation is excluded from Phase 0.

### Android

The Android app is planned as a Kotlin, Jetpack Compose, and Media3 client for mobile playback, background playback, notification controls, lock screen controls, headset controls, manual cache, offline playback, and event sync.

It is not implemented yet. Android app implementation is excluded from Phase 0.

### Recommendation And AI Assistant

Recommendation and AI Assistant behavior may appear in architecture notes as future product direction, but their implementation is excluded from Phase 0. Phase 0 should not add recommendation code, AI assistant code, provider integrations, prompts, or active runtime requirements for those areas.

### Deployment

Deployment is planned around Docker Compose, PostgreSQL, API, worker, persistent media storage, and later production hardening.

It is not implemented yet. Create `deploy/` only when a deployment task explicitly requires it.

## Local Checks

At this stage, verification is documentation-focused:

- Confirm new documentation links resolve.
- Confirm wording does not claim unimplemented features already work.
- Confirm no backend, web, Android, or deployment business code was added early.

Future tasks will add technology-specific checks for backend, web, Android, migrations, Docker Compose, and deployment.
