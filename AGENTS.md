# Easy Music Agent Guide

This file is for AI agents working in this repository. Follow it before making
changes. Keep the guide current when project reality changes.

## Project Snapshot

Easy Music is a self-hosted personal cloud music system for scenario-based
listening. The MVP spans backend, Web, Android, and deployment artifacts.

The repository is organized as one product, not independent demos. Changes in
one area often affect API contracts, documentation, acceptance notes, Android
models, Web types, and deployment configuration.

## Main Modules

- `backend/`: FastAPI backend, SQLAlchemy models, Alembic migrations, auth,
  track/tag/upload APIs, media streaming, playback and feedback event sync,
  recommendation rules, AI assistant services, worker job processing, tests.
- `web/`: React/Vite management console for login, upload, library management,
  track editing, tags, Web playback, structured recommendations, AI assistant,
  and AI tag suggestions.
- `android/`: Kotlin/Jetpack Compose listening client using Media3, DataStore,
  Room, and WorkManager. It covers login, library/detail views, online playback,
  background/media controls, manual offline cache, playback-event sync, and
  recommendation flows.
- `deploy/`: production support files, including Caddy, host directory setup,
  and database backup scripts.
- `docs/`: product, architecture, roadmap, development workflow, environment,
  deployment, phase tasks, and acceptance records.
- Root compose/env files: local and production Docker Compose plus committed
  example environment templates only.

## How To Understand The Codebase

Before implementing, read the relevant docs first:

- Product intent and boundaries: `docs/PRD.md`, `docs/ROADMAP.md`.
- System shape and module boundaries: `docs/ARCHITECTURE.md`.
- Local workflow and verification expectations: `docs/DEVELOPMENT.md`.
- API smoke flows: `docs/API_MANUAL_TESTING.md`.
- Deployment and production behavior: `docs/DEPLOYMENT.md`.
- Current phase/task context: the relevant `docs/TASKS/PHASE_*_TASKS.md` and
  `docs/ACCEPTANCE/PHASE_*_ACCEPTANCE.md`.

Then inspect the narrow code path for the task. Prefer existing service,
repository, schema, route, UI, and test patterns over inventing new structures.

Useful mental map:

- Upload problems usually cross Web upload UI, backend upload service, media
  storage paths, processing jobs, worker, FFmpeg/ffprobe, and Docker volumes.
- Playback problems usually cross authenticated stream endpoints, Web audio
  blob loading, Android Media3, bearer-token data sources, MediaSession, and
  offline cache source selection.
- Recommendation problems usually belong to structured tag validation,
  `recommendations` service scoring, playback events, feedback events,
  cooldowns, `not_today`, and client request models.
- AI problems usually involve provider state (`disabled`, `unconfigured`,
  `error`, `ok`), JSON parsing, prompt catalogues, tag-id validation, and then
  delegation back to rule-based recommendation.
- Deployment problems usually involve production env values, Caddy, compose
  health checks, volume permissions, PostgreSQL, worker logs, and HTTPS/DNS.

## Development Principles

- Work on only the currently requested task or optimization. Do not implement
  later roadmap items early.
- Keep changes scoped. Avoid broad rewrites, framework swaps, or large
  refactors unless the task explicitly asks for them.
- Preserve existing architecture boundaries: thin FastAPI routes, backend
  business logic in services, typed schemas/models, Web API wrappers/types, and
  Android repository/view-model separation.
- Before adding a new abstraction, search for an existing route, service, repository, ViewModel, API wrapper, schema, or test pattern that should be extended instead.
- Maintain API contract compatibility across backend, Web, and Android. If a
  backend response or request shape changes, update all clients and tests that
  depend on it.
- Respect the MVP non-goals unless explicitly asked otherwise: no multi-user
  expansion, social/discovery features, automatic Bilibili downloading, full
  ML recommendation system, full-library offline sync, or native Windows app.
- Keep AI constrained. The LLM parses intent and suggests tags; rule-based
  services select and rank tracks. Do not let AI bypass cooldown, recent-play,
  feedback, or ownership checks.
- Keep media storage safe. Preserve path traversal protections and avoid
  exposing internal paths unless an existing API already does so intentionally.
- Do not hard-code production hosts, usernames, passwords, API keys, bearer
  tokens, or machine-local absolute paths.
