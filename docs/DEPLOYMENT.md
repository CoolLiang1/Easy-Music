# Easy Music Production Deployment Guide

This guide deploys Easy Music on a fresh Ubuntu server with Docker Compose and
HTTPS. Replace placeholder values such as `music.example.com` with your real
domain and never commit production secrets.

The repository has local/static deployment acceptance through Phase 7. The
first real Ubuntu/domain/HTTPS production smoke is still an operator-run
verification step. Record that result in
`docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md`.

## Deployment Readiness Summary

Before starting a production deployment, confirm:

- The target branch contains the latest migrations and deployment artifacts.
- `.env.production` exists only on the server and contains no placeholders.
- The domain resolves to the Ubuntu server public IP.
- Ports 80 and 443 are reachable from the internet.
- Host media, temp video, PostgreSQL, and backup directories have been created
  with `deploy/setup-host.sh`.
- The Web production build has been generated with `VITE_API_BASE_URL` set to
  the deployed HTTPS origin.
- AI and import features are either deliberately configured or left disabled by
  default.
- A backup plan exists before real media/library data is added.

## Prerequisites

- Ubuntu 22.04 LTS or 24.04 LTS.
- Docker Engine and the Docker Compose plugin installed.
- Git, curl, ca-certificates, openssl, and dnsutils installed.
- A public domain whose DNS A record points to the server public IP.
- Inbound TCP ports 80 and 443 open in the host firewall and cloud security
  group.
- At least 2 GB free disk space for a small test deployment. Use much more for
  a real music library.

Install basic tools:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates openssl dnsutils
```

Verify Docker:

```bash
docker --version
docker compose version
```

If Docker is missing, install it from the official Docker Ubuntu guide:

```text
https://docs.docker.com/engine/install/ubuntu/
```

## Step 1 - Clone the Repository

Production should normally deploy the `main` branch. Use `develop` only for a
temporary pre-production deployment.

```bash
sudo mkdir -p /srv/easy-music
sudo chown "$USER:$USER" /srv/easy-music

git clone -b main https://github.com/CoolLiang1/Easy-Music.git /srv/easy-music/repo
cd /srv/easy-music/repo
```

If the repository already exists:

```bash
cd /srv/easy-music/repo
git fetch origin
git switch main
git pull --ff-only origin main
```

Verify required deployment files:

```bash
test -f docker-compose.prod.yml
test -f .env.production.example
test -f deploy/setup-host.sh
test -f deploy/backup-db.sh
test -f deploy/Caddyfile
```

If `.env.production.example` is missing, the checkout is on the wrong branch or
is out of date:

```bash
git status -sb
git branch -a
git log --oneline -n 5
find . -maxdepth 3 -name ".env.production.example" -print
```

## Step 2 - Configure Production Environment

Create `.env.production` only if it does not already exist:

```bash
if [ -f .env.production ]; then
  echo ".env.production already exists; do not overwrite it."
else
  cp .env.production.example .env.production
fi
```

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -base64 36
```

Edit the file:

```bash
nano .env.production
```

Set these required values:

```env
POSTGRES_DB=easy_music
POSTGRES_USER=easy_music
POSTGRES_PASSWORD=replace-with-a-strong-database-password
DATABASE_URL=postgresql+psycopg://easy_music:replace-with-the-same-database-password@postgres:5432/easy_music

APP_SECRET_KEY=replace-with-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=https://music.example.com
CADDY_DOMAIN=music.example.com
VITE_API_BASE_URL=https://music.example.com
VITE_MAX_VIDEO_UPLOAD_MB=1024

MEDIA_HOST_ORIGINALS=/srv/easy-music/media/originals
MEDIA_HOST_PLAYBACK=/srv/easy-music/media/playback
MEDIA_HOST_COVERS=/srv/easy-music/media/covers
MEDIA_HOST_TEMP_VIDEOS=/srv/easy-music/media/temp-videos
POSTGRES_DATA_DIR=/srv/easy-music/postgres
BACKUP_DIR=/srv/easy-music/backups
MAX_UPLOAD_MB=200
CADDY_AUDIO_UPLOAD_LIMIT=200MB
MAX_VIDEO_UPLOAD_MB=1024
CADDY_VIDEO_UPLOAD_LIMIT=1024MB

LOG_LEVEL=INFO
LOG_FORMAT=text

AI_ENABLED=false
AI_PROVIDER=openai-compatible
AI_API_KEY=
AI_MODEL=
AI_BASE_URL=https://api.openai.com/v1
AI_TAG_SEARCH_ENABLED=false
AI_TAG_SEARCH_PROVIDER=tavily
AI_TAG_SEARCH_API_KEY=
AI_TAG_SEARCH_BASE_URL=https://api.tavily.com
AI_TAG_SEARCH_MAX_RESULTS=5
AI_TAG_SEARCH_CACHE_DAYS=30

# Disabled by default. If import tools are enabled later, use container-visible
# paths that are explicitly mounted read-only into api and worker containers.
IMPORT_ALLOWED_ROOTS=
IMPORT_SCAN_MAX_FILES=1000
IMPORT_SCAN_MAX_DEPTH=5
IMPORT_SCAN_MAX_FILE_MB=200
```

