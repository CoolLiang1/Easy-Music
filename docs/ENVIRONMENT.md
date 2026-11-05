# Environment

The environment variable contract. `.env.example` holds development-safe
placeholders and `.env.production.example` is the production template; neither
contains real secrets. When a variable or default changes, update this table
and both examples together.

## Variables

| Variable | Required for development | Required for deployment | Description |
| --- | --- | --- | --- |
| `POSTGRES_DB` | Yes | Yes | PostgreSQL database name. Development can use a local placeholder such as `easy_music_dev`; deployment should use the provisioned database name. |
| `POSTGRES_USER` | Yes | Yes | PostgreSQL user name used by the application. Deployment should provide a dedicated database user. |
| `POSTGRES_PASSWORD` | Yes | Yes | PostgreSQL password for `POSTGRES_USER`. The example value is a placeholder and must be replaced outside version control. |
| `DATABASE_URL` | Yes | Yes | Full backend database connection URL. It should match the database name, user, password, host, and port used by the runtime environment. |
| `APP_SECRET_KEY` | Yes | Yes | Backend signing secret for authentication-related tokens. Development may use a throwaway placeholder; every deployment must use a strong unique secret. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Yes | Yes | Short-lived access token lifetime in minutes. Defaults to `60`; Web and Android renew it silently with the refresh token, so a short value does not force re-login. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | No | Refresh token lifetime in days. Defaults to `30`. Each renewal rotates the token and restarts this window, so a client opened at least once per window stays signed in. |
| `VITE_API_BASE_URL` | Yes for Web | Yes for Web build | Public API origin baked into the React build. For production, set it to the deployed HTTPS origin before `npm run build`. |
| `VITE_MAX_VIDEO_UPLOAD_MB` | No | No | Web UI display/client-side limit for user-provided video uploads. Keep it aligned with `MAX_VIDEO_UPLOAD_MB`. |
| `easyMusicApiBaseUrl` Gradle property | No | Yes for Android production APK | Public API origin baked into the Android APK at build time. Pass it with `-PeasyMusicApiBaseUrl=https://music.example.com`; omit it for emulator-local development. |
| `MEDIA_ROOT` | Yes | Yes | Root directory for managed media files inside the backend container. With `docker-compose.prod.yml`, keep this as `/app/media`; configure host storage through `MEDIA_HOST_*` variables instead. |
| `ORIGINALS_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for preserved original uploads. |
| `PLAYBACK_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for generated playback files. |
| `COVERS_DIR` | Yes | Yes | Directory name under `MEDIA_ROOT` for uploaded and extracted cover images. |
| `TEMP_VIDEOS_DIR` | No | Yes | Directory name under `MEDIA_ROOT` for temporary user-provided video uploads before worker extraction. Defaults to `temp-videos`. |
| `MAX_UPLOAD_MB` | Yes | Yes | Maximum accepted audio upload size in megabytes. Keep deployment values compatible with `CADDY_AUDIO_UPLOAD_LIMIT`. |
| `MAX_VIDEO_UPLOAD_MB` | No | Yes | Maximum accepted user-provided video upload size in megabytes. Defaults to `1024`; keep deployment reverse proxy limits compatible. |
| `MAX_COVER_MB` | Yes | Yes | Maximum accepted cover-image upload size in megabytes. |
| `IMPORT_ALLOWED_ROOTS` | No | No | Optional semicolon- or comma-separated allowlist of server-side import roots. Empty disables import tools. Use explicit directories outside the repository, outside user home roots, and outside `MEDIA_ROOT`; never commit private machine-specific paths. |
| `IMPORT_SCAN_MAX_FILES` | No | No | Maximum supported audio candidates returned by one import scan. Defaults to `1000`. |
| `IMPORT_SCAN_MAX_DEPTH` | No | No | Maximum recursive directory depth for import scan preview. Defaults to `5`. |
| `IMPORT_SCAN_MAX_FILE_MB` | No | No | Maximum per-file size included as a supported import scan candidate. Defaults to `200`; larger files are returned as skipped. |
| `FFMPEG_PATH` | Yes | Yes | Executable name or configured path for `ffmpeg`. Development can use `ffmpeg` when it is available on `PATH`. |
| `FFPROBE_PATH` | Yes | Yes | Executable name or configured path for `ffprobe`. Development can use `ffprobe` when it is available on `PATH`. |
| `PLAYBACK_LOUDNESS_NORMALIZATION` | No | No | Measure each original with ffmpeg `loudnorm` and bake one static gain into the playback MP3. Defaults to `true`; `false` encodes without gain. |
| `PLAYBACK_TARGET_LUFS` | No | No | Target integrated loudness for playback MP3s. Defaults to `-16`. Changing it affects new files only until `python -m app.worker.renormalize --all` is run. |
| `PLAYBACK_MAX_TRUE_PEAK_DBTP` | No | No | True-peak ceiling. A boost is reduced so the measured peak stays at or below this value; no limiter or compression is applied. Defaults to `-1`. |
| `CORS_ORIGINS` | Yes | Yes | Comma-separated list of allowed browser origins. Development should list local Web origins explicitly; deployment should list only deployed domains. |
| `LOG_LEVEL` | No | No | Backend log level. Defaults to `INFO`. |
| `LOG_FORMAT` | No | No | Backend log format: `text` for development-style logs or `json` for production-friendly structured logs. |
| `AI_ENABLED` | No | No | Enables AI provider calls when set to `true`. Leave `false` to keep AI endpoints in safe fallback mode. |
| `AI_PROVIDER` | No | No | AI provider identifier. The implemented provider shape is OpenAI-compatible. |
| `AI_API_KEY` | No | No | AI provider API key. Leave empty unless testing or deploying AI features with a real provider. Never commit a real key. |
| `AI_MODEL` | No | No | AI model identifier used by the provider client. |
| `AI_BASE_URL` | No | No | Base URL for the OpenAI-compatible provider. |
| `AI_AUTO_TAGGING_ENABLED` | No | No | When `true` and the AI provider is configured, the worker applies AI catalogue tags to ready tracks not yet auto-tagged, one batch of up to 10 tracks while its media queue is idle. Defaults to `false`. `python -m app.worker.autotag` works without it. |
| `AI_AUTO_TAGGING_MIN_CONFIDENCE` | No | No | Lowest AI confidence (0.0-1.0) for an auto-applied tag. Defaults to `0.6`. Raising it affects later batches only; run `python -m app.worker.autotag --all` to re-tag existing tracks. |
| `AI_TAG_SEARCH_ENABLED` | No | No | Enables optional Tavily search context for `POST /api/ai/tracks/{track_id}/suggest-tags` only. Defaults to `false`. |
| `AI_TAG_SEARCH_PROVIDER` | No | No | Suggest-tags search provider. The first supported value is `tavily`. |
| `AI_TAG_SEARCH_API_KEY` | No | No | Tavily Search API key for tag suggestions. Never commit a real key. |
| `AI_TAG_SEARCH_BASE_URL` | No | No | Tavily-compatible base URL. Defaults to `https://api.tavily.com`. |
| `AI_TAG_SEARCH_MAX_RESULTS` | No | No | Maximum search summaries included in the AI tag suggestion prompt. Defaults to `5`; supported maximum is `5`. |
| `AI_TAG_SEARCH_CACHE_DAYS` | No | No | Number of days to reuse cached search summaries. Defaults to `30`; set `0` to disable cache reuse. |
| `CADDY_DOMAIN` | No | Yes | Public HTTPS domain used by the production Caddy service. |
| `CADDY_HTTP_PORT` | No | No | Host port published to Caddy container port 80. Defaults to `80`. |
| `CADDY_HTTPS_PORT` | No | No | Host port published to Caddy container port 443. Defaults to `443`; use a reachable high port such as `25443` only with a matching public Web origin. |
| `CADDYFILE_PATH` | No | No | Caddyfile mounted into the Caddy container. Defaults to `./deploy/Caddyfile`; use `./deploy/Caddyfile.manual-cert` for operator-provided certificates. |
| `CADDY_CERT_DIR` | No | No | Host directory mounted read-only to `/certs` for `fullchain.pem` and `privkey.pem` when using `deploy/Caddyfile.manual-cert`. |
| `MEDIA_HOST_ORIGINALS` | No | Yes | Production host directory bind-mounted to `/app/media/originals`. |
| `MEDIA_HOST_PLAYBACK` | No | Yes | Production host directory bind-mounted to `/app/media/playback`. |
| `MEDIA_HOST_COVERS` | No | Yes | Production host directory bind-mounted to `/app/media/covers`. |
| `MEDIA_HOST_TEMP_VIDEOS` | No | Yes | Production host directory bind-mounted to `/app/media/temp-videos` for temporary video extraction inputs. |
| `POSTGRES_DATA_DIR` | No | Yes | Production host directory for PostgreSQL data. |
| `CADDY_AUDIO_UPLOAD_LIMIT` | No | Yes | Caddy request-body limit for `/api/tracks/upload`, using a Caddy size string such as `200MB`. |
| `CADDY_VIDEO_UPLOAD_LIMIT` | No | Yes | Caddy request-body limit for `/api/tracks/upload-video`, using a Caddy size string such as `1024MB`. |
| `BACKUP_DIR` | No | No | Host directory used by deployment scripts for database backup files. Defaults to `/srv/easy-music/backups`. |
| `BACKUP_RETENTION_DAYS` | No | No | Documentation value for operator-managed database backup retention. The bundled backup script does not delete files. |
| `DEPLOY_COMPOSE_OVERRIDE` | No | No | Read only by `deploy/update.sh`. Optional host-specific compose file layered on top of `docker-compose.prod.yml` (extra mounts, published port). Keep it outside the checkout. |
| `DEPLOY_BUILD_USER` | No | No | Read only by `deploy/update.sh`. Non-root user that runs `npm ci` and `npm run build`. Defaults to the user who invoked `sudo`. |
| `DEPLOY_BUILD_PROXY` | No | No | Read only by `deploy/update.sh`. Optional HTTP(S) proxy applied only to `docker compose build`. |

