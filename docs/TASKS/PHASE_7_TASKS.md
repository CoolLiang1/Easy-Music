# Phase 7 Deployment Hardening Tasks

This document splits Phase 7 into executable Deployment Hardening tasks.
Phase 7 starts from the accepted Phase 6 AI Assistant V1 backend, Web, and
Android flows.

Phase 7 hardens the project for production deployment on an Ubuntu server. It
adds HTTPS through Caddy, a production Docker Compose file, persistent storage
layout, database backups, structured logging, health checks, and a deployment
guide. It must not change any business logic, playback behavior, recommendation
ranking, AI parsing, offline cache behavior, or client-side UI.

## Current Inputs Available Before Phase 7

Accepted Phase 6 artifacts available before Phase 7:

- Backend FastAPI application with auth, tracks, tags, uploads, media
  processing, streaming, playback events, feedback events, structured
  recommendation, AI intent parsing, AI recommendation composition, and AI tag
  suggestions.
- PostgreSQL database with Alembic migrations.
- Worker service for background media processing.
- Web React/Vite SPA (builds to `web/dist/`).
- Android app with Media3 playback, Phase 4 offline cache, and Phase 5/6
  recommendation flows.
- Development `docker-compose.yml` with `postgres`, `api`, `worker`, and
  `worker-loop` services.
- Backend `Dockerfile` (Python 3.12-slim, FFmpeg, uvicorn).
- `.env.example` with development-only placeholder values.
- Backend `/health` endpoint returning `{"status": "healthy"}`.
- Backend CORS middleware driven by `CORS_ORIGINS` env var.

What Phase 7 must NOT change:

- Phase 3 Android Media3 playback, MediaSession, or Now Playing.
- Phase 4 Android manual offline cache or cached playback source selection.
- Phase 5 rule-based recommendation ranking or feedback processing.
- Phase 6 AI intent parsing, tag suggestions, recommendation composition, or
  AI provider abstraction.
- Upload, transcode, worker media-processing pipeline.
- Web UI components, pages, or routes.
- Android UI components, screens, or navigation.
- Database schema or migration logic (Phase 7 may add no new models or
  migration revisions).

## Phase 7 Scope

In scope:

- Backend production health check that verifies database connectivity.
- Production environment configuration and secrets management.
- Production Docker Compose file with Caddy, API, worker, Web, and PostgreSQL
  services.
