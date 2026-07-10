# V2.6 Stability And Listening Loop Tasks

Date: 2026-07-10

V2.6 turns the locally complete and production-smoked Easy Music product into
a releaseable, observable daily-listening system. The milestone starts with a
P0 stabilization gate, then closes Web playback telemetry and recent-listening
workflows before scaling the library and continuing UI work.

## Product Goal

Make playback from Web and Android produce one trustworthy listening history,
make recommendation fatigue rules react to that history, and make the deployed
single-owner product safe to update and operate.

## Current Baseline

- MVP, V1.1, and the implemented V2 slices are locally accepted.
- The first Ubuntu production smoke passed on 2026-06-30 using a DNS-validated
  certificate and public HTTPS port 25443.
- `develop` contains the production-smoked product and is substantially ahead
  of `main`; no release tag or automated CI workflow exists yet.
- Android records playback events locally and syncs them through
  `POST /api/playback-events`.
- Web playback does not currently record playback events, so Web listening is
  absent from recommendation recency, revival, and organization reports.
- Web has type/build checks but no automated unit or component test runner.
- The backend suite has one date-dependent library-report test that becomes
  incorrect as wall-clock time advances.

## Global Boundaries

In scope:

- Deterministic tests and a green release baseline.
- Strict separation of access tokens and track-stream tokens.
- Android authentication-backup and exported playback-service review.
- GitHub CI for backend, Web, Android, migrations, and production Compose.
- Web playback event capture, durable pending-event retry, and idempotent sync.
- A minimal recent-playback API and Web view.
- Immediate like, tired, and not-today feedback from active Web and Android
  playback surfaces.
- Server-side library query/pagination and operational recovery work in later
  V2.6 sprints.
- Incremental testability and UI structure improvements after behavior is
  protected.

Out of scope:

- Multi-user product expansion.
- Embeddings, ML ranking, audio analysis, BPM, vocal, or mood detection.
- Automatic Bilibili download or arbitrary remote media download.
- Smart playlists, automatic playlist generation, or cross-device queue sync.
- Native Windows client.
- Broad React, Compose, Media3, database, or deployment framework rewrites.

## Delivery Rules

- Implement vertical slices that each leave the repository usable.
- Add or update tests in the same slice as behavior changes.
- Preserve backend ownership checks and existing client request compatibility.
- Keep playback queue state client-local; V2.6 does not add backend queues.
- Treat playback and feedback event IDs as idempotency keys.
- Do not let telemetry failure stop audio playback.
- Do not store access tokens, stream tokens, or media paths in event error text.
- Record automated and manual verification in the V2.6 acceptance document.
- Commit each completed vertical slice separately.

## P0: Release Baseline And Security

P0 blocks Sprint 1 feature work from being considered complete. Small Sprint 1
implementation may proceed in parallel locally, but no V2.6 acceptance can be
claimed until every P0 gate passes.

### P0.1 Deterministic Time-Dependent Tests

Goal: remove wall-clock expiry from the library-report test suite.

Implementation:

- Stop combining fixed June 2026 fixture timestamps with the real current
  clock.
- Exercise `build_library_organization_report(..., now=...)` directly for
  service time-boundary behavior, or override the route clock through an
  injectable dependency.
- Cover the exact 30-day threshold and both sides of the threshold.
- Keep API coverage for current-user scoping and response shape.

Acceptance:

- The test remains correct regardless of the calendar date on which it runs.
- The full backend suite passes.

### P0.2 Token Purpose Isolation

Goal: a token issued for one purpose must not authenticate another purpose.

Implementation:

- Add an explicit access-token purpose claim.
- Require access-token parsing to validate the access purpose.
- Continue requiring stream purpose and exact track id for stream tokens.
- Add negative tests proving a stream token cannot call normal authenticated
  APIs and an access token cannot be treated as a stream query token.
- Document that existing sessions may need to sign in again after deployment.

Acceptance:

- Access and stream tokens are cryptographically signed and purpose-scoped.
- Invalid-purpose, expired, malformed, and wrong-track tokens return 401.

### P0.3 Android Local Data And Media Service Security

Goal: avoid backing up bearer credentials and make media-service exposure an
explicit product decision.

Implementation:

- Disable application backup, or add backup/data-extraction rules that exclude
  auth DataStore, cached media, and pending event data.
- Review whether Easy Music needs third-party controller discovery. If not,
  keep the playback service non-exported. If it does, require an appropriate
  permission or explicit Media3 controller allowlist.
