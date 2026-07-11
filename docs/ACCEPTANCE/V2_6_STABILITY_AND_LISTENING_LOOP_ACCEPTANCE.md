# V2.6 Stability And Listening Loop Acceptance

Date: 2026-07-10
P0 and Sprint 1 accepted: 2026-07-11
Sprint 2 implementation completed: 2026-07-11

This document records implementation and verification for V2.6. It must remain
honest while work is in progress: unchecked items are not accepted, and local
automated checks do not substitute for production or device smoke where those
behaviors matter.

## Current Status

Status: P0 and Sprint 1 accepted. Sprint 2 is implemented and passes automated
gates; real browser/device/worker smoke remains before manual acceptance.
Hosted CI, branch promotion, and release tagging remain release-governance
work. Sprint 3 and Sprint 4 are planned.

Baseline recorded on 2026-07-10 before V2.6 implementation:

- Git branch: `develop` at `1a2b05d` before the V2.6 work branch.
- Backend: 365 collected; 362 passed, 1 failed, 2 skipped. The failure was a
  fixed-date library-report test using the real current clock.
- Web: `npm run build` passed.
- Android: `gradlew test` and `gradlew build` passed.
- Android lint: 14 warnings, including one exported-service security warning.
- Alembic: `20260629_0012 (head)`.
- Production Compose example config: passed.
- Worktree: clean.

## Milestone Scope

- P0 release-baseline, token-scope, Android security, CI, and documentation
  truth work.
- Sprint 1 Web playback event capture and retry.
- Sprint 1 recent-playback API and Web view.
- Sprint 1 active playback quick feedback on Web and Android.
- Sprint 2 library scale, failed processing recovery, and storage consistency.
- Sprint 3 certificate, backup, restore, and minimal alert closure.
- Sprint 4 testability-driven Web/Android UI maintenance.

Explicitly out of scope:

- ML/embedding/audio-analysis recommendation work.
- Multi-user, social, smart playlist, cross-device queue, downloader, or native
  Windows expansion.

## Gate 0: Planning And Traceability

- [x] Formal V2.6 task document exists.
- [x] Formal V2.6 acceptance document exists.
- [x] Every implementation commit maps to one P0 or sprint task.
- [x] Verification results are appended with dates and exact commands.
- [x] Known limitations and unrun manual checks remain visible.

## Gate 1: P0 Deterministic Baseline

- [x] Library-report time-boundary tests use an injected or dynamic clock.
- [x] Exact 30-day behavior is covered.
- [x] Full backend suite passes.
- [x] Alembic has one expected head.
- [x] Web typecheck/build pass.
- [x] Android test/build/lint pass.
- [x] Production Compose example config validates.

## Gate 2: Token Purpose Isolation

- [x] Access tokens carry and require an access purpose.
- [x] Stream tokens carry and require stream purpose plus exact track id.
- [x] Stream token is rejected as a normal API Bearer token.
- [x] Access token is rejected as a stream query token.
- [x] Expired, malformed, wrong-purpose, and wrong-track cases are tested.
- [x] Deployment notes warn that old sessions may need to sign in again.

## Gate 3: Android Security

- [x] Auth DataStore and cached private data cannot enter Android backup.
- [x] Playback service export policy is explicit and least-privilege.
- [x] Android lint has no unresolved exported-service security warning.
- [x] App playback works.
- [x] Notification controls work.
- [x] Lock-screen controls work.
- [x] Headset/media-button controls work.

## Gate 4: CI And Release Readiness

- [x] GitHub Actions backend job exists.
- [x] GitHub Actions Web job exists.
- [x] GitHub Actions Android job exists.
- [x] GitHub Actions production-config job exists.
- [x] Workflow commands match documented local commands.
- [ ] `develop` is promoted to `main` only after acceptance.
- [ ] A V2.6 release tag is created only after promotion.

## Gate 5: Documentation Truth

- [x] README current status is accurate.
- [x] Roadmap current and next work is accurate.
- [x] Architecture lists only implemented APIs and processing behavior.
- [x] Development and deployment docs agree with the production smoke record.
- [x] AGENTS guidance points future work to V2.6 while it is active.

## Gate 6: Web Playback Event Client

- [x] Web models all backend playback-event types.
- [x] Web event IDs are stable and idempotent.
- [x] Pending events persist without tokens.
- [x] Accepted and duplicate results are removed from pending storage.
- [x] Permanent server failures are removed while network/retryable failures
  remain bounded and retryable.