- Caddy reverse proxy configuration with automatic HTTPS (Let's Encrypt).
- Host persistent storage directory layout and volume-mount design.
- Database backup script using `pg_dump`.
- Backend structured-logging configuration for production.
- Production deployment guide covering Ubuntu server prerequisites, DNS,
  first-run setup, and ongoing maintenance.
- Phase 7 automated verification and acceptance documentation.

Out of scope:

- Rewriting Phase 3 Android Media3 playback, MediaSession, or Now Playing.
- Rewriting Phase 4 Android cached playback source selection.
- Rewriting Phase 5 rule-based recommendation ranking.
- Rewriting Phase 6 AI provider abstraction or AI endpoints.
- Multi-user support, social features, public discovery, or sharing.
- Embeddings, audio feature analysis, BPM detection, vocal detection, or ML
  platforms.
- Automatic Bilibili download or automatic video-to-audio extraction.
- CI/CD pipelines, container registries, Kubernetes, or multi-host
  orchestration.
- Monitoring dashboards (Grafana, Prometheus), alerting, or uptime tracking.
- Changing the Web or Android UI.

## Task 7.1: Backend Production Health Check

### Goal

Enhance the existing `/health` endpoint so it verifies database connectivity,
making it useful for Docker health checks and basic production monitoring
without changing any business logic.

### Directories

- `backend/app/api/`
- `backend/app/db/`
- `backend/tests/`

### Main Files

- `backend/app/api/router.py`
- `backend/app/db/session.py`
- New backend tests under `backend/tests/`

### Dependencies

- Existing `/health` endpoint in `backend/app/api/router.py`.
- Existing database session factory in `backend/app/db/session.py`.
- Existing backend test setup.

### Acceptance Criteria

- `GET /health` returns `{"status": "healthy", "database": "connected"}` when
  the database is reachable.
- `GET /health` returns `{"status": "unhealthy", "database": "disconnected"}`
  with HTTP 503 when the database is unreachable.
- The health check does not leak database credentials, connection strings, or
  internal hostnames in the response body.
- The endpoint remains unauthenticated (no bearer token required).
- The endpoint does not depend on any Phase 5 or Phase 6 service.
- Existing backend tests pass.
- New backend tests cover healthy response and database-disconnected response.

### Do Not

- Do not add authentication to the health endpoint.
- Do not add checks for worker, media storage, AI provider, or external
  services — database only.
- Do not change the response format of any existing API endpoint.
- Do not add new dependencies to `pyproject.toml`.
- Do not modify the database schema or add migrations.
- Do not implement a full monitoring framework, metrics export, or alerting.

## Task 7.2: Production Environment And Secrets Configuration

### Goal

Create a production environment configuration template and document how to
manage secrets so a deployer can configure the stack without committing
real credentials.

### Directories

- Repository root
- `docs/`

### Main Files

- `.env.production.example` (new)
- `.env.example` (existing, may need documentation-only updates)
- `docs/DEVELOPMENT.md`

### Dependencies

- Existing `.env.example` and its documented variables.
- Existing `backend/app/core/config.py` settings fields.
- Existing `docker-compose.yml` env_file references.

### Acceptance Criteria

- `.env.production.example` lists every variable that must be set for
  production, with placeholder values only:
  - `POSTGRES_PASSWORD`
  - `DATABASE_URL`
  - `APP_SECRET_KEY`
  - `ACCESS_TOKEN_EXPIRE_MINUTES`
  - `CORS_ORIGINS`
  - `MEDIA_ROOT`
  - `MAX_UPLOAD_MB`
  - `AI_ENABLED`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`
    (all optional in production)
  - `CADDY_DOMAIN` or equivalent domain configuration
  - `BACKUP_RETENTION_DAYS` or equivalent backup config
- The file contains no default passwords, no real API keys, and no real
  hostnames.
- `.env.production.example` includes inline comments explaining each variable
  and noting which ones are required vs optional.
- `.env.example` is unchanged or only receives a comment noting the separate
  production template.
- `docs/DEVELOPMENT.md` receives a short note pointing to the production env
  file for deployment.
- The file documents that `APP_SECRET_KEY` must be a long random string
  generated by the deployer (e.g. `openssl rand -hex 32`).

### Do Not

- Do not write real passwords, API keys, hostnames, or secrets into any
  committed file.
- Do not change the Pydantic Settings model or environment variable names
  unless a variable name is genuinely broken for production use.
- Do not create a production `.env` file — template only.
- Do not add new backend code, new API endpoints, or new dependencies.
- Do not modify `docker-compose.yml`.

## Task 7.3: Production Docker Compose

### Goal

Create a production Docker Compose file that runs all services (Caddy, API,
worker, Web static files, PostgreSQL) with production-appropriate settings,
resource limits, health checks, and persistent volume mounts.

### Directories

- Repository root
- `deploy/`

### Main Files

- `docker-compose.prod.yml` (new, at repository root)
- `deploy/` directory (created if not present)
- `backend/Dockerfile` (may need a non-root `USER` addition)

### Dependencies

- Task 7.1 (health check returns useful status for Docker health checks).
- Task 7.2 (production environment variables documented).
- Existing `docker-compose.yml`.
- Existing `backend/Dockerfile`.

### Acceptance Criteria

- `docker-compose.prod.yml` defines services:
  - `postgres`: PostgreSQL 16-alpine, persistent named volume, no host port
    exposure unless explicitly configured.
  - `api`: backend image, depends on postgres, internal port 8000, production
    env_file referencing `.env.production`, health check using the `/health`
    endpoint, resource limits (cpu/memory reservations and caps).
  - `worker`: backend image, same env_file and depends_on as api, runs
    `python -m app.worker --loop`, health check and resource limits.
  - `web`: serves built Web SPA — either a thin nginx/alpine static server,
    or the Caddy service serves static files directly. If a separate web
    service is used, it must have health check and resource limits.
  - `caddy`: official Caddy image, depends on api and web, exposes ports 80
    and 443, mounts a Caddyfile or Caddy JSON config, mounts persistent
    `caddy_data` and `caddy_config` volumes for certificate storage.
- All services are on a single internal Docker network; only Caddy exposes
  ports to the host.
- Database port 5432 is not published to the host by default.
- Each service has a `restart: unless-stopped` policy.
- `docker compose -f docker-compose.prod.yml config` succeeds without errors.
- The backend Dockerfile is updated to run as a non-root user (e.g. `appuser`)
  with ownership of `/app/media` if it does not already do so. This change
  must not break the development `docker-compose.yml` flow.
- Resource limits use conservative defaults (e.g. api: 256M–512M memory,
  worker: 256M–512M memory, postgres: 256M–1G memory).

### Do Not

- Do not delete, rename, or restructure the existing development
  `docker-compose.yml`.
- Do not change the backend application code, API routes, or worker logic
  except for the non-root `USER` in the Dockerfile.
- Do not embed real hostnames, IPs, secrets, or certificate paths.
- Do not add Kubernetes manifests, Docker Swarm configs, or multi-host
  orchestration.
- Do not add automatic container updates (Watchtower or similar).
- Do not configure CI/CD deployment triggers.

## Task 7.4: Caddy Reverse Proxy And HTTPS Configuration

### Goal

Create a Caddy configuration that terminates HTTPS with automatic Let's
Encrypt certificates, proxies API requests to the backend, serves the Web SPA
static files, and applies reasonable security headers and upload size limits.

### Directories

- `deploy/`

### Main Files

- `deploy/Caddyfile` (new)
- `.env.production.example` (update with `CADDY_DOMAIN` if added in Task 7.2)

### Dependencies

- Task 7.2 (domain variable documented).
- Task 7.3 (Caddy service defined in production compose).
- Existing backend API route prefixes: `/api/`, `/health`.
- Existing Web SPA build output in `web/dist/`.

### Acceptance Criteria

- `deploy/Caddyfile` configures:
  - A site block for the production domain, using an environment variable
    or placeholder such as `{$CADDY_DOMAIN}` so deployers set the real domain.
  - Automatic TLS through Let's Encrypt (no self-signed or manual certs).
  - Reverse proxy from `/api/*` to the internal `api:8000` service.
  - Reverse proxy from `/health` to the internal `api:8000` service.
  - Static file serving for the Web SPA root (`/`) from the built
    `web/dist/` directory, with SPA fallback (try_files /index.html) for
    client-side routing.
  - Upload size limit for `/api/tracks/upload` (e.g. `request_body > 200MB`
    returns 413).
  - Security headers: `X-Content-Type-Options: nosniff`,
    `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`
    at minimum.
  - HTTP → HTTPS automatic redirect.
  - No sensitive headers from the backend leaked to clients (e.g.
    `Server` header stripped or replaced).
- The Caddyfile uses only documented Caddy directives; no custom plugins or
  external modules required beyond the standard Caddy image.
- `docker compose -f docker-compose.prod.yml config` references the Caddyfile
  correctly.
- Documentation in the Caddyfile comments explains each block.

### Do Not

- Do not hardcode a real domain name — use `{$CADDY_DOMAIN}` or a documented
  placeholder.
- Do not configure multiple domains, wildcard certs, or DNS challenges —
  single-domain HTTP-01 challenge is sufficient.
- Do not add IP allow/deny rules, basic auth at the proxy layer, or WAF
  configuration — the application layer handles auth.
- Do not configure Caddy for development use — the dev compose file uses
  direct host port access.
- Do not modify the Web Vite config or build output path.

## Task 7.5: Host Storage And Volume Layout

### Goal

Define the host directory structure for persistent media files and database
data, ensure the production Docker Compose mounts them correctly, and document
the host-side setup commands.

### Directories

- Repository root
- `deploy/`
- `docs/`

### Main Files

- `docker-compose.prod.yml` (update volume definitions)
- `deploy/setup-host.sh` (new, optional convenience script)
- `docs/DEVELOPMENT.md`

### Dependencies

- Task 7.3 (production Docker Compose with volume placeholders).
- Target host paths documented in `docs/ARCHITECTURE.md`:
  `/srv/easy-music/media/originals`, `/srv/easy-music/media/playback`,
  `/srv/easy-music/media/covers`, `/srv/easy-music/postgres`.

### Acceptance Criteria

- Production Docker Compose maps host paths to container paths:
  - `./media/originals` or `/srv/easy-music/media/originals` →
    `/app/media/originals` in api and worker containers.
  - `./media/playback` or `/srv/easy-music/media/playback` →
    `/app/media/playback` in api and worker containers.
  - `./media/covers` or `/srv/easy-music/media/covers` →
    `/app/media/covers` in api and worker containers.
  - A postgres data directory → `/var/lib/postgresql/data`.
  - Caddy data and config directories for certificate persistence.
- Paths are configurable through environment variables or a documented
  `.env.production` entry rather than being hardcoded in the compose file.
- `docs/DEVELOPMENT.md` or the deployment guide describes the required
  host directories and their ownership (`chown`, `chmod`) so the non-root
  container user can read/write media directories.
- If `deploy/setup-host.sh` is created, it must be non-destructive: it
  creates directories with `mkdir -p` and sets permissions, but never
  deletes existing data and never runs `rm -rf`.
- Volume paths in the production compose file are compatible with the
  ARCHITECTURE.md documented layout.

### Do Not

- Do not use Docker named volumes for media files in production — host bind
  mounts give the operator direct filesystem access.
- Do not hardcode absolute host paths in `docker-compose.prod.yml` — use
  `.env` variable substitution.
- Do not create a setup script that deletes or overwrites existing media or
  database files.
- Do not change the development `docker-compose.yml` volume strategy.
- Do not change the backend media-path resolution logic.

## Task 7.6: Database Backup Script

### Goal

Provide a simple, documented database backup mechanism using `pg_dump` that an
operator can run manually or schedule through cron.

### Directories

- `deploy/`

### Main Files

- `deploy/backup-db.sh` (new)
- `.env.production.example` (update with backup-related variables if needed)

### Dependencies

- Task 7.3 (production compose with PostgreSQL service named `postgres`).
- Task 7.5 (host directory layout for storing backups).

### Acceptance Criteria

- `deploy/backup-db.sh` is a standalone shell script that:
  - Accepts an optional output directory (defaults to a documented path like
    `./backups` or `/srv/easy-music/backups`).
  - Runs `pg_dump` inside the running `postgres` container using
    `docker compose -f docker-compose.prod.yml exec -T postgres`.
  - Writes a compressed, timestamped dump file named like
    `easy_music_backup_2026-05-30_120000.sql.gz`.
  - Exits with a non-zero code on failure.
  - Does NOT drop, recreate, or modify the source database.
- The script uses only the production compose file and the database env vars
  already available to the postgres container — it does not require a separate
  `.pgpass` file or hardcoded credentials.
- The script is readable and commented; a deployer who reads it can
  understand every step.
- `docs/TASKS/PHASE_7_TASKS.md` (this file) or the deployment guide documents:
  - How to run the backup script manually.
  - A cron example for daily backups (e.g. `0 3 * * *`).
  - How to restore from a backup (e.g. `gunzip < backup.sql.gz |
    docker compose -f docker-compose.prod.yml exec -T postgres psql`).
- The script does not manage retention — a separate documented cron line or
  `find` example in the deployment guide handles removing backups older than
  `BACKUP_RETENTION_DAYS`.

### Do Not

- Do not implement a backup rotation/deletion mechanism inside the script —
  document retention as a separate operator concern.
- Do not add backup support for media files — the backup script covers the
  database only. Media backup is a separate operator responsibility outside
  Phase 7.
- Do not add cloud upload (S3, rsync to remote) to the backup script — local
  filesystem backup only.
- Do not add backup verification or integrity checking beyond pg_dump's exit
  code.
- Do not create a restore script that drops tables without confirmation.

## Task 7.7: Backend Production Logging

### Goal

Add structured logging configuration to the backend so production logs are
machine-readable, include request context, and can be controlled through
environment variables without code changes.

### Directories

- `backend/app/core/`
- `backend/app/`
- `backend/tests/`
- `deploy/`

### Main Files

- `backend/app/core/logging.py` (new)
- `backend/app/main.py` (minor hook: configure logging on startup)
- `backend/app/core/config.py` (add `LOG_LEVEL` and `LOG_FORMAT` settings)
- `deploy/docker-compose.prod.yml` (update with logging driver config)
- New or updated backend tests under `backend/tests/`

### Dependencies

- Existing `backend/app/main.py` application factory.
- Existing `backend/app/core/config.py` settings model.
- Task 7.3 (production docker-compose for logging driver config).

### Acceptance Criteria

- Backend settings support `LOG_LEVEL` (default `"INFO"`) and `LOG_FORMAT`
  (values `"text"` or `"json"`, default `"text"` for dev compatibility).
- When `LOG_FORMAT=json`, log lines are valid JSON objects with at minimum
  `timestamp`, `level`, `logger`, and `message` fields.
- When `LOG_FORMAT=text`, log lines are human-readable (existing uvicorn
  style is acceptable).
- Application startup logs the configured log level and format once.
- The logging configuration does not break or suppress uvicorn access logs;
  uvicorn log level is aligned with the application log level.
- The production Docker Compose configures the `json-file` logging driver
  with `max-size` and `max-file` options for log rotation on all services.
- Existing backend tests pass with the new logging configuration.
- Logs never include `APP_SECRET_KEY`, `DATABASE_URL`, `AI_API_KEY`, or
  password fields.

### Do Not

- Do not send logs to an external service, log aggregator, or syslog —
  stdout/stderr through Docker is sufficient.
- Do not change log messages in existing business-logic modules — only
  configure the logging pipeline at the application level.
- Do not add request-id tracing, OpenTelemetry spans, or distributed tracing.
- Do not log request bodies or Authorization header values.
- Do not add log sampling, rate limiting, or dynamic log-level changes.
- Do not require additional Python packages beyond the standard library
  (`logging`, `json`).

## Task 7.8: Production Deployment Guide

### Goal

Write a step-by-step deployment guide that takes an operator from a fresh
Ubuntu server to a running Easy Music stack accessible over HTTPS.

### Directories

- `docs/`
- `deploy/`

### Main Files

- `docs/DEPLOYMENT.md` (new)
- `docs/DEVELOPMENT.md` (minor update: link to deployment guide)
- `deploy/` artifacts referenced by the guide

### Dependencies

- Tasks 7.1 through 7.7 (all deployment artifacts exist).
- Existing `docs/ARCHITECTURE.md` deployment section.
- Existing `docs/DEVELOPMENT.md`.

### Acceptance Criteria

- `docs/DEPLOYMENT.md` covers:
  - **Prerequisites**: Ubuntu 22.04 or 24.04 LTS, Docker Engine and Docker
    Compose plugin installed, a public domain name with DNS A record pointing
    to the server, ports 80 and 443 reachable from the internet.
  - **Quick start**: the minimum sequence to get the stack running.
  - **Step 1 — Clone and configure**: clone the repo, copy
    `.env.production.example` to `.env.production`, generate secrets, set
    the domain and all required variables.
  - **Step 2 — Host directories**: create `/srv/easy-music/media/originals`,
    `/srv/easy-music/media/playback`, `/srv/easy-music/media/covers`,
    `/srv/easy-music/postgres`, `/srv/easy-music/backups` with correct
    ownership and permissions.
  - **Step 3 — Build and start**: `docker compose -f docker-compose.prod.yml
    build`, `docker compose -f docker-compose.prod.yml up -d`, verify with
    `docker compose -f docker-compose.prod.yml ps` and `curl`.
  - **Step 4 — First user**: how to create the initial user through the
    production container.
  - **Step 5 — Verify**: HTTPS access, login, upload a test file, play back.
  - **Ongoing maintenance**: how to view logs, restart services, apply
    updates (pull new images, rebuild), run database backups, restore from
    a backup.
  - **Troubleshooting**: common issues — port conflicts, DNS not propagated,
    Let's Encrypt rate limits, disk space, permission errors.
- The guide uses only the production compose file and production env file.
- No real hostnames, IPs, passwords, or API keys appear in the guide.
- The guide assumes the deployer has basic Linux and Docker familiarity.
- `docs/DEVELOPMENT.md` links to `docs/DEPLOYMENT.md` for production
  deployment.

### Do Not

- Do not replace `docs/DEVELOPMENT.md` — the deployment guide is a separate
  document.
- Do not write a guide that depends on a specific cloud provider, VPS vendor,
  or hosting platform.
- Do not include CI/CD deployment, GitHub Actions, or automated deployment
  pipelines.
- Do not add screenshots, diagrams, or videos.
- Do not describe Android or Web app configuration beyond what is already in
  existing docs.

## Task 7.9: Phase 7 Automated Verification

### Goal

Run existing automated checks and validate production configuration artifacts
to confirm Phase 7 does not break existing behavior and that production
configs are syntactically valid.

### Directories

- `backend/`
- `web/`
- `android/`
- Repository root

### Main Files

- `backend/tests/`
- `web/`
- `android/`
- `docker-compose.prod.yml`
- `deploy/Caddyfile`
- `.env.production.example`

### Dependencies

- Tasks 7.1 through 7.8.
- Existing backend, Web, and Android test/build commands.

### Acceptance Criteria

- Backend tests pass: `.\.venv\Scripts\python.exe -m pytest` from `backend/`.
- Web typecheck passes: `npm run typecheck` from `web/`.
- Web build passes: `npm run build` from `web/`.
- Android tests pass: `.\gradlew.bat test` from `android/`.
- Android build passes: `.\gradlew.bat build` from `android/`.
- `docker compose -f docker-compose.prod.yml config` succeeds and produces
  a complete configuration without substitution errors.
- `docker compose -f docker-compose.yml config` still succeeds (dev compose
  unchanged).
- The Caddyfile passes `caddy validate` if a Caddy binary is available, or
  at minimum has been reviewed for correct syntax against the Caddy
  documentation.
- `deploy/backup-db.sh` passes a static analysis check (`shellcheck` if
  available, or manual syntax review).
- `.env.production.example` contains no real secrets (manual grep audit).
- No committed file contains a real password, API key, or production hostname
  (manual grep audit).

### Do Not

- Do not require a running production stack for verification — static checks
  only beyond the existing test suites.
- Do not add new test frameworks, linters, or CI configuration.
- Do not expand the scope of existing tests beyond their current coverage.
- Do not run the backup script against a real database during verification.

## Task 7.10: Phase 7 Acceptance Documentation

### Goal

Document and record the Phase 7 Deployment Hardening verification results.

### Directories

- `docs/`

### Main Files

- `docs/ACCEPTANCE/PHASE_7_ACCEPTANCE.md` (new)
- `docs/DEPLOYMENT.md`

### Dependencies

- Tasks 7.1 through 7.9.

### Acceptance Criteria

- `docs/ACCEPTANCE/PHASE_7_ACCEPTANCE.md` records:
  - Automated check results: backend tests, Web typecheck/build, Android
    test/build, production compose config validation.
  - Production configuration audit: Caddyfile review, backup script review,
    env file secret audit.
  - A note that a full production deployment smoke test (real server, real
    domain, real HTTPS cert issue) requires a target Ubuntu host and domain
    and is deferred to the operator's first deployment.
- Acceptance doc explicitly states:
  - Phase 7 does not change Phase 3–6 business logic, playback, caching,
    ranking, or AI behavior.
  - Production deployment artifacts are syntactic and config-only; they do
    not alter development workflows.
- The doc lists each Phase 7 task and its verification status.

### Do Not

- Do not mark Phase 7 accepted without running the automated checks listed in
  Task 7.9.
- Do not mark Phase 7 accepted without a manual review of the Caddyfile,
  backup script, and production compose file.
- Do not require a real Ubuntu server, real domain, or real TLS certificate
  to mark Phase 7 accepted — static validation is sufficient.
- Do not write real server addresses, hostnames, passwords, or API keys into
  the acceptance document.
- Do not expand Phase 7 into Phase 8 or V1.1 work.

## Phase 7 Completion Acceptance

Phase 7 is complete when:

1. Backend `/health` endpoint verifies database connectivity and returns
   appropriate HTTP status codes.
2. `.env.production.example` documents all required production variables
   without real secrets.
3. `docker-compose.prod.yml` defines a complete production stack with Caddy,
   API, worker, Web, and PostgreSQL services, health checks, resource limits,
   and restart policies.
4. `deploy/Caddyfile` configures HTTPS via Let's Encrypt, API reverse proxy,
   Web SPA static serving, upload size limits, and basic security headers.
5. Production Docker Compose mounts host directories for media files and
   database data as documented in ARCHITECTURE.md.
6. `deploy/backup-db.sh` provides a working `pg_dump` backup mechanism with
   documented cron and restore instructions.
7. Backend supports configurable structured (JSON) and text logging with
   environment-variable control.
8. `docs/DEPLOYMENT.md` provides a complete step-by-step production deployment
   guide.
9. All existing automated checks pass and production configuration artifacts
   are syntactically valid.
10. `docs/ACCEPTANCE/PHASE_7_ACCEPTANCE.md` records the verification results.

## General Codex Prompt For Each Phase 7 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
请执行 docs/TASKS/PHASE_7_TASKS.md 中的 Task 7.x: <任务标题>。

先阅读：
- docs/TASKS/PHASE_7_TASKS.md
- docs/TASKS/PHASE_6_TASKS.md
- docs/ACCEPTANCE/PHASE_6_ACCEPTANCE.md
- docs/DEVELOPMENT.md
- docs/ARCHITECTURE.md
- docs/API_MANUAL_TESTING.md
- 与本任务 Directories/Main Files 相关的现有 backend / deploy / web 代码

要求：
- 只完成当前 Task，不提前实现后续任务。
- Phase 7 是 Deployment Hardening，只添加生产部署配置和文档，不修改业务逻辑。
- 保持 Phase 3 Android Media3 播放器、MediaSession、Now Playing 兼容，不重写播放器。
- 保持 Phase 4 手动离线缓存和 cached playback source selection，不改变缓存逻辑。
- 保持 Phase 5 rule-based ranking，不改变推荐排序、反馈处理或评分计算。
- 保持 Phase 6 AI provider abstraction、intent parsing、tag suggestions、AI recommendation composition。
- 不写真实 API key、生产 secret、真实 bearer token、生产服务器 IP 或私有本地配置到代码或文档。
- 不使用批量删除或递归删除命令；需要删除文件时只能一次删除一个明确路径的文件。
- 完成后运行本 Task 相关的最小自动检查，并说明未能运行的检查。
- 完成后检查 diff。
- 不要自动 commit，除非用户明确要求。
```
