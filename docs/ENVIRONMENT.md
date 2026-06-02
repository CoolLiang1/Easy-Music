# Environment

This document defines the environment variable contract for the current Easy
Music MVP implementation.

## Current Status

Backend, Web, Android, and deployment artifacts are implemented through the
accepted Phase 7 scope. Use `.env.example` as a development-safe reference and
`.env.production.example` as the production deployment template. Both files
contain placeholders only, not production-ready secrets.

## Variables

| Variable | Required for development | Required for deployment | Description |
| --- | --- | --- | --- |
| `POSTGRES_DB` | Yes | Yes | PostgreSQL database name. Development can use a local placeholder such as `easy_music_dev`; deployment should use the provisioned database name. |
| `POSTGRES_USER` | Yes | Yes | PostgreSQL user name used by the application. Deployment should provide a dedicated database user. |
| `POSTGRES_PASSWORD` | Yes | Yes | PostgreSQL password for `POSTGRES_USER`. The example value is a placeholder and must be replaced outside version control. |
| `DATABASE_URL` | Yes | Yes | Full backend database connection URL. It should match the database name, user, password, host, and port used by the runtime environment. |
| `APP_SECRET_KEY` | Yes | Yes | Backend signing secret for authentication-related tokens. Development may use a throwaway placeholder; every deployment must use a strong unique secret. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Yes | Yes | Access token lifetime in minutes. The development example favors convenience and can be tightened for deployment. |
| `MEDIA_ROOT` | Yes | Yes | Root directory for managed media files. Use a relative development path or a deployment-managed mounted path; do not commit private machine-specific absolute paths. |
| `ORIGINALS_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for preserved original uploads. |
| `PLAYBACK_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for generated playback files. |
| `MAX_UPLOAD_MB` | Yes | Yes | Maximum accepted upload size in megabytes. Deployment should choose a value that fits storage and reverse proxy limits. |
| `FFMPEG_PATH` | Yes | Yes | Executable name or configured path for `ffmpeg`. Development can use `ffmpeg` when it is available on `PATH`. |
| `FFPROBE_PATH` | Yes | Yes | Executable name or configured path for `ffprobe`. Development can use `ffprobe` when it is available on `PATH`. |
| `CORS_ORIGINS` | Yes | Yes | Comma-separated list of allowed browser origins. Development should list local Web origins explicitly; deployment should list only deployed domains. |
| `LOG_LEVEL` | No | No | Backend log level. Defaults to `INFO`. |
| `LOG_FORMAT` | No | No | Backend log format: `text` for development-style logs or `json` for production-friendly structured logs. |
| `AI_ENABLED` | No | No | Enables AI provider calls when set to `true`. Leave `false` to keep AI endpoints in safe fallback mode. |
| `AI_PROVIDER` | No | No | AI provider identifier. The implemented provider shape is OpenAI-compatible. |
| `AI_API_KEY` | No | No | AI provider API key. Leave empty unless testing or deploying AI features with a real provider. Never commit a real key. |
| `AI_MODEL` | No | No | AI model identifier used by the provider client. |
| `AI_BASE_URL` | No | No | Base URL for the OpenAI-compatible provider. |
| `CADDY_DOMAIN` | No | Yes | Public HTTPS domain used by the production Caddy service. |
| `MEDIA_HOST_ORIGINALS` | No | Yes | Production host directory bind-mounted to `/app/media/originals`. |
| `MEDIA_HOST_PLAYBACK` | No | Yes | Production host directory bind-mounted to `/app/media/playback`. |
| `MEDIA_HOST_COVERS` | No | Yes | Production host directory bind-mounted to `/app/media/covers`. |
| `POSTGRES_DATA_DIR` | No | Yes | Production host directory for PostgreSQL data. |
| `BACKUP_RETENTION_DAYS` | No | No | Documentation value for operator-managed database backup retention. The bundled backup script does not delete files. |

## Development Defaults

`.env.example` uses local, development-safe placeholders. These values are meant to document expected names and formats only.

The example intentionally avoids real credentials, tokens, private host paths, and production domains. Before any real deployment, replace passwords and secrets through the deployment environment rather than by editing committed files.

## Deployment Expectations

Deployment configuration should provide the same variable names through
`.env.production`, created locally from `.env.production.example`.

Deployment values must:

- Use strong unique values for `POSTGRES_PASSWORD` and `APP_SECRET_KEY`.
- Use storage paths that point to the mounted persistent media location.
- Restrict `CORS_ORIGINS` to trusted deployed origins.
- Set `CADDY_DOMAIN` to the public domain that points to the server.
- Keep all real credentials and host-specific private paths outside version control.

## Rules

- Commit only development-safe examples.
- Do not commit `.env` files with real values.
- Do not hard-code machine-specific absolute paths.
- Do not require AI provider credentials for non-AI development checks.
- Do not commit production `.env.production`; commit only `.env.production.example`.
