# deploy/ production deployment artifacts

This directory contains the host and reverse-proxy helpers used by the Ubuntu
production deployment flow documented in `docs/DEPLOYMENT.md`.

- `Caddyfile`: HTTPS termination, reverse proxy, upload body limits, and static
  Web SPA serving.
- `setup-host.sh`: non-destructive host directory and ownership setup for media,
  temporary video inputs, PostgreSQL data, and backups.
- `backup-db.sh`: compressed PostgreSQL dump helper that writes backup files and
  does not delete old backups.

Keep real domains, passwords, API keys, and `.env.production` out of version
control.
