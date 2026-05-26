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

### Backend

The backend is planned as a FastAPI service with PostgreSQL, Alembic migrations, media storage, FFmpeg integration, authentication, track management, tag management, upload handling, and background worker support.

It is not implemented yet.

### Web

The web app is planned as a React/Vite management console for login, upload, library management, track editing, tag editing, recommendation testing, and browser playback.

It is not implemented yet.

### Android

The Android app is planned as a Kotlin, Jetpack Compose, and Media3 client for mobile playback, background playback, notification controls, lock screen controls, headset controls, manual cache, offline playback, and event sync.

It is not implemented yet.

### Deployment

Deployment is planned around Docker Compose, PostgreSQL, API, worker, persistent media storage, and later production hardening.

It is not implemented yet.

## Local Checks

At this stage, verification is documentation-focused:

- Confirm new documentation links resolve.
- Confirm wording does not claim unimplemented features already work.
- Confirm no backend, web, Android, or deployment business code was added early.

Future tasks will add technology-specific checks for backend, web, Android, migrations, Docker Compose, and deployment.
