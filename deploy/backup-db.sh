#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# backup-db.sh - Easy Music database backup
# ---------------------------------------------------------------------------
#
# Dumps the production PostgreSQL database to a compressed, timestamped file
# using pg_dump inside the running postgres container. The script does NOT
# modify, drop, or recreate the source database.
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
#
# ---------------------------------------------------------------------------
# Cron example  (daily at 3:00 AM)
# ---------------------------------------------------------------------------
#   0 3 * * * /srv/easy-music/repo/deploy/backup-db.sh /srv/easy-music/backups
#
# ---------------------------------------------------------------------------
# Restore  (MANUAL - review before running)
# ---------------------------------------------------------------------------
# Restoring overwrites the existing database. Only run this when you are
# certain you want to replace the current data with the backup.
#
#   1. Stop the api and worker so no writes happen during restore:
#        docker compose -f docker-compose.prod.yml --env-file .env.production stop api worker
#
#   2. Restore from the backup file:
#        gunzip < /srv/easy-music/backups/easy_music_backup_YYYY-MM-DD_HHMMSS.sql.gz \
#          | docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
#            psql -U easy_music -d easy_music
#
#   3. Start the services again:
#        docker compose -f docker-compose.prod.yml --env-file .env.production start api worker
#
#   WARNING: step 2 overwrites data. There is no undo.
#            Take a fresh backup before restoring.

set -euo pipefail

# ------------------------------------------------------------------
# Resolve paths
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.production}"

# ------------------------------------------------------------------
# Backup destination
# ------------------------------------------------------------------
BACKUP_DIR="${1:-${BACKUP_DIR:-/srv/easy-music/backups}}"

# ------------------------------------------------------------------
# Construct the output filename
# ------------------------------------------------------------------
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/easy_music_backup_${TIMESTAMP}.sql.gz"

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

# Read only the database identity variables from .env.production. Do not source
# the whole file, because it may contain secrets or characters with shell
# meaning.
# shellcheck disable=SC2046
export $(grep -E '^(POSTGRES_DB|POSTGRES_USER)=' "$ENV_FILE" | xargs) 2>/dev/null || true
DB_NAME="${POSTGRES_DB:-easy_music}"
DB_USER="${POSTGRES_USER:-easy_music}"

if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps postgres 2>/dev/null | grep -q 'Up\|running'; then
    echo "[backup-db] ERROR: postgres container is not running." >&2
    echo "[backup-db] Start the stack first:" >&2
    echo "  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d postgres" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# ------------------------------------------------------------------
# Run pg_dump inside the postgres container
# ------------------------------------------------------------------
echo "[backup-db] Dumping database '${DB_NAME}' ..."

set +e
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U "$DB_USER" -d "$DB_NAME" \
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
