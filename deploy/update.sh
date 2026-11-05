#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# update.sh - deploy the currently checked-out Easy Music commit
# ---------------------------------------------------------------------------
#
# Run from a production checkout after selecting the commit to deploy:
#
#   git fetch origin
#   git checkout --detach <commit>      # or: git switch main && git pull --ff-only
#   sudo ./deploy/update.sh
#
# The script never runs git itself, so it never rewrites its own file while it
# runs. Steps:
#
#   1. Verify the env file, compose files, and manual TLS certificate validity.
#   2. Back up PostgreSQL with deploy/backup-db.sh (skipped on a first deploy
#      when postgres is not running yet).
#   3. Build the Web app as the non-root operator user.
#   4. Validate the merged Compose config and build images.
#   5. Start postgres and apply Alembic migrations before the new api starts.
#   6. Recreate api, worker, and caddy and wait for them to become healthy.
#   7. Check /health over HTTPS on this host.
#
# Configuration is read from the production env file (default
# <repo>/.env.production, override with ENV_FILE). Values used here:
#
#   VITE_API_BASE_URL          public HTTPS origin; Web build and health check
#   VITE_MAX_VIDEO_UPLOAD_MB   Web build value (default 1024)
#   BACKUP_DIR                 database backup directory
#   CADDYFILE_PATH, CADDY_CERT_DIR
#                              manual-cert mode check (cert must be valid 30 days)
#   DEPLOY_COMPOSE_OVERRIDE    optional host-specific compose file, layered on
#                              top of docker-compose.prod.yml
#   DEPLOY_BUILD_USER          user that runs npm (default: the sudo caller)
#   DEPLOY_BUILD_PROXY         optional HTTP(S) proxy used only for image builds
#
# The env file is never sourced; only the keys above are read.

set -Eeuo pipefail

