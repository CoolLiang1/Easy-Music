# Easy Music Agent Guide

Easy Music is a self-hosted music system for one owner: a FastAPI backend and
media worker, a React/Vite Web console, and a Kotlin/Compose Android player,
deployed with Docker Compose and Caddy on one Ubuntu host.

This file holds rules that stay true from task to task. It never carries
project status: current and open work is in [docs/ROADMAP.md](docs/ROADMAP.md),
and [docs/README.md](docs/README.md) says which document owns what.

## How Work Is Chosen

- Work comes from problems the owner meets in real use. Do the task you were
  given. If you notice an adjacent bug or a better approach, say so rather than
  silently widening the change.
- Prefer the smallest change that fully solves the problem. A larger refactor
  is fine when the task genuinely needs it; explain why in the summary.
- Easy Music is a private tool, not a product. Do not add release process,
  observability stacks, multi-user abstractions, or scaling work unless the
  owner asks.
- Product boundaries and non-goals are in [docs/PRD.md](docs/PRD.md). Ask the
  owner before crossing one.

## Where Things Live

| Area | Path | Notes |
| --- | --- | --- |
| HTTP routes | `backend/app/api/routes/` | Thin: validate, call a service, return a schema. |
| Business logic | `backend/app/services/` | Recommendation, AI, imports, playlists, uploads, processing. |
| Models and migrations | `backend/app/models/`, `backend/alembic/versions/` | Every schema change needs a migration. |
| Media and FFmpeg | `backend/app/media/` | Storage paths and path-traversal checks. |
| Worker and backfills | `backend/app/worker/` | Job loop, `autotag`, `renormalize`. |
| Backend tests | `backend/tests/` | SQLite in-memory, fake AI clients. |
| Web | `web/src/` | `api/` typed wrappers, `types/`, `pages/`, `player/`. |
| Android | `android/app/src/main/java/com/easymusic/app/` | Per feature: `data/`, `domain/`, `ui/`. |
| Production | `deploy/`, `docker-compose.prod.yml`, `.env.production.example` | Operated through `deploy/update.sh`. |

## Invariants

These protect the owner's data, privacy, or the core product idea. Breaking one
needs the owner's explicit agreement.

### Contracts

- Backend, Web (`web/src/api`, `web/src/types`), and Android data models share
  one API. When a request or response shape changes, update all three and their
  tests in the same change.
- Schema changes go through an Alembic migration that upgrades and downgrades.
  Tests use SQLite and production uses PostgreSQL; check a non-trivial
  migration against PostgreSQL when Docker is available.

### AI And Recommendation

- AI parses listening intent, suggests tags, and may apply existing catalogue
  tags as `source="ai"` rows. It may propose titles and artists, which are
  saved only through the owner-reviewed `metadata-cleanup/apply` call. It
  never creates tags, never changes owner (`user`) rows, and never selects or
  orders tracks. Ranking stays in
  `services/recommendations.py` and keeps cooldown, recent-play, feedback, and
  ownership rules.
- AI endpoints answer HTTP 200 with provider status `disabled`,
  `unconfigured`, or `error` as normal fallback, not as a transport failure.
  Tests use fake providers and never need a live key.
- `track_tags.source` carries meaning: `ai` rows weigh less in ranking and are
  the only rows auto-tagging may replace. Code that rewrites a track's tags
  keeps the rows of tags that stay instead of deleting and re-inserting them,
  or AI tags silently become owner tags. Bump `AI_AUTO_TAGGING_VERSION` only
  when existing AI tags should be regenerated; it re-adds AI tags the owner
  removed.

### Media

- Original files are never modified or moved, and are deleted only when the
  owner deletes the track. Playback MP3s can always be regenerated from them.
- `process_track` re-applies title, artist, and album from file tags. Never use
  it to rebuild playback for an existing track; use
  `regenerate_track_playback`, which keeps owner edits. Bump
  `LOUDNESS_VERSION` when the playback gain rule changes so the backfill picks
  up old files.
- Keep the path-traversal checks in `backend/app/media/`. Do not expose server
  filesystem paths in new API fields.
- Import roots are an allowlist, disabled when empty. Import never browses
  arbitrary paths and never moves, renames, deletes, or modifies source files.
  Nothing downloads from external sites.

### Android

- Do not call `onUpdateNotification` from
  `MediaSessionService.onStartCommand`; it creates a notification update loop
  and sustained main-thread CPU on some OEM builds. See
  [the playback performance incident](docs/DEBUGGING/ANDROID_PLAYBACK_QUEUE_PERFORMANCE.md).
- Playback crosses cache-versus-network source selection, Room cache state, the
  Media3 session service, the authenticated data source, and the offline event
  recorder. Trace all of them before changing playback or cache behaviour.

### Secrets And Local State

- Never commit secrets, real domains, personal paths, or local state: `.env`,
  `.env.production`, `local.properties`, `.claude/`, build outputs, caches,
  virtual environments, `node_modules`, APKs, databases, or media.
- API base URLs are configuration (`VITE_API_BASE_URL`, the
  `easyMusicApiBaseUrl` Gradle property, env files). Do not hard-code hosts.

## Verifying Changes

Run the checks that cover what you touched, and report exactly what ran and
what did not. Commands are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#checks).

| Touched | Minimum check |
| --- | --- |
| Backend | Focused `pytest` first; the full suite when shared code changed. |
| Migration | `alembic upgrade head`, `downgrade -1`, `upgrade head`. |
| Web | `npm run typecheck` and `npm run build`; a browser check of a changed user flow. |
| Android | `gradlew test` and `assembleDebug`; emulator or device for playback, cache, or notifications. |
| Deployment | Compose `config --quiet` against the example env; read the affected deploy script end to end. |
| Docs | `pwsh -File scripts/check-docs.ps1`. |

Automated checks prove the code path, not the owner's experience. A change to
playback, UI, AI quality, or production behaviour stays `Implemented` until
the owner has confirmed it in real use. Never mark such work `Accepted`
yourself.

The development machine is Windows with PowerShell; production is Ubuntu.
Scripts under `deploy/` are bash and must run on the server. Local commands in
docs use PowerShell; server commands use bash.

## Documentation

Documentation is part of the change. [docs/README.md](docs/README.md) is the
map. In short:

- Update every document your change makes wrong: architecture, environment
  variables (with both env examples), deployment steps, development commands.
- A feature, or a fix the owner will notice, gets a slice record under
  `docs/TASKS/` and a row in the roadmap. Small fixes, refactors, and test-only
  changes need only a clear commit message.
- Add to this file only a rule or pitfall that is stable, not obvious from the
  code, and would cost the next agent real time.

## Git

- Branch from an up-to-date `main` as `feature/<name>` or `fix/<name>` and
  merge back through a pull request. `develop` is no longer used.
- Several agent sessions often work in this repository at the same time. Work
  in your own worktree or branch, and never edit, stash, or commit another
  session's uncommitted files.
- Keep one logical change per commit, with a Conventional Commit prefix
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`). Review the diff
  before committing.
- Push, merge, or deploy only when the owner asks. Never rewrite published
  history or discard work you did not create.

## Safety

- Ask before anything that touches production, the real media library, or the
  production database: deployments, backfills, migrations, restores, deletes.
- Delete files only when the deletion is part of the change. Never run
  repository-wide cleanup commands.