Rules:

- `CADDY_DOMAIN` is the bare domain, for example `music.example.com`.
- `CORS_ORIGINS` includes the scheme, for example `https://music.example.com`.
- `VITE_API_BASE_URL` also includes the scheme and must match the public HTTPS
  origin before running `npm run build`.
- `DATABASE_URL` must use the same password as `POSTGRES_PASSWORD`.
- Use `AI_ENABLED=false` for the first deployment unless AI credentials are
  ready.
- Leave `IMPORT_ALLOWED_ROOTS` empty unless you have created dedicated import
  directories and mounted them into the containers. Do not point it at `/`,
  `/home`, the repository checkout, or `/app/media`.
- Keep scan limits conservative for the first deployment. The scan endpoint is
  read-only and reports supported audio candidates plus skipped files; confirmed
  import remains a later V2 flow.
- Keep `MAX_UPLOAD_MB` compatible with `CADDY_AUDIO_UPLOAD_LIMIT` for normal
  audio uploads.
- Keep `MAX_VIDEO_UPLOAD_MB` compatible with `CADDY_VIDEO_UPLOAD_LIMIT` if
  enabling user-provided video upload. Uploaded videos are temporary extraction
  inputs, not library originals.

Check for unfinished placeholders before continuing:

```bash
grep -E 'change-me|replace-with|your-domain|example.com' .env.production \
  && echo "Fix placeholders before continuing"
```

If that command prints anything, edit `.env.production` again.

## Step 3 - Prepare Host Directories

Run the non-destructive setup script. It creates directories and sets ownership
for the app containers and PostgreSQL data directory.

```bash
chmod +x deploy/setup-host.sh
sudo ./deploy/setup-host.sh
```

Verify:

```bash
ls -ld /srv/easy-music/media/originals
ls -ld /srv/easy-music/media/playback
ls -ld /srv/easy-music/media/covers
ls -ld /srv/easy-music/media/temp-videos
ls -ld /srv/easy-music/postgres
ls -ld /srv/easy-music/backups
```

Expected ownership:

- Media directories: UID/GID `1100:1100`.
- PostgreSQL data directory: UID/GID `70:70`.
- Backup directory: the sudo-invoking operator user/group, so
  `deploy/backup-db.sh` can write compressed dumps from the host.

Optional import directories are not created by `deploy/setup-host.sh` and are
not enabled by default. If a later V2 import task is enabled in production,
create dedicated host directories such as `/srv/easy-music/imports/library-a`,
mount them read-only into both `api` and `worker`, and set
`IMPORT_ALLOWED_ROOTS` to the matching container paths such as
`/app/imports/library-a`. Keep those directories separate from
`/srv/easy-music/media`, the repository checkout, and user home roots.
Use `IMPORT_SCAN_MAX_FILES`, `IMPORT_SCAN_MAX_DEPTH`, and
`IMPORT_SCAN_MAX_FILE_MB` to keep read-only preview scans bounded.

The temporary video directory is created by `deploy/setup-host.sh` and mounted
read-write into both API and worker containers. It is reserved for user-provided
video extraction inputs and should stay separate from originals, playback, and
covers.

## Step 4 - Build the Web App

Install Node.js 20.19+ or 22.12+ and npm if missing. The Web app uses Vite 7,
which will fail on older Node releases commonly available from Ubuntu's default
APT repositories.