- [x] Unauthorized state is surfaced without interrupting audio.
- [x] Focused Web tests pass.

## Gate 7: Web Player Event Recording

- [x] Play is recorded once when a track starts.
- [x] Pause and resume are recorded without effect-driven duplicates.
- [x] Seek records the resulting position.
- [x] Skip records an unfinished transition.
- [x] Complete records natural end.
- [x] Queue previous/next still works.
- [x] Playlist repeat still works.
- [x] Failed-track auto-advance still works.
- [x] Playback continues when event delivery fails.

## Gate 8: Recent Playback

- [x] `GET /api/playback-events/recent` is authenticated.
- [x] Results are current-user scoped.
- [x] Results aggregate repeated events by track.
- [x] Results use deterministic latest-play ordering.
- [x] Limit validation and empty history are tested.
- [x] Web `/history` renders loading, empty, success, and error states.
- [x] History rows support play and queue actions.

## Gate 9: Active Playback Quick Feedback

- [x] Web active player supports like.
- [x] Web active player supports tired.
- [x] Web active player supports not-today.
- [x] Android Now Playing supports the same three actions.
- [x] Like updates backend track state.
- [x] Tired sets cooldown.
- [x] Not-today affects same-day recommendation exclusion.
- [x] Duplicate in-flight taps are prevented.
- [x] Feedback errors do not stop playback.

## Gate 10: Sprint 1 Cross-Client Smoke

- [x] Web play appears in recent history.
- [x] Android play appears in the same recent history.
- [x] Web quick feedback changes subsequent recommendation behavior.
- [x] Android quick feedback changes subsequent recommendation behavior.
- [x] Web browser playback smoke passes with real media.
- [x] Android device/emulator Media3 smoke passes.

## Gate 11: Sprint 2 Library And Recovery

- [x] Server-side search/filter/sort/pagination is owner-scoped and tested.
- [x] Web library discovery uses the server query contract.
- [x] Android library discovery uses the server query contract.
- [x] Failed audio and video processing can be safely retried.
- [x] Stale running jobs have a documented recovery rule.
- [x] Superseded covers do not remain orphaned.
- [x] Track deletion cannot silently leave records pointing to deleted media.
- [x] Storage consistency reporting is read-only.

## Gate 12: Sprint 3 Operations

- [ ] DNS certificate renewal procedure is documented and tested.
- [ ] Certificate replacement is atomic and Caddy reload is validated.
- [ ] Backup retention affects only verified backup files in the configured
  backup directory.
- [ ] Restore drill is recorded.
- [ ] Disk, certificate, backup, service, and failed-job checks are documented.

## Gate 13: Sprint 4 Testability And UI

- [ ] Web queue reducer has automated behavior tests.
- [ ] Web critical playback/history/feedback flows have automated tests.
- [ ] Oversized Web pages are split without behavior changes.
- [ ] Repeated Android scaffold wiring is reduced.
- [ ] Android large screens are split along stable state/action boundaries.
- [ ] UI changes pass desktop/mobile Web and phone-width Android smoke.

## Verification Log

Append dated entries below. Each entry must include implementation scope,
commands, results, manual checks, and remaining limitations.

### 2026-07-10 - Planning Baseline

Implemented:

- Created V2.6 task and acceptance documents.
- Recorded the pre-implementation verification baseline.

Automated checks:

- Documentation-only diff review pending first commit.

Manual checks:

- None required for planning-only files.

Remaining:

- All P0 and Sprint 1 implementation gates remain open.

### 2026-07-10 - P0 Automated Baseline And Security

Implemented:

- Made the library-report clock boundary deterministic and covered exactly 30
  days plus one second beyond the threshold.
- Added strict `access` and `track_stream` token purposes with negative scope,
  expiry, malformed-token, and wrong-track coverage.
- Disabled Android backup and excluded private data from cloud/device transfer.
- Kept the Media3 service exported as required for discovery while rejecting
  untrusted third-party controllers in the session callback.
- Added GitHub Actions jobs for backend, Web, Android, and production Compose.
- Synchronized README, roadmap, architecture, development, API smoke, and
  agent guidance with the real production-smoke and V2.6 state.