- Keep notification, lock-screen, headset, and app playback working.
- Resolve or intentionally document the Android lint security warning.

Acceptance:

- Auth tokens are excluded from Android backup/restore.
- Android lint has no unresolved exported-service security warning.
- Existing Media3 control smoke still passes.

### P0.4 CI And Release Governance

Goal: every branch and pull request has a repeatable release signal.

Implementation:

- Add GitHub Actions jobs for backend tests and Alembic head validation.
- Add Web typecheck/build and V2.6 Web tests.
- Add Android test/build/lint with Java 17.
- Validate production Compose with the committed example environment.
- Use dependency caches without committing build outputs.
- Document the promotion flow from the V2.6 branch to `develop`, then `main`,
  and a release tag after acceptance.

Acceptance:

- The workflow is syntactically valid and mirrors locally runnable commands.
- Local equivalents pass before merge.
- No release is tagged while the backend suite is red.

### P0.5 Documentation Truth Pass

Goal: current docs must describe the current deployed and implemented system.

Implementation:

- Mark the first Ubuntu production smoke as complete in current-status docs.
- Replace the old “next UI-only pass” direction with V2.6.
- Remove API draft entries that do not exist, unless implemented in V2.6.
- Stop claiming automatic embedded-cover extraction until it exists.
- Document stream-token purpose isolation and current playback-event clients.
- Keep historical task and acceptance records unchanged when they accurately
  describe past milestones.

Acceptance:

- README, roadmap, architecture, development, deployment, AGENTS, tasks, and
  acceptance docs do not contradict one another about current status.

## Sprint 1: Listening Event And Feedback Closure

### V2.6.1 Web Playback Event Client

Goal: model the existing backend playback-event contract in Web.

Implementation:

- Add typed Web playback-event request/response models.
- Add an authenticated API wrapper for `POST /api/playback-events`.
- Generate stable client event IDs.
- Add a small pure pending-event store with bounded local persistence.
- Never persist bearer or stream tokens with pending events.
- Classify accepted, duplicate, failed, retryable, and unauthorized results.
- Add unit tests for serialization, deduplication, persistence limits, and
  partial server responses.

Acceptance:

- Pending events survive a page refresh.
- Duplicate delivery does not duplicate backend rows.
- Telemetry errors do not block player controls.

### V2.6.2 Web Player Event Recording

Goal: Web listening must affect the same history used by Android.

Implementation:

- Record `play`, `pause`, `resume`, `seek`, `skip`, and `complete` from the
  shared Web playback queue player.
- Record skip when moving away from an unfinished current item.
- Include position, known duration, occurrence time, and `client="web"`.
- Avoid duplicate play/pause events caused by React effects or stream reloads.
- Flush pending events after login, after a successful event send, on online
  transitions, and best-effort during page lifecycle changes.
- Add focused tests around recorder state transitions.

Acceptance:

- A Web play-through appears in backend playback events.
- Pause/resume/seek/skip/complete produce sensible positions and no event loop.
- Queue next/previous and failed-track auto-advance remain functional.

### V2.6.3 Recent Playback API

Goal: expose a safe, current-user-scoped view of recent listening.

Implementation:

- Add `GET /api/playback-events/recent`.
- Return recent unique tracks ordered by their latest meaningful playback
  event, with last-played time and playback count.
- Support a bounded `limit`; do not expose internal media paths beyond the
  existing Track response contract.
- Define meaningful history events explicitly and keep ordering deterministic.
- Add ownership, limit, empty-state, ordering, and aggregation tests.

Acceptance:

- Another user's history and tracks are never returned.
- Repeated events for one track produce one recent item with the correct count.
- Empty history returns an empty list.

### V2.6.4 Web Recent Listening View

Goal: give the owner a minimal, useful history surface.

Implementation:

- Add a protected `/history` route and navigation entry.
- Show title, artist, last-played time, play count, playback action, and queue
  actions.
- Provide loading, empty, unauthorized, and error states.
- Keep the view read-only; deleting playback history is out of scope.

Acceptance:

- Recent Web and Android plays appear in one ordered list.
- Tracks can be played or queued from the list.
- Web typecheck, build, and focused tests pass.

### V2.6.5 Active Playback Quick Feedback

Goal: fatigue feedback should be available at the moment the owner experiences
it, not only inside a recommendation result card.

Implementation:

- Add like, tired, and not-today actions to the active Web player.
- Add the same actions to Android Now Playing.
- Reuse `POST /api/feedback-events` and existing idempotent client IDs.
- Use empty context tag arrays for global playback feedback; keep
  not-suitable-for-context inside recommendation flows where context exists.