main() {
  local script_dir repo_root
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  repo_root="$(cd "$script_dir/.." && pwd)"

  ENV_FILE="${ENV_FILE:-$repo_root/.env.production}"
  local compose_file="$repo_root/docker-compose.prod.yml"

  [[ "$(id -u)" -eq 0 ]] || die "Run this script with sudo."
  [[ -s "$ENV_FILE" ]] || die "env file not found or empty: $ENV_FILE"
  [[ -f "$compose_file" ]] || die "compose file not found: $compose_file"

  local api_origin max_video_mb backup_dir caddyfile cert_dir override build_user build_proxy
  api_origin="$(env_value VITE_API_BASE_URL)"
  max_video_mb="$(env_value VITE_MAX_VIDEO_UPLOAD_MB)"
  backup_dir="$(env_value BACKUP_DIR)"
  caddyfile="$(env_value CADDYFILE_PATH)"
  cert_dir="$(env_value CADDY_CERT_DIR)"
  override="$(env_value DEPLOY_COMPOSE_OVERRIDE)"
  build_user="$(env_value DEPLOY_BUILD_USER)"
  build_proxy="$(env_value DEPLOY_BUILD_PROXY)"

  max_video_mb="${max_video_mb:-1024}"
  backup_dir="${backup_dir:-/srv/easy-music/backups}"
  build_user="${build_user:-${SUDO_USER:-}}"

  [[ "$api_origin" =~ ^https://[^/]+$ ]] \
    || die "VITE_API_BASE_URL must be an https origin without a path, got: '${api_origin}'"
  [[ "$api_origin" != *example.com* && "$api_origin" != *change-me* ]] \
    || die "VITE_API_BASE_URL still contains a placeholder"
  [[ -n "$build_user" && "$build_user" != "root" ]] \
    || die "Set DEPLOY_BUILD_USER or run through sudo from the operator account"
  id "$build_user" >/dev/null 2>&1 || die "build user does not exist: $build_user"

  COMPOSE=(docker compose -f "$compose_file")
  if [[ -n "$override" ]]; then
    [[ -f "$override" ]] || die "DEPLOY_COMPOSE_OVERRIDE not found: $override"
    COMPOSE+=(-f "$override")
  fi
  COMPOSE+=(--env-file "$ENV_FILE")

  local host_port host port
  host_port="${api_origin#https://}"
  host="${host_port%%:*}"
  port="443"
  [[ "$host_port" == *:* ]] && port="${host_port##*:}"

  local commit
  commit="$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || echo unknown)"

  step "[1/7] Verifying inputs (commit ${commit})"
  if [[ "$caddyfile" == *manual-cert* ]]; then
    [[ -n "$cert_dir" ]] || die "CADDY_CERT_DIR is required with Caddyfile.manual-cert"
    [[ -s "$cert_dir/fullchain.pem" && -s "$cert_dir/privkey.pem" ]] \
      || die "certificate files missing in $cert_dir"
    openssl x509 -in "$cert_dir/fullchain.pem" -noout -checkend 2592000 >/dev/null \
      || die "TLS certificate in $cert_dir expires within 30 days; renew it first"
    printf 'certificate %s\n' "$(openssl x509 -in "$cert_dir/fullchain.pem" -noout -enddate)"
  fi
  "${COMPOSE[@]}" config --quiet

  step "[2/7] Backing up the database"
  if [[ -n "$("${COMPOSE[@]}" ps -q --status running postgres 2>/dev/null)" ]]; then
    COMPOSE_OVERRIDE_FILE="$override" ENV_FILE="$ENV_FILE" \
      bash "$script_dir/backup-db.sh" "$backup_dir"
  else
    printf 'postgres is not running; skipping backup (first deploy)\n'
  fi

  step "[3/7] Building the Web app as ${build_user}"
  local build_home
  build_home="$(getent passwd "$build_user" | cut -d: -f6)"
  runuser -u "$build_user" -- env HOME="$build_home" \
    VITE_API_BASE_URL="$api_origin" VITE_MAX_VIDEO_UPLOAD_MB="$max_video_mb" \
    bash -c "cd '$repo_root/web' && npm ci && npm run build"
  [[ -s "$repo_root/web/dist/index.html" ]] || die "Web build did not produce dist/index.html"

  step "[4/7] Building images"
  if [[ -n "$build_proxy" ]]; then
    HTTP_PROXY="$build_proxy" HTTPS_PROXY="$build_proxy" "${COMPOSE[@]}" build
  else
    "${COMPOSE[@]}" build
  fi

  step "[5/7] Applying database migrations"
  "${COMPOSE[@]}" up -d postgres
  wait_healthy postgres 120
  "${COMPOSE[@]}" run --rm api alembic upgrade head

  step "[6/7] Recreating api, worker, and caddy"
  "${COMPOSE[@]}" up -d api worker
  wait_healthy api 180
  wait_healthy worker 120
  "${COMPOSE[@]}" up -d caddy
  wait_healthy caddy 60

  step "[7/7] Checking ${api_origin}/health on this host"
  local health="" attempt
  for attempt in $(seq 1 24); do
    if health="$(curl -fsS --connect-timeout 5 --resolve "${host}:${port}:127.0.0.1" "${api_origin}/health")"; then
      break
    fi
    if (( attempt == 24 )); then
      "${COMPOSE[@]}" logs --tail=100 caddy api >&2 || true
      die "HTTPS health check failed"
    fi
    sleep 5
  done
  [[ "$health" == *'"status":"healthy"'* && "$health" == *'"database":"connected"'* ]] \
    || die "unexpected health response: $health"
  printf 'health=%s\n' "$health"

  "${COMPOSE[@]}" ps
  printf '\nDeployed commit %s.\n' "$commit"
  printf 'To roll back code: git checkout --detach <previous-commit> && sudo ./deploy/update.sh\n'
  printf 'Migrations are not reverted automatically; see docs/DEPLOYMENT.md before restoring data.\n'
  printf 'UPDATE_OK\n'
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '\n%s\n' "$*"
}

# Print the last value of KEY from the env file, without sourcing it. Strips
# one pair of surrounding single or double quotes.
env_value() {
  local key="$1" line value
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$value"
}

wait_healthy() {
  local service="$1" timeout_seconds="$2" elapsed=0 cid status
  while (( elapsed < timeout_seconds )); do
    cid="$("${COMPOSE[@]}" ps -q "$service")"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
      case "$status" in
        healthy|running)
          printf '%s=%s\n' "$service" "$status"
          return 0
          ;;
        unhealthy|exited|dead)
          "${COMPOSE[@]}" logs --tail=100 "$service" >&2 || true
          die "$service is $status"
          ;;
      esac
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  "${COMPOSE[@]}" logs --tail=100 "$service" >&2 || true
  die "$service did not become healthy within ${timeout_seconds}s"
}

main "$@"
exit 0
