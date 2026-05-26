# Environment

This document defines the initial environment variable contract for Easy Music Phase 0 documentation and Phase 1 backend work.

The repository still contains documentation only. Runtime configuration loading is not implemented yet, and `.env` files with real local or deployment values must not be committed.

## Current Status

Backend, Web, Android, and deployment code are planned but not implemented yet. The variables below reserve the names future backend, database, media storage, authentication, CORS, and FFmpeg work should use.

Use `.env.example` as a development-safe reference only. It contains placeholders, not production-ready secrets.

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

## Development Defaults

`.env.example` uses local, development-safe placeholders. These values are meant to document expected names and formats only.

The example intentionally avoids real credentials, tokens, private host paths, and production domains. Before any real deployment, replace passwords and secrets through the deployment environment rather than by editing committed files.

## Deployment Expectations

Deployment configuration should provide the same variable names through the deployment platform, host environment, secret manager, or future Docker Compose environment file.

Deployment values must:

- Use strong unique values for `POSTGRES_PASSWORD` and `APP_SECRET_KEY`.
- Use storage paths that point to the mounted persistent media location.
- Restrict `CORS_ORIGINS` to trusted deployed origins.
- Keep all real credentials and host-specific private paths outside version control.

## Future Configuration

AI provider configuration is planned for later recommendation and tag suggestion work. It is not an active Phase 0 requirement, so no AI provider variables are part of the current environment contract.

## Rules

- Commit only development-safe examples.
- Do not commit `.env` files with real values.
- Do not hard-code machine-specific absolute paths.
- Do not require AI provider credentials before the AI assistant scope begins.
- Do not implement environment loading code as part of this documentation task.