Automated checks:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m alembic heads
```

Results:

- Backend: `372 passed, 2 skipped`.
- Alembic: `20260629_0012 (head)`.

```powershell
cd web
npm run typecheck
npm run build
```

Result: passed.

```powershell
cd android
.\gradlew.bat test build
```

Result: `BUILD SUCCESSFUL`; exported-service lint warning is no longer present.

```powershell
docker compose -f docker-compose.prod.yml `
  --env-file .env.production.example config --quiet
```

Result: passed.

Manual checks still required:

- Android app playback, notification, lock-screen, and headset/media-button
  smoke after the controller policy change.
- GitHub-hosted CI execution after the branch is pushed.
- Promotion to `develop`/`main` and release tagging remain intentionally open.

### 2026-07-10 - Sprint 1 Web Playback Events

Implemented:

- Added typed Web playback-event API contracts.
- Added a bounded local pending-event store that strips unknown fields and
  never stores access or stream tokens.
- Added idempotent event IDs, partial-response handling, retry preservation,
  online/login flush triggers, and in-flight enqueue race protection.
- Connected play, pause, resume, seek, skip, and complete transitions to the
  shared Web queue player.
- Added non-blocking sync status without making telemetry failure stop audio.
- Added the Web test command to CI.

Automated checks:

```powershell
cd web
npm run test
npm run typecheck
npm run build
```

Results:

- Node/TypeScript playback event tests: 7 passed.
- TypeScript check: passed.
- Production build: passed.

Manual checks still required:

- Real browser/media smoke for event positions and queue transitions.
- Queue previous/next, playlist repeat, and failed-track auto-advance remain
  open until that browser smoke runs.

### 2026-07-10 - Sprint 1 Recent Playback API

Implemented:

- Added authenticated `GET /api/playback-events/recent` with a default limit of
  50 and validated maximum of 100.
- Aggregated one row per track using the latest `play`, `resume`, or `complete`
  event; pause, seek, and skip events do not reorder listening history.
- Counted only actual `play` events as playback starts and preserved the
  existing owner-scoped track response contract.

Automated checks:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_playback_events_api.py -q
```

Result: `9 passed`.

Manual checks still required:

- Cross-client history ordering with real Web and Android playback will be
  verified after the Web history surface is connected.

### 2026-07-10 - Sprint 1 Web Recent Playback

Implemented:

- Added protected `/history` routing and a Recent Playback navigation entry.
- Added loading, empty, retryable error, and populated history states.
- Added track detail links plus direct play, play-next, and add-to-queue actions.
- Added a focused route-resolution test.

Automated checks:

```powershell
cd web
npm run test
npm run typecheck
npm run build
```

Results:

- Node/TypeScript tests: `8 passed`.
- TypeScript check: passed.
- Production build: passed.

Manual checks still required:

- Real authenticated browser playback appearing in `/history` after event
  delivery.
- Visual and responsive smoke with populated production-like history data.

### 2026-07-10 - Sprint 1 Web Active Playback Feedback

Implemented:

- Added like, not-today, and tired controls to the shared active-player bar.
- Used idempotent event ids and explicit empty tag-context arrays for global
  playback feedback.
- Added a synchronous in-flight guard and ignored stale responses after the
  current track changes.
- Kept request success/failure state independent from audio playback state.

Automated checks:

```powershell
cd web
npm run test
npm run typecheck
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest `
  tests/test_feedback_events_api.py tests/test_recommendations_api.py -q
```

Results:

- Node/TypeScript tests: `9 passed`.
- TypeScript check and production build: passed.
- Backend feedback/recommendation tests: `21 passed`.

Manual checks still required:

- Real browser confirmation that feedback status remains non-blocking while
  audio continues.

### 2026-07-10 - Sprint 1 Android Active Playback Feedback

Implemented:

- Added like, not-today, and tired actions to Android Now Playing.
- Added a dedicated feedback repository and controller so feedback state and
  failures cannot mutate Media3 playback state.
- Sent idempotent Android event ids with explicit empty global tag context.
- Blocked duplicate in-flight taps, handled offline/error responses, and
  ignored responses belonging to a previous track after queue movement.

Automated checks:

```powershell
cd android
.\gradlew.bat test build lint --no-daemon --console=plain
.\gradlew.bat testDebugUnitTest `
  --tests "com.easymusic.app.player.ui.ActivePlaybackFeedbackControllerTest" `
  --tests "com.easymusic.app.recommendation.domain.FeedbackRepositoryTest" `
  --no-daemon --console=plain
