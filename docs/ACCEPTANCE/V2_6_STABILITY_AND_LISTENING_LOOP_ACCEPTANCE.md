# V2.6 Stability And Listening Loop Acceptance

Date: 2026-07-10

This document records implementation and verification for V2.6. It must remain
honest while work is in progress: unchecked items are not accepted, and local
automated checks do not substitute for production or device smoke where those
behaviors matter.

## Current Status

Status: implementation in progress.

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

## Accepted Scope

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
- [ ] Every implementation commit maps to one P0 or sprint task.
- [ ] Verification results are appended with dates and exact commands.
- [ ] Known limitations and unrun manual checks remain visible.

## Gate 1: P0 Deterministic Baseline

- [ ] Library-report time-boundary tests use an injected or dynamic clock.
- [ ] Exact 30-day behavior is covered.
- [ ] Full backend suite passes.
- [ ] Alembic has one expected head.
- [ ] Web typecheck/build pass.
- [ ] Android test/build/lint pass.
- [ ] Production Compose example config validates.

## Gate 2: Token Purpose Isolation

- [ ] Access tokens carry and require an access purpose.
- [ ] Stream tokens carry and require stream purpose plus exact track id.
- [ ] Stream token is rejected as a normal API Bearer token.
- [ ] Access token is rejected as a stream query token.
- [ ] Expired, malformed, wrong-purpose, and wrong-track cases are tested.
- [ ] Deployment notes warn that old sessions may need to sign in again.

## Gate 3: Android Security

- [ ] Auth DataStore and cached private data cannot enter Android backup.
- [ ] Playback service export policy is explicit and least-privilege.
- [ ] Android lint has no unresolved exported-service security warning.
- [ ] App playback works.
- [ ] Notification controls work.
- [ ] Lock-screen controls work.
- [ ] Headset/media-button controls work.

## Gate 4: CI And Release Readiness

- [ ] GitHub Actions backend job exists.
- [ ] GitHub Actions Web job exists.
- [ ] GitHub Actions Android job exists.
- [ ] GitHub Actions production-config job exists.
- [ ] Workflow commands match documented local commands.
- [ ] `develop` is promoted to `main` only after acceptance.
- [ ] A V2.6 release tag is created only after promotion.

## Gate 5: Documentation Truth

- [ ] README current status is accurate.
- [ ] Roadmap current and next work is accurate.
- [ ] Architecture lists only implemented APIs and processing behavior.
- [ ] Development and deployment docs agree with the production smoke record.
- [ ] AGENTS guidance points future work to V2.6 while it is active.

## Gate 6: Web Playback Event Client

- [ ] Web models all backend playback-event types.
- [ ] Web event IDs are stable and idempotent.
- [ ] Pending events persist without tokens.
- [ ] Accepted and duplicate results are removed from pending storage.
- [ ] Failed/retryable events remain bounded and retryable.
- [ ] Unauthorized state is surfaced without interrupting audio.
- [ ] Focused Web tests pass.

## Gate 7: Web Player Event Recording

- [ ] Play is recorded once when a track starts.
- [ ] Pause and resume are recorded without effect-driven duplicates.
- [ ] Seek records the resulting position.
- [ ] Skip records an unfinished transition.
- [ ] Complete records natural end.
- [ ] Queue previous/next still works.
- [ ] Playlist repeat still works.
- [ ] Failed-track auto-advance still works.
- [ ] Playback continues when event delivery fails.

## Gate 8: Recent Playback

- [ ] `GET /api/playback-events/recent` is authenticated.
- [ ] Results are current-user scoped.
- [ ] Results aggregate repeated events by track.
- [ ] Results use deterministic latest-play ordering.
- [ ] Limit validation and empty history are tested.
- [ ] Web `/history` renders loading, empty, success, and error states.
- [ ] History rows support play and queue actions.

## Gate 9: Active Playback Quick Feedback

- [ ] Web active player supports like.
- [ ] Web active player supports tired.
- [ ] Web active player supports not-today.
- [ ] Android Now Playing supports the same three actions.
- [ ] Like updates backend track state.
- [ ] Tired sets cooldown.
- [ ] Not-today affects same-day recommendation exclusion.
- [ ] Duplicate in-flight taps are prevented.
- [ ] Feedback errors do not stop playback.

## Gate 10: Sprint 1 Cross-Client Smoke

- [ ] Web play appears in recent history.
- [ ] Android play appears in the same recent history.
- [ ] Web quick feedback changes subsequent recommendation behavior.
- [ ] Android quick feedback changes subsequent recommendation behavior.
- [ ] Web browser playback smoke passes with real media.
- [ ] Android device/emulator Media3 smoke passes.

## Gate 11: Sprint 2 Library And Recovery

- [ ] Server-side search/filter/sort/pagination is owner-scoped and tested.
- [ ] Web library discovery uses the server query contract.
- [ ] Android library discovery uses the server query contract.
- [ ] Failed audio and video processing can be safely retried.
- [ ] Stale running jobs have a documented recovery rule.
- [ ] Superseded covers do not remain orphaned.
- [ ] Track deletion cannot silently leave records pointing to deleted media.
- [ ] Storage consistency reporting is read-only.

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

