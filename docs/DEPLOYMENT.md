# Deployment

This document describes the intended deployment direction for Easy Music.

Deployment is planned but not production-hardened yet. The repository includes
a Docker Compose backend stack for local integration: PostgreSQL, FastAPI API,
one-shot worker, optional loop worker, and persistent media volumes. Web,
Android, reverse proxy configuration, HTTPS, backups, and monitoring remain
future work.

## Direction

The intended deployment path is Docker Compose on an Ubuntu server with persistent storage.

The current Docker Compose skeleton reserves:

- PostgreSQL for application data.
- FastAPI API service for backend requests.
- Worker service for media processing and later background jobs.
- Persistent media storage for original uploads and generated playback MP3 files.

Caddy reverse proxy and HTTPS are planned for a later hardening phase.

## Docker Compose Backend Stack

`docker-compose.yml` defines:

- `postgres` using the official PostgreSQL image and a persistent `postgres_data` volume.
- `api` using the `./backend` build context and exposing local development port `8000`.
- `worker` using the same backend image for one-shot pending-job processing.
- `worker-loop` using the same backend image for continuous polling.
- `media_originals` and `media_playback` volumes mounted under `/app/media/originals` and `/app/media/playback`.

The backend image installs FFmpeg, which provides both `ffmpeg` and `ffprobe`,
and includes `alembic.ini` plus the `alembic/` migration directory so database
migrations can run from inside the container.

Build the backend services:

```powershell
docker compose build api worker
```

Start PostgreSQL and the API:

```powershell
docker compose up -d postgres api
```

Check media tools inside the API container:

```powershell
docker compose exec api sh -c "ffmpeg -version && ffprobe -version"
```

Apply migrations inside the API container:

```powershell
docker compose exec api alembic upgrade head
```

Run one pending worker job and exit:

```powershell
docker compose run --rm worker
```

Run the worker continuously:

```powershell
docker compose up -d worker-loop
```

The loop interval defaults to 5 seconds and can be changed with
`WORKER_POLL_INTERVAL_SECONDS`.

## Planned Storage

Deployment should preserve:

- Original uploaded audio files.
- Generated playback MP3 files.
- Future cover images.
- PostgreSQL data.

The storage layout should avoid mixing original files, generated playback files, and database state.

## Current Limitations

- Production HTTPS has not been configured yet.
- Caddy configuration has not been added yet.
- Backups, logging, health checks, and monitoring have not been added yet.
- Web and Android runtime code do not exist yet.
- The worker loop is intentionally simple polling for Phase 1; Redis, Celery,
  and distributed worker coordination are not included.

## Production Hardening Later

Future deployment hardening should cover:

- HTTPS through Caddy.
- Persistent volume layout.
- Database backup process.
- Upload limits.
- Log handling.
- Health checks.
- Clear separation between development defaults and production secrets.