```

Results:

- Full Android test/build/lint: `BUILD SUCCESSFUL`.
- Active feedback controller and repository tests: `5 passed`.
- Android lint: `0 errors, 13 warnings`; warnings remain the pre-existing
  launcher-icon, typography, and dependency-version advisories.

Manual checks still required:

- Device/emulator verification that each action changes subsequent backend
  recommendation behavior while playback continues.

### 2026-07-10 - P0 And Sprint 1 Final Automated Gate

Automated checks:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m alembic heads

cd ..\web
npm run test
npm run typecheck
npm run build

cd ..\android
.\gradlew.bat test build lint --no-daemon --console=plain

cd ..
docker compose -f docker-compose.prod.yml `
  --env-file .env.production.example config --quiet
```

Results:

- Backend: `376 passed, 2 skipped`.
- Alembic: `20260629_0012 (head)`.
- Web: `9 passed`; typecheck and production build passed.
- Android: `BUILD SUCCESSFUL`; lint reports `0 errors, 13 warnings`.
- Production Compose example configuration: passed.
- Final diff whitespace check: passed.
- Automatic code review: no unresolved blocking finding.

Browser automation limitation:

- The `webapp-testing` workflow was attempted, but neither the system Python
  nor the bundled workspace Python includes the required Playwright module.
  No dependency was added solely for this smoke. Real browser/media and
  responsive visual checks therefore remain unchecked above.

Release limitations:

- GitHub-hosted CI cannot run until the branch is pushed.
- No push, merge, `develop`/`main` promotion, or release tag was requested or
  performed.

### 2026-07-11 - P0 And Sprint 1 Manual Acceptance

Confirmed by the operator:

- Web playback with real media passes, including previous/next, playlist
  repeat, failed-track auto-advance, and non-blocking event-delivery failure.
- Web and Android plays appear together in recent history.
- Web and Android like, not-today, and tired feedback affect subsequent
  recommendation behavior as designed.
- Android app playback, notification, lock-screen, headset/media-button, and
  Media3 device/emulator smoke pass after the controller security change.

Result:

- P0 and Sprint 1 are accepted.
- The earlier missing-Python-Playwright limitation affected only automated
  browser execution; the required browser behavior was subsequently verified
  manually.

Remaining release governance:

- Run GitHub-hosted CI after pushing the branch.
- Promote through `develop` and `main` only when the intended release scope is
  ready.
- Create the V2.6 tag only after promotion and the remaining V2.6 sprints are
  accepted.

### 2026-07-11 - Sprint 2 Automated Gate

Implemented:

- Added backward-compatible, owner-scoped server search, filters, stable sort,
  offset pagination, and `X-Total-Count` metadata to `GET /api/tracks`.
- Replaced title-only local filtering in Web and Android with the shared server
  query contract, explicit summaries/reset actions, and bounded pagination.
- Added owner-scoped failed audio/video retry, active-job exclusion, and
  configurable stale-running recovery with a default 60-minute threshold.
- Made cover replacement clean up only after commit and track deletion stage
  media as reversible tombstones before deleting database state.
- Added an owner-safe, read-only storage consistency report; V2.6 performs no
  automatic orphan cleanup.

Automated checks:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\alembic.exe heads

cd ..\web
npm test -- --run
npm run typecheck
npm run build

cd ..\android
.\gradlew.bat test build lint --no-daemon --console=plain

cd ..
docker compose -f docker-compose.prod.yml `
  --env-file .env.production.example config --quiet
git diff 83662f8..HEAD --check
```

Results:

- Backend: `395 passed, 2 skipped`.
- Alembic: `20260629_0012 (head)`.
- Web: `10 passed`; typecheck and production build passed.
- Android: `BUILD SUCCESSFUL`.
- Production Compose example configuration and diff whitespace check: passed.
- Automatic code review: no unresolved blocking finding.

Manual checks still required before Sprint 2 acceptance:

- Exercise search/filter/sort/reset/pagination against a real large library on
  Web desktop/mobile and an Android device at typical phone width.
- Retry real failed audio and video tracks while the worker is running, and
  confirm safe error presentation when retained source media is missing.
- Inspect the consistency report against production-like storage and confirm
  requesting it does not mutate any database row or media file.