- Do not commit secrets or local state. Never commit `.env`, `.env.production`,
  `local.properties`, `.claude/`, build outputs, cache directories, virtual
  environments, node modules, generated APKs, database files, media files, or
  other local artifacts.
- Windows / PowerShell is the primary local development environment. Production
  deployment targets Ubuntu with Docker Compose and Caddy. Keep both realities
  in mind when editing scripts, docs, paths, and commands.
- Do not run destructive recursive cleanup commands across the repository. If deletion is necessary, delete only explicit, task-related paths and explain why.

## Testing And Verification

Agents are expected to test their own changes. Choose checks by risk and touched
area rather than running unrelated suites blindly.

- Backend changes should be covered by focused backend tests first, then broader
  backend regression when shared behavior is touched.
- Web changes should pass TypeScript/build checks and, for user-facing flows,
  a browser smoke check when practical.
- Android changes should pass relevant JVM tests/build checks and, for playback,
  cache, notification, or device behavior, should be treated as needing
  emulator/device verification when practical.
- Deployment changes should validate compose/config shape and review production
  docs, env templates, host scripts, Caddy behavior, and secret exposure.
- AI behavior should be tested without requiring a live provider whenever
  possible. Cover disabled/unconfigured/error states and fake-provider success.
- If a required check cannot be run, state exactly what was not run and why.

Do not mark acceptance complete unless the documented acceptance criteria for
that area are genuinely satisfied.

## Documentation Updates

When project progress changes, update documentation so future agents do not
mistake stale docs for reality.

Consider updating:

- `README.md` for top-level status and implemented areas.
- `docs/ROADMAP.md` for phase progress and remaining caveats.
- `docs/ARCHITECTURE.md` for durable architecture or module-boundary changes.
- `docs/DEVELOPMENT.md` for local workflow, verification, or tooling changes.
- `docs/ENVIRONMENT.md` and env examples for configuration contract changes.
- `docs/DEPLOYMENT.md`, `docker-compose.prod.yml`, and deploy scripts for
  production workflow changes.
- Relevant `docs/TASKS/PHASE_*_TASKS.md` and `docs/ACCEPTANCE/PHASE_*_ACCEPTANCE.md` when a
  phase task or acceptance status changes.
- This `AGENTS.md` when an unexpected pitfall or stable agent rule emerges.

Keep docs concise and operational. Do not add long background stories.

## Git Rules

- Start from the intended branch for the work. The documented workflow uses
  stable milestone branches plus focused feature/fix branches.
- Keep commits focused on one logical task.
- Use concise Conventional Commit-style prefixes when appropriate:
  `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
- Inspect the diff before committing.
- Do not include unrelated local changes in a commit.
- Do not rewrite, reset, or discard user work unless explicitly instructed.
- Do not commit secrets, local config, generated build output, caches, media
  libraries, or dependency directories.
- If code and docs both change because of one feature, commit them together
  only when they represent the same logical task.

## Common Pitfalls And Confusions

Update this section when you discover something surprising.

- The repository has completed the MVP through Phase 7 locally, but the first
  real Ubuntu/domain/HTTPS production smoke test is intentionally deferred to
  operator deployment.
- Some older docs may describe historical phase boundaries. Prefer current
  `README.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and acceptance docs
  when judging current status.
- AI endpoints can return successful HTTP responses with provider status
  `disabled`, `unconfigured`, or `error`. This is often expected fallback
  behavior, not necessarily a transport failure.
- AI does not choose tracks directly. If recommendations look wrong, inspect
  structured tag parsing and the rule-based recommendation service separately.
- Android emulator backend access normally uses a host-loopback style base URL,
  while real production should use HTTPS. Do not hard-code production URLs.
- Web authentication has evolved from placeholder scaffolding to real token
  storage. If login/navigation behavior is odd, inspect both current auth
  context wiring and any leftover placeholder assumptions.
- Android playback/cache behavior crosses many layers: selected playback source,
  local Room cache state, Media3 player/session service, authenticated network
  data source, and offline playback-event recorder.
- Backend upload status depends on both the API creating a processing job and
  the worker actually running with writable shared media volumes.

## Safety Rules

- Never run destructive cleanup across the repository.
- Never bulk delete files or directories.
- Never edit generated dependency directories or build artifacts as source.
- Never expose real keys, passwords, bearer tokens, personal paths, or media
  library contents in committed files.
- Prefer small, reversible changes with tests over sweeping edits.
