#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# backup-db.sh - Easy Music database backup
# ---------------------------------------------------------------------------
#
# Dumps the production PostgreSQL database to a compressed, timestamped file
# using pg_dump inside the running postgres container. The script does NOT
# modify, drop, or recreate the source database. Dumps are written with
# pg_dump --clean --if-exists, so they contain DROP ... IF EXISTS statements
# that are used only when the dump is restored over an existing database.
#
# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
#   chmod +x deploy/backup-db.sh
#   ./deploy/backup-db.sh                        # writes to BACKUP_DIR default
#   ./deploy/backup-db.sh /mnt/backups           # writes to a custom directory
#
# Environment variables (optional):
#   BACKUP_DIR                 output directory (default /srv/easy-music/backups)
#   POSTGRES_DB                database name    (default easy_music)
#   POSTGRES_USER              database user    (default easy_music)
#   COMPOSE_FILE               path to production compose file
#   COMPOSE_OVERRIDE_FILE      optional host-specific compose file layered on top
#   ENV_FILE                   path to .env.production
#
# ---------------------------------------------------------------------------
# Cron example  (daily at 3:00 AM, in root's crontab: sudo crontab -e)
# ---------------------------------------------------------------------------
# .env.production is normally readable only by root, so schedule the backup
# as root:
#   0 3 * * * /srv/easy-music/repo/deploy/backup-db.sh /srv/easy-music/backups
#
# ---------------------------------------------------------------------------
# Restore  (MANUAL - review before running)
# ---------------------------------------------------------------------------
# Restoring overwrites the existing database. Follow "Restore a Database
# Backup" in docs/DEPLOYMENT.md. Dumps created before --clean was added have no
# DROP statements and must be restored into a recreated, empty database; the
# guide covers both cases.
#
#   WARNING: restoring overwrites data. There is no undo.
#            Take a fresh backup before restoring.

set -euo pipefail

# ------------------------------------------------------------------
# Resolve paths
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.production}"
COMPOSE_OVERRIDE_FILE="${COMPOSE_OVERRIDE_FILE:-}"

# ------------------------------------------------------------------
# Pre-flight checks
# ------------------------------------------------------------------
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "[backup-db] ERROR: compose file not found: ${COMPOSE_FILE}" >&2
    echo "[backup-db] Set COMPOSE_FILE to the path of docker-compose.prod.yml." >&2
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "[backup-db] ERROR: env file not found: ${ENV_FILE}" >&2
    echo "[backup-db] Set ENV_FILE to the path of .env.production." >&2
    exit 1
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE")
if [ -n "$COMPOSE_OVERRIDE_FILE" ]; then
    if [ ! -f "$COMPOSE_OVERRIDE_FILE" ]; then
        echo "[backup-db] ERROR: compose override file not found: ${COMPOSE_OVERRIDE_FILE}" >&2
        exit 1
    fi
    COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE")
fi
COMPOSE+=(--env-file "$ENV_FILE")

# Read only the variables this script needs from .env.production. Do not source
# the whole file, because it may contain secrets or characters with shell
# meaning.
# shellcheck disable=SC2046
export $(grep -E '^(POSTGRES_DB|POSTGRES_USER|BACKUP_DIR)=' "$ENV_FILE" | xargs) 2>/dev/null || true
DB_NAME="${POSTGRES_DB:-easy_music}"
DB_USER="${POSTGRES_USER:-easy_music}"
BACKUP_DIR="${1:-${BACKUP_DIR:-/srv/easy-music/backups}}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/easy_music_backup_${TIMESTAMP}.sql.gz"

if ! "${COMPOSE[@]}" ps postgres 2>/dev/null | grep -q 'Up\|running'; then
    echo "[backup-db] ERROR: postgres container is not running." >&2
    echo "[backup-db] Start the stack first:" >&2
    echo "  ${COMPOSE[*]} up -d postgres" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
# Dumps contain password hashes and library metadata; keep them private.
umask 077

# ------------------------------------------------------------------
# Run pg_dump inside the postgres container
# ------------------------------------------------------------------
echo "[backup-db] Dumping database '${DB_NAME}' ..."

set +e
"${COMPOSE[@]}" exec -T postgres \
    pg_dump --clean --if-exists -U "$DB_USER" -d "$DB_NAME" \
    2> >(sed 's/^/[backup-db] /' >&2) \
    | gzip > "$BACKUP_FILE"
DUMP_EXIT="${PIPESTATUS[0]}"   # pg_dump exit code, not gzip
set -e

if [ "$DUMP_EXIT" -ne 0 ]; then
    echo "[backup-db] ERROR: pg_dump exited with code ${DUMP_EXIT}" >&2
    # Remove the partial file only; this script never deletes directories.
    rm -f "$BACKUP_FILE"
    exit 1
fi

# ------------------------------------------------------------------
# Result
# ------------------------------------------------------------------
BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "[backup-db] Done: ${BACKUP_FILE}  (${BACKUP_SIZE})"
exit 0