- Reflect accepted state and errors without interrupting playback.
- Refresh local liked/cooldown display when practical without requiring queue
  reconstruction.

Acceptance:

- Like updates the track's liked state.
- Tired sets the default cooldown.
- Not-today excludes the track from same-day recommendations.
- Repeated taps are disabled while a request is in flight.
- Web and Android failure states are visible and playback continues.

### V2.6.6 Sprint 1 Cross-Client Verification

- Run focused backend playback/feedback/recommendation tests.
- Run Web unit tests, typecheck, and build.
- Run Android feedback/recommendation tests and full build/lint.
- Manually play one track from Web and one from Android, then verify both in
  recent history.
- Verify Web and Android quick feedback changes subsequent recommendation
  results.
- Record any manual checks that cannot run locally as pending acceptance items.

## Sprint 2: Library Scale And Processing Recovery

### V2.6.7 Server-Side Library Query

- Add backward-compatible pagination, sorting, and search to `GET /api/tracks`.
- Search title, artist, album, and tag names.
- Filter by status, liked, content type, and tag ids.
- Preserve owner scoping and stable ordering.
- Update Web and Android clients without breaking current list behavior.

### V2.6.8 Web And Android Library Discovery

- Replace title-only client filtering with server query state.
- Remove the extra filter-mode switch requirement.
- Add explicit sort and filter summaries with clear reset actions.
- Preserve selection behavior across visible result refreshes where safe.

### V2.6.9 Processing Retry And Stuck-Job Recovery

- Add an owner-scoped retry action for failed audio/video processing jobs.
- Define stale `running` recovery using a bounded timeout and explicit status.
- Prevent concurrent duplicate active jobs.
- Show retry state and safe errors in Web upload/import/track surfaces.

### V2.6.10 Media Storage Consistency

- Delete superseded cover files after a successful cover replacement.
- Prevent partial media deletion from restoring a database row that points to
  already deleted files; use a staged/tombstone or equivalent safe workflow.
- Add a read-only orphan/missing-media consistency report before any cleanup
  action is considered.
- Never bulk-delete media automatically in V2.6.

## Sprint 3: Production Operations Closure

### V2.6.11 Certificate Renewal Runbook

- Document and automate the operator's DNS-validation renewal path.
- Copy renewed files atomically and reload Caddy only after certificate checks.
- Record expiry inspection and rollback commands.

### V2.6.12 Backup Retention And Restore Drill

- Implement opt-in retention for verified backup files only.
- Never recursively clean arbitrary directories.
- Add backup integrity checks and record a real restore drill.
- Document off-host backup as an operator recommendation.

### V2.6.13 Minimal Operational Alerts

- Define checks for disk pressure, unhealthy services, stale/failed jobs,
  certificate expiry, and failed backups.
- Prefer simple operator-visible scripts/log checks over a new observability
  platform in this milestone.

## Sprint 4: Testability-Driven UI Maintenance

### V2.6.14 Web Behavior Test Foundation

- Keep Vitest or an equivalent lightweight runner.
- Extract and test the playback queue reducer as a pure module.
- Cover auth restoration, library batch operations, recent history, quick
  feedback, and playback-event transitions at the appropriate level.

### V2.6.15 Web Component Boundaries

- Split oversized page orchestration into flow-specific hooks and components.
- Do not replace the router, state library, or CSS system solely for style.
- Preserve error, empty, loading, disabled, and processing states.

### V2.6.16 Android Navigation And Composition Boundaries

- Remove repeated scaffold wiring from `AppNavGraph`.
- Move dependency construction out of large screen composables incrementally.
- Split recommendation, playlist, library, and now-playing UI by stable state
  and action boundaries.
- Keep Media3 session/service ownership unchanged unless separately specified.

### V2.6.17 Flow-Based UI Polish

- Polish only flows with recorded daily-use friction.
- Prioritize discoverability of search, queue, history, feedback, processing
  recovery, and offline state.
- Verify typical phone width and Web desktop/mobile layouts.

## Milestone Completion Criteria

- Every P0 gate is accepted.
- Web and Android listening contribute to one backend history.
- Quick fatigue feedback works from active playback on both clients.
- V2.6 automated checks are green in CI and locally.
- Production renewal, backup, restore, and upgrade paths are operationally
  documented.
- No current-status document claims an implemented feature is missing or an
  unimplemented feature exists.

