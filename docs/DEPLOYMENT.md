# Deployment

This document describes the intended deployment direction for Easy Music.

Deployment is planned but not implemented yet. There is no active Docker Compose stack, backend container, worker container, web container, reverse proxy configuration, or production deployment script at this stage.

## Direction

The intended deployment path is Docker Compose on an Ubuntu server with persistent storage.

Planned services include:

- PostgreSQL for application data.
- FastAPI API service for backend requests.
- Worker service for media processing and later background jobs.
- Persistent media storage for original uploads and generated playback MP3 files.
- Caddy reverse proxy and HTTPS in a later hardening phase.

## Planned Storage

Deployment should preserve:

- Original uploaded audio files.
- Generated playback MP3 files.
- Future cover images.
- PostgreSQL data.

The storage layout should avoid mixing original files, generated playback files, and database state.

## Current Limitations

- Docker Compose has not been added yet.
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
