# Easy Music — Production Deployment Guide

This guide takes you from a fresh Ubuntu server to a running Easy Music stack
accessible over HTTPS.  It assumes basic Linux and Docker familiarity.

All paths and domain names below are **placeholders** — replace them with your
own values.  Never commit real secrets to the repository.

---

## Prerequisites

- **Ubuntu 22.04 LTS** or **24.04 LTS** (other distributions work but
  commands may differ).
- **Docker Engine** and the **Docker Compose plugin** installed.
  Follow the official Docker documentation for your Ubuntu version.
- A **public domain name** whose DNS A record points to the server's public IP.
- Ports **80** and **443** reachable from the internet (firewall or security
  group must allow inbound TCP on both ports).
- **Git** installed (`sudo apt install git`).
- At least 2 GB of free disk space for images, media, and backups
  (4 TB recommended for a large library).

Verify Docker is ready:

```bash
docker --version
docker compose version
```

---

## Quick Start

If you already have `.env.production` configured and host directories created,
start the stack in two commands:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Then proceed to **Step 4 — First User** below.

---

## Step 1 — Clone And Configure

### 1.1 Clone the repository

```bash
git clone https://github.com/<your-username>/easy-music.git /srv/easy-music/repo
cd /srv/easy-music/repo
```

### 1.2 Create the production environment file

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill in every value marked **REQUIRED**:

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | A strong random password for the database. |
| `DATABASE_URL` | Update the password portion to match `POSTGRES_PASSWORD`. |
| `APP_SECRET_KEY` | Generate with `openssl rand -hex 32`.  Never reuse the dev key. |
| `CORS_ORIGINS` | Your HTTPS domain, e.g. `https://music.example.com`. |
| `CADDY_DOMAIN` | Your public domain, e.g. `music.example.com`. |
| `MEDIA_HOST_ORIGINALS` | Recommended: `/srv/easy-music/media/originals`. |
| `MEDIA_HOST_PLAYBACK` | Recommended: `/srv/easy-music/media/playback`. |
| `MEDIA_HOST_COVERS` | Recommended: `/srv/easy-music/media/covers`. |
| `POSTGRES_DATA_DIR` | Recommended: `/srv/easy-music/postgres`. |

Optional: set `LOG_FORMAT=json` and adjust `LOG_LEVEL` for production.
Enable AI features by setting `AI_ENABLED=true` and filling in the AI
provider details.  See the inline comments in `.env.production.example`.

---

## Step 2 — Host Directories

Run the convenience script to create directories and set ownership:

```bash
sudo ./deploy/setup-host.sh
```

