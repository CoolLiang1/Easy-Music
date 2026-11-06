# Development

How to run, change, and check Easy Music on the Windows development machine.
Commands are PowerShell from the repository root unless a directory is named.
Production is covered in [DEPLOYMENT.md](DEPLOYMENT.md), and environment
variables in [ENVIRONMENT.md](ENVIRONMENT.md).

## Prerequisites

- Docker with the Compose plugin.
- Python 3.12 for host-side backend work.
- Node.js 20.19+ or 22.12+ for the Web app.
- FFmpeg and ffprobe on `PATH` for host-side media processing.
- Android Studio or the Android SDK for the Android app.

## Backend In Docker Compose

The simplest local stack. The backend image includes FFmpeg and the Alembic
migrations.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres api
docker compose exec api alembic upgrade head
docker compose exec `
  -e EASY_MUSIC_INITIAL_PASSWORD="replace-with-a-local-password" `
  api python -m app.auth.initial_user --username admin
docker compose up -d worker-loop      # or: docker compose run --rm worker (one job)
```

The initial-user command refuses to run once any user exists; keep using the
existing account. After changing `.env`, recreate the services with
`docker compose up -d --force-recreate api worker-loop`.

## Backend On The Host

Use this for fast iteration and tests. PostgreSQL still runs in Compose.

```powershell
docker compose up -d postgres
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"

$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Worker commands, from `backend/` with the same environment:

| Command | Effect |
| --- | --- |
| `python -m app.worker` | Process one pending job. |
| `python -m app.worker --loop --poll-interval 5` | Keep processing; also `WORKER_LOOP=true`. |
| `python -m app.worker --track-id 1` | Process one track's job. |
| `python -m app.worker.renormalize [--dry-run] [--track-id N \| --all]` | Regenerate playback MP3s whose loudness rule is out of date. |
| `python -m app.worker.covers [--dry-run] [--track-id N]` | Extract embedded artwork as covers for tracks without one. |
| `python -m app.worker.autotag [--dry-run] [--limit N] [--track-id N \| --all]` | Apply AI catalogue tags; prints what it applied. |

Use `.\.venv\Scripts\python.exe` in place of `python` if the virtual
environment is not activated.

### Migrations

Alembic reads `DATABASE_URL` through the application settings; do not edit
`backend/alembic.ini`. Create a migration in `backend/alembic/versions/`,
following the existing `YYYYMMDD_NNNN_description.py` naming, and check it
with `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head`.
Run that against PostgreSQL as well as SQLite when the migration does more
than add a nullable column.

## Optional Features

All are off by default; none is needed for ordinary development or tests.

**AI provider.** Set these in `.env` (Compose) or the shell (host):

```powershell
$env:AI_ENABLED = "true"
$env:AI_PROVIDER = "openai-compatible"
$env:AI_API_KEY = "your-own-key"
$env:AI_MODEL = "deepseek-chat"                  # or another provider model
$env:AI_BASE_URL = "https://api.deepseek.com/v1" # any OpenAI-compatible base
```

Without them, AI endpoints answer with provider status `disabled` or
`unconfigured`. `AI_AUTO_TAGGING_ENABLED` turns on worker auto-tagging, and
`AI_TAG_SEARCH_*` adds optional Tavily context to per-track tag suggestions;
see [ENVIRONMENT.md](ENVIRONMENT.md). Never commit a real key.

**Import roots.** Point `IMPORT_ALLOWED_ROOTS` at throwaway directories outside
the repository, your home directory, and `MEDIA_ROOT`. Separate Windows paths
with semicolons:

```powershell
$env:IMPORT_ALLOWED_ROOTS = "D:\EasyMusicImport;E:\AnotherImport"
```

**Video upload.** Works with the defaults (`TEMP_VIDEOS_DIR=temp-videos`,
`MAX_VIDEO_UPLOAD_MB=1024`). The worker extracts the audio and deletes the
temporary video on success.

## Web

```powershell
cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

The dev server listens on `http://127.0.0.1:8081/`. Common ports such as 5173
and 3000 can fall inside port ranges Windows reserves for Hyper-V and WSL, so
the Vite config pins 8081. There is no lint script; `npm run typecheck` and
`npm run build` are the checks.

## Android

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat assembleDebug
```

The API base URL is baked in at build time through the `easyMusicApiBaseUrl`
Gradle property:

| Target | Base URL |
| --- | --- |
| Emulator to the host backend (default) | `http://10.0.2.2:8000` |
| Device with `adb reverse tcp:8000 tcp:8000` | `-PeasyMusicApiBaseUrl=http://127.0.0.1:8000` |
| Device on the LAN | `-PeasyMusicApiBaseUrl=http://<host-lan-ip>:8000`; cleartext needs the debug network security config. |
| Production | The HTTPS origin; see [DEPLOYMENT.md](DEPLOYMENT.md#step-9---build-and-install-the-android-app). |

```powershell
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=http://127.0.0.1:8000
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Never commit a real host into source files. If playback causes app-wide jank
or repeated notification updates, start with
[the playback performance incident](DEBUGGING/ANDROID_PLAYBACK_QUEUE_PERFORMANCE.md).

## Checks

| Area | Command |
| --- | --- |
| Backend, all | `cd backend; .\.venv\Scripts\python.exe -m pytest` |
| Backend, focused | `... -m pytest tests\test_recommendations_service.py tests\test_ai_auto_tagging.py` |
| Web | `cd web; npm run typecheck; npm run build` |
| Android | `cd android; .\gradlew.bat test; .\gradlew.bat assembleDebug` |
| Production compose | `docker compose -f docker-compose.prod.yml --env-file .env.production.example config --quiet` |
| Docs | `pwsh -File scripts/check-docs.ps1` |

Backend tests use in-memory SQLite and fake AI clients, so they need neither
Docker nor a provider key. Tests named for an area (`test_imports_*`,
`test_ai_*`, `test_playlists_api.py`, ...) are the focused set for that area.

## Smoke Flows

Run the flows your change touches, against a local stack with a few `ready`
tracks. API-level flows are in [API_MANUAL_TESTING.md](API_MANUAL_TESTING.md).

Web:

1. Log in; refresh the page and stay logged in.
2. Upload an audio file; it moves from `processing` to `ready` while the
   worker runs.
3. Library: search with filter mode off (highlights) and on (filters); select
   several tracks and edit tags, add them to a playlist, or delete them.
4. Track detail: edit metadata, cover, tags, and liked state; changes survive a
   refresh.
5. Play a ready track; seek, pause, skip, and edit the queue from the player
   bar.
6. Recommendations: pick tags, get results, send feedback; the AI assistant
   shows a clear message when AI is disabled.
7. Tags, playlists, imports, duplicates, and reports pages load and act on the
   right tracks.

Android (emulator or device):

1. Log in; Library, Playlists, and Recommendations load.
2. Play from any list; background, notification, lock-screen, and headset
   controls work.
3. Cache a track, go offline, play it, come back online; playback events sync.
4. Request recommendations, play one, and send feedback.

## Git Workflow

- `main` is the stable branch. Start each change from an up-to-date `main` on
  a `feature/<name>` or `fix/<name>` branch and merge it through a pull
  request.
- When several agent sessions work at once, give each its own worktree.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `chore:`.
- The pull request template asks for verification and documentation impact;
  CI runs the documentation check.
