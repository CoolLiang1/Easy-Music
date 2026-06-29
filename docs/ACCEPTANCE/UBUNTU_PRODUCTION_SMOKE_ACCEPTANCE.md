# Ubuntu Production Smoke Acceptance

Date: 2026-06-29

This document records the first real Ubuntu production deployment smoke test.
It is intentionally separate from local Phase 7 acceptance because it requires
operator infrastructure: an Ubuntu host, a real domain, public DNS, open ports,
persistent storage, and HTTPS certificate issuance.

## Current Status

Status as of 2026-06-29:

- Repository deployment artifacts exist.
- Local/static Phase 7 deployment verification is accepted.
- A real Ubuntu/domain/HTTPS production smoke has not yet been recorded.
- This document is the place to record that first production result.

## Required Environment

- Ubuntu 22.04 LTS or 24.04 LTS host.
- Docker Engine and Docker Compose plugin.
- Public domain pointing to the server public IP.
- Inbound TCP 80 and 443 open.
- Persistent host storage under the deployment layout documented in
  `docs/DEPLOYMENT.md`.
- Production secrets stored only in `.env.production`, never committed.

## Smoke Checklist

- [ ] Repository checkout is on the intended deployment branch.
- [ ] `.env.production` is created from `.env.production.example` and all
  placeholders are replaced.
- [ ] `deploy/setup-host.sh` has prepared media, temp video, PostgreSQL, and
  backup directories with expected ownership.
- [ ] Production Compose config validates with the production env file.
- [ ] Web app production build exists before starting Caddy.
- [ ] Production services build and start.
- [ ] Alembic migrations are applied to the production database.
- [ ] Caddy obtains a valid HTTPS certificate for the configured domain.
- [ ] `/health` returns healthy status over HTTPS.
- [ ] Initial user creation succeeds, or an existing admin user is confirmed.
- [ ] Web login works over HTTPS.
- [ ] A small supported audio upload creates a processing track.
- [ ] Worker processes the track to ready.
- [ ] Browser playback works through the authenticated stream endpoint.
- [ ] Database backup script creates a backup file.
- [ ] Logs do not expose secrets or local operator paths beyond expected
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

Record the first production run here:

- Date:
- Server OS:
- Deployment branch/commit:
- Domain:
- Compose services status:
- Health check result:
- Upload/playback smoke result:
- Backup result:
- Issues found:
- Follow-up tasks:
