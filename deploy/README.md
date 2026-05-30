# deploy/ — production deployment artifacts
#
# This directory holds production configuration files that are mounted into
# containers or used during deployment.  Each file is added by the Phase 7
# task that owns it:
#
#   Task 7.4 — Caddyfile         (Caddy HTTPS + reverse proxy config)
#   Task 7.5 — setup-host.sh     (host directories and permissions)
#   Task 7.6 — backup-db.sh      (database backup script)
