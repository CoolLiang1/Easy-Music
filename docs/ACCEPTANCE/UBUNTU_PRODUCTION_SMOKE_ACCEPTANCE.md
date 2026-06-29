# Ubuntu Production Smoke Acceptance

Date: 2026-06-30

This document records the first real Ubuntu production deployment smoke test.
It is intentionally separate from local Phase 7 acceptance because it requires
operator infrastructure: an Ubuntu host, a real domain, public DNS, open ports,
persistent storage, and HTTPS certificate issuance.

## Current Status

Status as of 2026-06-30:

- Repository deployment artifacts exist.
- Local/static Phase 7 deployment verification is accepted.
- The first real Ubuntu production smoke has been recorded.
- The deployment used a DNS-validated certificate and a non-standard HTTPS
  port because the operator's upstream campus network blocked inbound 80/443.

## Required Environment

- Ubuntu 22.04 LTS or 24.04 LTS host.
- Docker Engine and Docker Compose plugin.
- Public domain pointing to the server public IP.
- Inbound TCP 80 and 443 open, or a documented high-port HTTPS deployment with
  DNS-validated operator-provided certificates.
- Persistent host storage under the deployment layout documented in
  `docs/DEPLOYMENT.md`.
- Production secrets stored only in `.env.production`, never committed.

## Smoke Checklist

- [x] Repository checkout is on the intended deployment branch.
- [x] `.env.production` is created from `.env.production.example` and all
  placeholders are replaced.
- [x] `deploy/setup-host.sh` has prepared media, temp video, PostgreSQL, and
  backup directories with expected ownership.
- [x] Production Compose config validates with the production env file.
- [x] Web app production build exists before starting Caddy, and was built with
  `VITE_API_BASE_URL` set to the public HTTPS origin.
- [x] Production services build and start.
- [x] Alembic migrations are applied to the production database.
- [x] Caddy obtains a valid HTTPS certificate for the configured domain.
- [x] If non-standard HTTPS is required, Caddy serves a DNS-validated
  operator-provided certificate on the documented public port.
- [x] `/health` returns healthy status over HTTPS.
- [x] Initial user creation succeeds, or an existing admin user is confirmed.
- [x] Web login works over HTTPS.
- [x] A small supported audio upload creates a processing track.
- [x] Worker processes the track to ready.
- [x] Browser playback works through the authenticated stream endpoint.
- [x] Database backup script creates a backup file.
- [x] Logs do not expose secrets or local operator paths beyond expected
  deployment paths.

## Optional Production Checks

- [ ] AI remains disabled cleanly when provider credentials are absent.
- [ ] AI tag suggestions work when AI provider credentials are intentionally
  configured.
- [ ] Optional Tavily search context works only when
  `AI_TAG_SEARCH_ENABLED=true` and a real key is configured.
- [ ] Import tools remain disabled when `IMPORT_ALLOWED_ROOTS` is empty.
- [ ] If import tools are enabled, roots are dedicated read-only mounts outside
  media storage, home directories, and the repository checkout.
- [ ] User-provided video upload and worker extraction work within configured
  size limits.

## Result Record

First production run:

- Date: 2026-06-30, Asia/Shanghai.
- Server OS: Ubuntu host, exact release not captured in this record.
- Deployment branch/commit: `develop`, including `94858ff` for manual
  certificate/high-port deployment support.
- Domain: redacted operator domain, served over non-standard HTTPS port 25443.
- Web build API origin: redacted HTTPS origin on port 25443.
- Certificate: issued with `acme.sh` using Aliyun DNS validation, then mounted
  into Caddy through `deploy/Caddyfile.manual-cert`.
- Compose services status: `api`, `postgres`, and `worker` healthy; `caddy` up
  and publishing host TCP 25443 to container TCP 443.
- Health check result: `https://<redacted-domain>:25443/health` returned
  `{"status":"healthy","database":"connected"}`.
- Upload/playback smoke result: admin login succeeded; small supported audio
  upload succeeded; track moved from `processing` to `ready`; browser playback
  succeeded.
- Backup result: `deploy/backup-db.sh /srv/easy-music/backups` created
  `easy_music_backup_2026-06-30_023623.sql.gz` with size 8.0K.
- Issues found: upstream campus network blocked inbound 80/443, so standard
  Caddy automatic HTTP-01/TLS-ALPN-01 certificate issuance could not complete;
  a high-port DNS-validated certificate deployment was used instead. During
  setup, an already initialized PostgreSQL data directory retained an older
  database password, requiring the database user password to be aligned with
  the final `.env.production`.
- Follow-up tasks: document certificate renewal expectations for the chosen
  DNS validation flow and decide whether high-port HTTPS remains the intended
  production access pattern.