## Development Defaults

`.env.example` uses local, development-safe placeholders. These values are meant to document expected names and formats only.

The example intentionally avoids real credentials, tokens, private host paths, and production domains. Before any real deployment, replace passwords and secrets through the deployment environment rather than by editing committed files.

AI providers use the OpenAI-compatible contract; DeepSeek, for example, works
with `AI_PROVIDER=openai-compatible`, `AI_MODEL=deepseek-chat`, and
`AI_BASE_URL=https://api.deepseek.com/v1`. The `AI_TAG_SEARCH_*` settings
affect only per-track tag suggestions.

`IMPORT_ALLOWED_ROOTS` is empty by default. For local import testing, point it
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
- Build the Web app with `VITE_API_BASE_URL` set to the deployed HTTPS origin.
- Keep `MEDIA_ROOT=/app/media` when using `docker-compose.prod.yml`, and use
  `MEDIA_HOST_*` values for mounted persistent host storage.
- Mount `MEDIA_HOST_TEMP_VIDEOS` read-write into the API and worker containers
  if video upload/extraction is enabled.
- Keep `MAX_UPLOAD_MB` compatible with `CADDY_AUDIO_UPLOAD_LIMIT`, and
  `MAX_VIDEO_UPLOAD_MB` compatible with `CADDY_VIDEO_UPLOAD_LIMIT`.
- Leave `IMPORT_ALLOWED_ROOTS` empty unless import directories have been
  explicitly created and mounted read-only into the API container.
- Restrict `CORS_ORIGINS` to trusted deployed origins.
- Set `CADDY_DOMAIN` to the public domain that points to the server.
- If inbound 80/443 are blocked by the upstream network, use a reachable
  high-port HTTPS origin, `deploy/Caddyfile.manual-cert`, and an
  operator-provided certificate from DNS validation.
- Keep all real credentials and host-specific private paths outside version control.

## Rules

- Commit only development-safe examples.
- Do not commit `.env` files with real values.
- Do not hard-code machine-specific absolute paths.
- Do not require AI provider credentials for non-AI development checks.
- Do not commit production `.env.production`; commit only `.env.production.example`.
