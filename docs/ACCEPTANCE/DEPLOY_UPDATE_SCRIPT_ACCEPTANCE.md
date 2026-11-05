# Deploy Update Script Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/DEPLOY_UPDATE_SCRIPT_TASKS.md`, `docs/ROADMAP.md`, `docs/DEPLOYMENT.md`
Pair: `docs/TASKS/DEPLOY_UPDATE_SCRIPT_TASKS.md`
Decision: Implemented

## Accepted Scope

- `deploy/update.sh` for the checked-out commit.
- Clean, private database dumps from `deploy/backup-db.sh`, with optional
  compose override support.
- Update, host override, backup scheduling, and restore procedures in
  `docs/DEPLOYMENT.md`.

## Environment

- Branch/commit: `fix/deploy-update-script` from `main` at `176d80b`.
- Date and timezone: 2026-11-04 (server clock 2026-11-05, UTC+8).
- Runtime: owner's server on Ubuntu 26.04.1 LTS, Docker Compose v5.5.0,
  PostgreSQL `postgres:16-alpine`; production stack at `a9d8e81`, schema
  `20261104_0014`, 57 tracks.
- Relevant configuration: production env file mode `600`, host compose
  override, manual certificate on a high HTTPS port. Values not recorded.

## Automated Evidence

- [x] Command: `bash -n deploy/update.sh` and `bash -n deploy/backup-db.sh`
  - Result: both passed.
- [x] Command: `pwsh -File scripts/check-docs.ps1`
  - Result: passed (see the final change summary for the run).

## Manual Evidence

- [x] Flow: restore drill in a throwaway `postgres:16-alpine` container on the
  server, using `pg_dump --clean --if-exists` of the production database
  (production database only read).
  - Expected: restore with `psql -v ON_ERROR_STOP=1` succeeds into an empty
    database and again over the populated database; counts match production.
  - Observed: both restores succeeded; tracks `57`, playback events `285`,
    Alembic `20261104_0014` matched production after each restore. The
    container was removed afterwards.
- [ ] Flow: `sudo ./deploy/update.sh` on the owner's server with the host
  override, build proxy, and backup directory configured in `.env.production`.
  - Expected: backup created, migrations at head, services healthy, HTTPS
    `/health` healthy, `UPDATE_OK`.
  - Observed: not run yet. The earlier host-only script it replaces deployed
    `a9d8e81` successfully with the same step order.

## Known Gaps

- The first real run of `deploy/update.sh` on the server is not recorded.
- Media backup and certificate renewal remain operator responsibilities.

## Acceptance Decision

Current decision: `Implemented`.

Promote to `Accepted` after the real server run above passes and is recorded.