The script creates (if they don't already exist):

| Directory | Purpose |
|---|---|
| `/srv/easy-music/media/originals` | Original uploaded files |
| `/srv/easy-music/media/playback` | Generated MP3 playback files |
| `/srv/easy-music/media/covers` | Cover images (future use) |
| `/srv/easy-music/postgres` | PostgreSQL data files |
| `/srv/easy-music/backups` | Database dump files |

Ownership is set to UID 1100 / GID 1100, matching the non-root user inside
the api and worker containers.  If you skip the script, create the directories
manually and ensure they are writable by UID 1100.

---

## Step 3 — Build And Start

### 3.1 Build the Web SPA

The production compose file mounts the built Web app as a read-only volume.
Build it once (and again after future Web code changes):

```bash
cd web
npm install
npm run build
cd ..
```

### 3.2 Build container images

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
```

### 3.3 Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 3.4 Verify the services are running

```bash
docker compose -f docker-compose.prod.yml ps
```

All four services (`postgres`, `api`, `worker`, `caddy`) should show
`Up` or `healthy`.  Check Caddy obtained a TLS certificate:

```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate
```

### 3.5 Quick smoke test

```bash
# Health endpoint (no auth required)
curl -s https://<your-domain>/health

# Should return: {"status":"healthy","database":"connected"}
```

---

## Step 4 — First User

The initial-user command refuses to run if any user already exists.  Create
the first user through the production API container:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
    exec api python -m app.auth.initial_user --username admin
```

The command reads the password from the `EASY_MUSIC_INITIAL_PASSWORD`
environment variable.  Set it once in the shell before running:

```bash
export EASY_MUSIC_INITIAL_PASSWORD="your-chosen-admin-password"
```

After the command succeeds, **unset the variable** so it does not linger
in your shell history or environment:

```bash
unset EASY_MUSIC_INITIAL_PASSWORD
```

The command prints a confirmation.  If it refuses because a user already
exists, keep using that existing account.

---

## Step 5 — Verify

### 5.1 Browser login

Open `https://<your-domain>` in a browser.  You should see the Easy Music
login page served over HTTPS with a valid certificate.

Log in with the credentials from Step 4.  Confirm the Library page loads
(empty is fine).

### 5.2 Upload a test track

1. From the Web console, open **Upload**.
2. Select a small MP3, FLAC, M4A, WAV, or OGG file.
3. Confirm the upload creates a track with `processing` status.
4. The worker picks up the job within a few seconds (polling interval is 5 s
   by default).
5. Refresh the track detail page until the status becomes `ready`.

### 5.3 Playback

On the track detail page or Library, use the built-in player to confirm
audio streams through the authenticated endpoint.

### 5.4 Verify backup flow

```bash
./deploy/backup-db.sh /srv/easy-music/backups
```

Confirm it writes a compressed dump file.  Restore instructions are in the
header of `deploy/backup-db.sh`.

---

## Ongoing Maintenance

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# A single service
docker compose -f docker-compose.prod.yml logs -f api
```

Logs are written to stdout and captured by Docker's `json-file` driver.
Rotation is configured at 10 MB per file, 3 files kept per service.

### Restart a service

```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart worker
```

### Apply updates

When new code is pushed to the repository:

```bash
cd /srv/easy-music/repo
git pull

# Rebuild the Web SPA
cd web && npm install && npm run build && cd ..

# Rebuild images and recreate containers
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Apply any new database migrations
docker compose -f docker-compose.prod.yml --env-file .env.production \
    exec api alembic upgrade head
```

### Database backups

Run the backup script manually:

```bash
./deploy/backup-db.sh /srv/easy-music/backups
```

Add a cron job for daily backups (example runs at 3:00 AM local time):

```
0 3 * * * /srv/easy-music/repo/deploy/backup-db.sh /srv/easy-music/backups
```

Clean up backups older than `BACKUP_RETENTION_DAYS` (30 days by default):

```
30 3 * * * find /srv/easy-music/backups -name 'easy_music_backup_*.sql.gz' -mtime +30 -delete
```

### Restore from a backup

**Warning: this overwrites the current database.  There is no undo.
Take a fresh backup first.**

```bash
# 1. Stop the api and worker so nothing writes during restore
docker compose -f docker-compose.prod.yml stop api worker

# 2. Restore
gunzip < /srv/easy-music/backups/easy_music_backup_YYYY-MM-DD_HHMMSS.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U easy_music -d easy_music

# 3. Start services again
docker compose -f docker-compose.prod.yml start api worker
```

---

## Troubleshooting

### "port is already allocated" on startup

Ports 80 or 443 are already in use.  Check for another web server:

```bash
sudo lsof -i :80
sudo lsof -i :443
```

Stop the conflicting service or change the host ports in
`docker-compose.prod.yml`.

### Caddy cannot obtain a certificate

- Confirm the domain's DNS A record points to the server's **public** IP.
- Confirm ports 80 and 443 are open to the internet (check the firewall or
  cloud security group).
- Check Caddy logs: `docker compose -f docker-compose.prod.yml logs caddy`.
- Let's Encrypt has rate limits: if you redeploy repeatedly while testing,
  you may hit them.  Wait or use the staging CA temporarily.

### "Permission denied" on media upload

The host media directories are not writable by the container user (UID 1100).
Re-run the setup script:

```bash
sudo ./deploy/setup-host.sh
```

Or fix ownership manually:

```bash
sudo chown -R 1100:1100 /srv/easy-music/media
```

### Database migration errors

After updating code, run migrations manually:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
    exec api alembic upgrade head
```

Check the current revision:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
    exec api alembic current
```

### Worker not processing jobs

Check worker logs:

```bash
docker compose -f docker-compose.prod.yml logs worker
```

Common causes: FFmpeg not found inside the image (should not happen with the
provided Dockerfile), or media directory not writable by UID 1100.

### Disk space running low

- Check disk usage: `df -h /srv/easy-music`
- Old Docker images: `docker image prune -a`
- Old backup files: manually remove files older than your retention window.
- Docker build cache: `docker builder prune`

### Health check shows "unhealthy"

If the API health check returns 503, the database may be unreachable:

```bash
curl -s https://<your-domain>/health
```

Check postgres logs and restart if needed:

```bash
docker compose -f docker-compose.prod.yml logs postgres
docker compose -f docker-compose.prod.yml restart postgres
```

---

## Related Documents

- `docs/DEVELOPMENT.md` — local development workflow.
- `docs/ARCHITECTURE.md` — system architecture and design decisions.
- `docs/API_MANUAL_TESTING.md` — API smoke tests.
- `deploy/backup-db.sh` — backup script (header contains restore instructions).
- `deploy/setup-host.sh` — host directory setup script.
- `.env.production.example` — all production environment variables documented.