```bash
node --version
npm --version
```

If `node --version` is older than the required range, install a supported Node
release through your standard server package process or a Node version manager
before continuing.

Build the SPA:

```bash
cd /srv/easy-music/repo/web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..
test -f web/dist/index.html
```

## Step 5 - Build, Start, and Migrate

Always pass `--env-file .env.production` when using the production compose file.

Validate compose config:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
```

Build and start:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Apply database migrations:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api alembic upgrade head
```

Check status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

All services should be `Up` or `healthy`.

## Step 6 - Verify HTTPS and Health

Check Caddy logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 caddy
```

Check health:

```bash
curl -sS https://music.example.com/health
```

Expected response:

```json
{"status":"healthy","database":"connected"}
```

If HTTPS fails, verify DNS and firewall:

```bash
curl -4 ifconfig.me
dig +short music.example.com
sudo ufw status
```

The domain must resolve to the server public IP, and ports 80 and 443 must be
reachable from the internet.

## Step 7 - Create the First User

Run this only once. The command refuses to create a user if any user already
exists.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -e EASY_MUSIC_INITIAL_PASSWORD='your-admin-password-at-least-12-chars' \
  api python -m app.auth.initial_user --username admin
```

If the command says a user already exists, keep using that existing account.
Do not reset the database unless you intentionally want to lose data.

## Step 8 - Browser Smoke Test

Open:

```text
https://music.example.com
```

Verify:

1. Login with the admin account.
2. Open Library.
3. Upload a small MP3, FLAC, M4A, WAV, or OGG file.
4. Confirm the track appears with `processing` status.
5. Wait until the worker marks it `ready`.
6. Play the track in the browser.

If processing stalls:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 worker
```

## Step 9 - Back Up the Database

After the first successful deployment:

```bash
chmod +x deploy/backup-db.sh
./deploy/backup-db.sh /srv/easy-music/backups
ls -lh /srv/easy-music/backups
```

Optional daily backup cron:

```cron
0 3 * * * /srv/easy-music/repo/deploy/backup-db.sh /srv/easy-music/backups
```

The backup script creates files only. It does not delete old backups.

## Ongoing Maintenance

View logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
```

Restart services:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production restart api
docker compose -f docker-compose.prod.yml --env-file .env.production restart worker
```

Apply updates:

```bash
cd /srv/easy-music/repo
./deploy/backup-db.sh /srv/easy-music/backups

git fetch origin
git switch main
git pull --ff-only origin main

cd web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..

docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Restore from a backup only after taking a fresh backup and confirming you want
to overwrite current data:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop api worker

gunzip < /srv/easy-music/backups/easy_music_backup_YYYY-MM-DD_HHMMSS.sql.gz \
  | docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
    psql -U easy_music -d easy_music

docker compose -f docker-compose.prod.yml --env-file .env.production start api worker
```

## Troubleshooting

### Port is already allocated

```bash
sudo lsof -i :80
sudo lsof -i :443
```

Stop the conflicting service or change the published ports in
`docker-compose.prod.yml`.

### Caddy cannot obtain a certificate

Check DNS, firewall, and Caddy logs:

```bash
dig +short music.example.com
curl -4 ifconfig.me
sudo ufw status
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 caddy
```

### Permission denied on upload or processing

```bash
sudo ./deploy/setup-host.sh
docker compose -f docker-compose.prod.yml --env-file .env.production restart api worker
```

### Database migration errors

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 postgres
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 api
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic current
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
```

Common causes:

- `DATABASE_URL` password does not match `POSTGRES_PASSWORD`.
- `.env.production` still contains placeholders.
- PostgreSQL data directory permissions are wrong.

### Worker not processing jobs

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 worker
docker compose -f docker-compose.prod.yml --env-file .env.production restart worker
```

### Health check is unhealthy

```bash
curl -sS https://music.example.com/health
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 api
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 postgres
```

## Related Documents

- `docs/DEVELOPMENT.md` - local development workflow.
- `docs/ARCHITECTURE.md` - system architecture and design decisions.
- `docs/API_MANUAL_TESTING.md` - API smoke tests.
- `deploy/setup-host.sh` - host directory setup script.
- `deploy/backup-db.sh` - database backup script.
- `.env.production.example` - production environment variable template.
