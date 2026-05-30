#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-host.sh  —  Easy Music production host directory setup
# ---------------------------------------------------------------------------
#
# Creates the host-side directories required by docker-compose.prod.yml
# and sets ownership so the non-root container users can read and write.
#
# This script is NON-DESTRUCTIVE: it only creates directories and adjusts
# permissions.  It never deletes or overwrites existing data.
#
# Usage:
#   chmod +x deploy/setup-host.sh
#   sudo ./deploy/setup-host.sh
#
# Without sudo the script creates directories but cannot adjust ownership.
# Run without sudo first to see what it would do, then re-run with sudo.
#
# Paths are read from .env.production when available; otherwise the
# defaults below are used.

set -euo pipefail

# ------------------------------------------------------------------
# Default paths  (override through .env.production or environment)
# ------------------------------------------------------------------
MEDIA_ORIGINALS="${MEDIA_HOST_ORIGINALS:-/srv/easy-music/media/originals}"
MEDIA_PLAYBACK="${MEDIA_HOST_PLAYBACK:-/srv/easy-music/media/playback}"
MEDIA_COVERS="${MEDIA_HOST_COVERS:-/srv/easy-music/media/covers}"
POSTGRES_DATA="${POSTGRES_DATA_DIR:-/srv/easy-music/postgres}"
BACKUP_DIR="${BACKUP_DIR:-/srv/easy-music/backups}"

# UID:GID of the non-root user inside the api / worker containers.
# This must match the --uid / --gid values in backend/Dockerfile.
APP_UID="${EASY_MUSIC_APP_UID:-1100}"
APP_GID="${EASY_MUSIC_APP_GID:-1100}"

# ------------------------------------------------------------------
# Source .env.production if present (values override the defaults)
# ------------------------------------------------------------------
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.production"
if [ -f "$ENV_FILE" ]; then
    echo "[setup-host] Reading ${ENV_FILE} …"
    # Only export the variables we care about so unrelated shell escapes
    # in the env file cannot cause side-effects.
    # shellcheck disable=SC2046
    export $(grep -E '^(MEDIA_HOST_ORIGINALS|MEDIA_HOST_PLAYBACK|MEDIA_HOST_COVERS|POSTGRES_DATA_DIR|BACKUP_DIR)=' "$ENV_FILE" | xargs) 2>/dev/null || true
    MEDIA_ORIGINALS="${MEDIA_HOST_ORIGINALS:-$MEDIA_ORIGINALS}"
    MEDIA_PLAYBACK="${MEDIA_HOST_PLAYBACK:-$MEDIA_PLAYBACK}"
    MEDIA_COVERS="${MEDIA_HOST_COVERS:-$MEDIA_COVERS}"
    POSTGRES_DATA="${POSTGRES_DATA_DIR:-$POSTGRES_DATA}"
fi

echo ""
echo "=== Easy Music host directory setup ==="
echo "Media originals : ${MEDIA_ORIGINALS}"
echo "Media playback  : ${MEDIA_PLAYBACK}"
echo "Media covers    : ${MEDIA_COVERS}"
echo "PostgreSQL data : ${POSTGRES_DATA}"
echo "Backups         : ${BACKUP_DIR}"
echo "App UID:GID     : ${APP_UID}:${APP_GID}"
echo ""

# ------------------------------------------------------------------
# Create directories
# ------------------------------------------------------------------
echo "[setup-host] Creating directories …"
mkdir -p "$MEDIA_ORIGINALS"
mkdir -p "$MEDIA_PLAYBACK"
mkdir -p "$MEDIA_COVERS"
mkdir -p "$POSTGRES_DATA"
mkdir -p "$BACKUP_DIR"

echo "[setup-host] Directories created (or already present)."

# ------------------------------------------------------------------
# Permissions
# ------------------------------------------------------------------
if [ "$(id -u)" -eq 0 ]; then
    echo "[setup-host] Running as root — setting ownership …"

    # Media directories are written by the api / worker containers
    # which run as UID:GID ${APP_UID}:${APP_GID}.
    chown "${APP_UID}:${APP_GID}" "$MEDIA_ORIGINALS"
    chown "${APP_UID}:${APP_GID}" "$MEDIA_PLAYBACK"
    chown "${APP_UID}:${APP_GID}" "$MEDIA_COVERS"

    # Backup directory should be writable by the operator; 700 is safe.
    chown "${APP_UID}:${APP_GID}" "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    echo "[setup-host] Ownership set to ${APP_UID}:${APP_GID} for media dirs."
else
    echo "[setup-host] NOT running as root — skipping chown."
    echo "[setup-host] Re-run with sudo to set directory ownership:"
    echo "  sudo $0"
    echo ""
    echo "[setup-host] Until then, the container user (UID ${APP_UID}) may"
    echo "[setup-host] be unable to write to the media directories."
fi

echo ""
echo "[setup-host] Done.  You can now start the stack:"
echo "  docker compose -f docker-compose.prod.yml --env-file .env.production up -d"
