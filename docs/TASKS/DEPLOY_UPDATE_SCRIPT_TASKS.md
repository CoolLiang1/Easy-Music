# Deploy Update Script Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/DEPLOY_UPDATE_SCRIPT_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/DEPLOYMENT.md`
Pair: `docs/ACCEPTANCE/DEPLOY_UPDATE_SCRIPT_ACCEPTANCE.md`

## Goal

Make production updates repeatable from the repository instead of from an
untracked, host-only script, and make database restores work. The owner's real
server already differs from the guide (a host-specific compose override, a
manual-cert high port, a root-only env file, a build proxy, detached-commit
deploys); the repository should support that shape generically while host
values stay in the host's `.env.production`.

## Scope

In scope:

- `deploy/update.sh`: deploy the checked-out commit with backup, Web build,
  image build, migrations before the new API starts, health waits, and an
  HTTPS health check. It never runs `git`.
- Optional `DEPLOY_COMPOSE_OVERRIDE`, `DEPLOY_BUILD_USER`, and
  `DEPLOY_BUILD_PROXY` keys in `.env.production`.
- `deploy/backup-db.sh`: `--clean --if-exists` dumps, private file mode,
  optional `COMPOSE_OVERRIDE_FILE`, root-crontab guidance.
- `docs/DEPLOYMENT.md`: update flow, host override, backup scheduling, and a
  restore procedure that works for both old and new dumps.

Out of scope:

- Media file backup automation and backup retention.
- Certificate renewal automation.
- Changing the application, compose services, or the owner's host layout.
- Installing cron or editing `.env.production` on the owner's server (owner
  action with `sudo`).

## Dependencies And Contracts

- `docker-compose.prod.yml` service names and health checks stay unchanged.
- `.env.production` stays mode `600`; scripts read single keys and never source
  it.
- Existing manual compose commands in the guide remain valid.

## Implementation Tasks

- [x] Add `deploy/update.sh`.
- [x] Extend `deploy/backup-db.sh` (clean dumps, mode `600`, override file).
- [x] Add `DEPLOY_*` keys to `.env.production.example` and `docs/ENVIRONMENT.md`.
- [x] Rewrite the update, backup, and restore sections of `docs/DEPLOYMENT.md`.
- [x] Verify restore of a clean dump into an empty and a populated database.
- [ ] Run `deploy/update.sh` on the owner's server and record the result.

## Acceptance Criteria

- `sudo ./deploy/update.sh` on a production checkout backs up the database,
  applies migrations, recreates services, and prints `UPDATE_OK` only after a
  healthy HTTPS `/health` response.
- A dump from `deploy/backup-db.sh` restores into both an empty and an existing
  database without errors and with matching row counts.
- No host-specific domain, user, or path is committed.

## Verification Plan

- Automated: `bash -n` on both scripts; `pwsh -File scripts/check-docs.ps1`.
- Manual: restore drill in a throwaway PostgreSQL 16 container on the server;
  one real `sudo ./deploy/update.sh` run on the server.
- Environment/device requirements: Ubuntu host with Docker Compose v2 and the
  production stack.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [ ] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [ ] AGENTS.md stable rules

N/A reasons:

- PRD / architecture / specification: no product scope, API, data model, or
  module boundary change; deployment procedure only.
- Development and API testing guides: local workflow and API smoke flows are
  unchanged; environment and deployment guides were updated.
- AGENTS.md: no new agent invariant; the deployment guide owns the procedure.

## Progress Notes

- 2026-11-04: Implemented the update script, clean backups, override support,
  and restore procedure. Restore drill passed in a throwaway container; the
  first real run of `deploy/update.sh` on the server remains.
