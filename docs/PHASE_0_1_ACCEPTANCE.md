# Phase 0 / Phase 1 Acceptance

This document records the Phase 0 and Phase 1 acceptance result after backend
runtime verification and the Phase 1 closing fixes.

## Acceptance Result

- Phase 0: passed.
- Phase 1: passed.

## Verified Items

- `pytest`: 49 passed.
- `docker compose config`: passed.
- Docker API `/health`: passed.
- Container `ffmpeg` and `ffprobe`: available.
- Container `alembic upgrade head`: available.
- Auth API: available.
- Tag CRUD API: available.
- Track CRUD API: available.
- Upload API: creates a `processing` track and a pending processing job.
- Worker one-shot mode: processes a real pending job to `ready`.
- Worker loop mode: can stay running and poll for pending jobs.
- Range stream: returns `206 Partial Content`.

## Notes To Know

- Windows host FFmpeg is not installed, but the Docker verification flow no
  longer depends on host FFmpeg.
- When the Docker PostgreSQL volume already contains the initial user, the
  initial-user command refuses to create a duplicate user as expected.

## Next Step

The project can enter Phase 2 / Phase 3 task breakdown.
