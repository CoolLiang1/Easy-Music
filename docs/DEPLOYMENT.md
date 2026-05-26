# Deployment

This document describes the intended deployment direction for Easy Music.

Deployment is planned but not implemented yet. The repository now includes a minimal Docker Compose skeleton, but backend runtime code, worker processing code, a web container, reverse proxy configuration, and production deployment scripts are not implemented at this stage.

## Direction

The intended deployment path is Docker Compose on an Ubuntu server with persistent storage.

The current Docker Compose skeleton reserves:

- PostgreSQL for application data.
- FastAPI API service for backend requests.
- Worker service for media processing and later background jobs.
- Persistent media storage for original uploads and generated playback MP3 files.

Caddy reverse proxy and HTTPS are planned for a later hardening phase.

## Docker Compose Skeleton

`docker-compose.yml` defines:

- `postgres` using the official PostgreSQL image and a persistent `postgres_data` volume.
- `api` using the future `./backend` build context and exposing local development port `8000`.
- `worker` using the same future `./backend` build context.
- `media_originals` and `media_playback` volumes mounted under `/app/media/originals` and `/app/media/playback`.

The API and worker commands point at the expected future backend entry points. They will not run until the backend project skeleton and worker module are added in later tasks.

## Planned Storage

Deployment should preserve:

- Original uploaded audio files.
- Generated playback MP3 files.
- Future cover images.
- PostgreSQL data.

The storage layout should avoid mixing original files, generated playback files, and database state.

## Current Limitations

- The Docker Compose file is a skeleton only.
- Production HTTPS has not been configured yet.
- Caddy configuration has not been added yet.
- Backups, logging, health checks, and monitoring have not been added yet.
- Backend, Web, Android, and worker runtime code do not exist yet.

## Production Hardening Later

Future deployment hardening should cover:

- HTTPS through Caddy.
- Persistent volume layout.
- Database backup process.
- Upload limits.
- Log handling.
- Health checks.
- Clear separation between development defaults and production secrets.
