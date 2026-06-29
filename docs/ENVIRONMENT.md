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
| `COVERS_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for uploaded and extracted cover images. |
| `TEMP_VIDEOS_DIR` | No | Yes | Directory name under `MEDIA_ROOT` for temporary user-provided video uploads before worker extraction. Defaults to `temp-videos`. |
| `MAX_UPLOAD_MB` | Yes | Yes | Maximum accepted upload size in megabytes. Deployment should choose a value that fits storage and reverse proxy limits. |
| `MAX_VIDEO_UPLOAD_MB` | No | Yes | Maximum accepted user-provided video upload size in megabytes. Defaults to `1024`; keep deployment reverse proxy limits compatible. |
| `MAX_COVER_MB` | Yes | Yes | Maximum accepted cover-image upload size in megabytes. |
| `IMPORT_ALLOWED_ROOTS` | No | No | Optional semicolon- or comma-separated allowlist of server-side import roots. Empty disables import tools. Use explicit directories outside the repository, outside user home roots, and outside `MEDIA_ROOT`; never commit private machine-specific paths. |
| `IMPORT_SCAN_MAX_FILES` | No | No | Maximum supported audio candidates returned by one import scan. Defaults to `1000`. |
| `IMPORT_SCAN_MAX_DEPTH` | No | No | Maximum recursive directory depth for import scan preview. Defaults to `5`. |
| `IMPORT_SCAN_MAX_FILE_MB` | No | No | Maximum per-file size included as a supported import scan candidate. Defaults to `200`; larger files are returned as skipped. |
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
| `AI_TAG_SEARCH_ENABLED` | No | No | Enables optional Tavily search context for `POST /api/ai/tracks/{track_id}/suggest-tags` only. Defaults to `false`. |
| `AI_TAG_SEARCH_PROVIDER` | No | No | Suggest-tags search provider. The first supported value is `tavily`. |
| `AI_TAG_SEARCH_API_KEY` | No | No | Tavily Search API key for tag suggestions. Never commit a real key. |
| `AI_TAG_SEARCH_BASE_URL` | No | No | Tavily-compatible base URL. Defaults to `https://api.tavily.com`. |
| `AI_TAG_SEARCH_MAX_RESULTS` | No | No | Maximum search summaries included in the AI tag suggestion prompt. Defaults to `5`; supported maximum is `5`. |
| `AI_TAG_SEARCH_CACHE_DAYS` | No | No | Number of days to reuse cached search summaries. Defaults to `30`; set `0` to disable cache reuse. |
| `CADDY_DOMAIN` | No | Yes | Public HTTPS domain used by the production Caddy service. |
| `MEDIA_HOST_ORIGINALS` | No | Yes | Production host directory bind-mounted to `/app/media/originals`. |
| `MEDIA_HOST_PLAYBACK` | No | Yes | Production host directory bind-mounted to `/app/media/playback`. |
| `MEDIA_HOST_COVERS` | No | Yes | Production host directory bind-mounted to `/app/media/covers`. |
| `MEDIA_HOST_TEMP_VIDEOS` | No | Yes | Production host directory bind-mounted to `/app/media/temp-videos` for temporary video extraction inputs. |
| `POSTGRES_DATA_DIR` | No | Yes | Production host directory for PostgreSQL data. |
| `CADDY_VIDEO_UPLOAD_LIMIT` | No | Yes | Caddy request-body limit for `/api/tracks/upload-video`, using a Caddy size string such as `1024MB`. |
| `BACKUP_RETENTION_DAYS` | No | No | Documentation value for operator-managed database backup retention. The bundled backup script does not delete files. |

## Development Defaults

`.env.example` uses local, development-safe placeholders. These values are meant to document expected names and formats only.

The example intentionally avoids real credentials, tokens, private host paths, and production domains. Before any real deployment, replace passwords and secrets through the deployment environment rather than by editing committed files.

AI providers use the OpenAI-compatible contract. DeepSeek-style testing can use
`AI_PROVIDER=openai-compatible`, a DeepSeek model id such as `deepseek-chat`,
and `AI_BASE_URL=https://api.deepseek.com/v1`. V2.5 optionally adds
suggest-tags-only `AI_TAG_SEARCH_*` settings for Tavily title/snippet/URL prompt
context. It does not add broad `AI_SEARCH_*` settings, web scraping, or any
organization/apply endpoint.

`IMPORT_ALLOWED_ROOTS` is empty by default. For local V2 import testing, point it
at one or more throwaway directories outside the repository and outside
`MEDIA_ROOT`. Use semicolons for Windows paths, for example:

```powershell
$env:IMPORT_ALLOWED_ROOTS = "D:\EasyMusicImport;E:\AnotherImport"
```

Ubuntu-style container paths are also accepted when those directories are
explicitly mounted into the backend container, for example:

```bash
IMPORT_ALLOWED_ROOTS=/app/imports/library-a;/app/imports/library-b
```

The scan endpoint is read-only and controlled by `IMPORT_SCAN_MAX_FILES`,
`IMPORT_SCAN_MAX_DEPTH`, and `IMPORT_SCAN_MAX_FILE_MB`. These limits do not
create tracks or copy files; they only constrain preview responses.

User-provided video upload is controlled by `MAX_VIDEO_UPLOAD_MB` and
`TEMP_VIDEOS_DIR`. Uploaded videos are temporary extraction inputs under
`MEDIA_ROOT`; they are not exposed through track stream/download APIs and are
not stored as track originals.

## Deployment Expectations

Deployment configuration should provide the same variable names through
`.env.production`, created locally from `.env.production.example`.

Deployment values must:

- Use strong unique values for `POSTGRES_PASSWORD` and `APP_SECRET_KEY`.
- Use storage paths that point to the mounted persistent media location.
- Mount `MEDIA_HOST_TEMP_VIDEOS` read-write into the API and worker containers
  if video upload/extraction is enabled.
- Leave `IMPORT_ALLOWED_ROOTS` empty unless import directories have been
  explicitly created and mounted read-only into the API container.
- Restrict `CORS_ORIGINS` to trusted deployed origins.
- Set `CADDY_DOMAIN` to the public domain that points to the server.
- Keep all real credentials and host-specific private paths outside version control.

## Rules

- Commit only development-safe examples.
- Do not commit `.env` files with real values.
- Do not hard-code machine-specific absolute paths.
- Do not require AI provider credentials for non-AI development checks.
- Do not commit production `.env.production`; commit only `.env.production.example`.
