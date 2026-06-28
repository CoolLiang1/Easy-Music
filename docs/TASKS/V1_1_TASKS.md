# V1.1 Small Enhancement Tasks

This document splits V1.1 into executable small enhancement tasks. V1.1 starts
from the accepted MVP through Phase 7: backend, Web, Android, deployment
artifacts, Recommendation V1, and AI Assistant V1 are already implemented.

V1.1 is not a new product phase and not a broad rewrite. It should improve
daily owner workflows in small, reversible slices while preserving the accepted
MVP architecture.

## Current Inputs Available Before V1.1

Accepted behavior available before V1.1:

- Backend FastAPI API with auth, tracks, tags, uploads, media processing,
  streaming, playback events, feedback events, structured recommendations,
  AI intent parsing, AI recommendation composition, and AI tag suggestions.
- PostgreSQL schema and Alembic migrations for users, tracks, tags,
  track-tags, playback events, feedback events, recommendation data, and media
  processing state.
- Worker flow for original-file preservation, metadata extraction, playback
  MP3 generation, cover extraction, and processing status updates.
- Web management console with login, upload, library, track editing, tag
  management, playback, structured recommendation testing, AI Assistant, and
  AI tag suggestion UI.
- Android listening client with login, library, track detail, online playback,
  Media3 background playback, manual offline cache, feedback/playback-event
  sync, structured recommendations, and natural-language AI recommendations.
- Production deployment artifacts and docs through Phase 7.

Relevant existing modules for V1.1 planning:

- Backend upload/media/track:
  - `backend/app/api/routes/uploads.py`
  - `backend/app/api/routes/tracks.py`
  - `backend/app/services/uploads.py`
  - `backend/app/services/tracks.py`
  - `backend/app/media/metadata.py`
  - `backend/app/media/ffmpeg.py`
  - `backend/app/media/paths.py`
  - `backend/app/media/storage.py`
  - `backend/app/models/track.py`
  - `backend/app/models/track_tag.py`
  - `backend/app/schemas/track.py`
- Backend recommendation:
  - `backend/app/api/routes/recommendations.py`
  - `backend/app/services/recommendations.py`
  - `backend/app/models/playback_event.py`
  - `backend/app/models/feedback_event.py`
- Web upload/library:
  - `web/src/pages/UploadPage.tsx`
  - `web/src/components/UploadForm.tsx`
  - `web/src/components/UploadResultList.tsx`
  - `web/src/pages/LibraryPage.tsx`
  - `web/src/components/TrackTable.tsx`
  - `web/src/pages/TrackDetailPage.tsx`
  - `web/src/api/tracks.ts`
  - `web/src/types/track.ts`
- Android impact areas:
  - `android/app/src/main/java/com/easymusic/app/library/`
  - `android/app/src/main/java/com/easymusic/app/recommendation/`
  - `android/app/src/main/java/com/easymusic/app/player/`
  - `android/app/src/main/java/com/easymusic/app/cache/`
  - `android/app/src/main/java/com/easymusic/app/MainActivity.kt`

## V1.1 Scope

Prioritized candidate enhancements:

1. Duplicate detection.
2. Better upload progress.
3. Batch tag editing.
4. Library organization reports.
5. Cover editing.
6. Advanced recommendation explanations.
7. Recently revived tracks.
8. Android home screen shortcuts.

V1.1 scope is limited to small owner-facing improvements that build on accepted
MVP APIs and architecture. Each task should be independently shippable, with
focused tests and documentation updates.

## V1.1 Out Of Scope

- Multi-user expansion beyond preserving existing ownership checks.
- Public sharing, social discovery, comments, reactions, or public playlists.
- Full ML recommendation systems, embeddings, vector databases, or training
  platforms.
- Automatic Bilibili downloading or automatic video-to-audio import.
- Full-library automatic offline sync.
- Rewriting Android Media3 playback, MediaSession, Now Playing, manual cache,
  or playback-event sync.
- Rewriting the Web app layout or replacing the current React/Vite stack.
- Rewriting upload/transcode processing unless a task explicitly adds a small
  compatibility hook.
- Production deployment redesign, CI/CD, Kubernetes, or monitoring dashboards.
- Bulk destructive cleanup, generated artifact edits, committed secrets, or
  local media/database state.

## Execution Principles

- Work on one V1.1 task at a time. Do not implement later candidate features
  early.
- Keep backend routes thin and put business rules in existing services or small
  new service modules.
- Preserve API compatibility for existing Web and Android clients. If a track
  response changes, update all dependent client types and tests.
- Keep duplicate detection advisory by default. Uploads should not silently
  delete or merge existing tracks.
- Preserve media-storage safety: no path traversal, no exposed internal paths
  beyond existing documented responses, and no automatic deletion of originals
  or playback files.
- Prefer incremental Web controls over broad layout rewrites.
- Treat Android as affected only when a backend response or user workflow
  reaches the listening client. Web-only management features may not require
  Android changes.
- Add migrations only when a task needs durable schema. Do not add speculative
  columns for future V1.1 candidates.
- Tests should match risk: backend service/API tests for contract and data
  behavior, Web type/build checks for UI work, Android JVM/build checks for
  changed Android contracts, and manual smoke checks for user-facing flows.
- Update docs when a V1.1 task changes local workflow, API smoke flows,
  architecture, or acceptance status.

## Candidate Feature Goals And Boundaries

### 1. Duplicate Detection

Goal:

- Detect likely duplicate uploads and library duplicates using file fingerprints
  and metadata signals, then present clear choices to the Web user.

Boundaries:

- Must be advisory unless a task explicitly adds a user-confirmed action.
- Must not automatically delete, overwrite, merge, or hide tracks.
- Should start with exact or near-exact duplicate signals that are stable and
  testable before adding fuzzy heuristics.
- Android is likely read-only affected only if duplicate fields are added to
  shared track responses. Web upload/library is the primary UI surface.

### 2. Better Upload Progress

Goal:

- Make upload and processing state easier to understand in Web upload/library
  flows, including client upload progress, server processing state, and failure
  messages.

Boundaries:

- Do not rewrite the worker architecture.
- Do not require WebSocket support unless a later task explicitly chooses it.
  Polling existing track status or upload result state is acceptable.
- Android is not affected unless backend track status response changes.

### 3. Batch Tag Editing

Goal:

- Let the Web user select multiple tracks and add/remove tags in one confirmed
  action.

Boundaries:

- Must preserve tag ownership and group validation.
- Must be explicit and reversible through normal manual edits; no automatic
  AI bulk tagging in this feature.
- Android is not expected to need changes unless new API response shapes affect
  shared track models.

### 4. Library Organization Reports

Goal:

- Provide owner-facing reports that identify library cleanup opportunities:
  untagged tracks, missing metadata, failed processing, duplicate candidates,
  stale cooldowns, and rarely played ready tracks.

Boundaries:

- Reports should not modify data.
- Keep reports operational and compact. Do not add an analytics dashboard,
  charts framework, or long-term metrics pipeline in V1.1.
- Android is not expected to need changes.

### 5. Cover Editing

Goal:

- Let the Web user inspect and replace a track cover image with an explicitly
  uploaded image.

Boundaries:

- Must keep media path safety and content-type validation.
- Must not require regenerating playback audio.
- Must not auto-fetch covers from public services.
- Android may be affected if cover URLs or cache behavior are added to shared
  track payloads.

### 6. Advanced Recommendation Explanations

Goal:

- Make recommendation reasons more useful by exposing structured explanation
  parts: matches, boosts, penalties, exclusions considered, and feedback impact.

Boundaries:

- Must preserve rule-based ranking. AI may summarize only after the rule
  explanation exists and must not change ranking.
- Do not add embeddings, ML scoring, or hidden model-driven selection.
- Web and Android recommendation UI may both be affected.

### 7. Recently Revived Tracks

Goal:

- Surface ready tracks that have not been played recently but may be worth
  revisiting, using playback history and tags.

Boundaries:

- This is a discovery/reporting slice, not a new recommendation engine.
- Must respect ownership and ready status.
- Must not auto-play, auto-cache, or override recommendation feedback rules.
- Android may be affected if the revived list becomes a listening entry point.

### 8. Android Home Screen Shortcuts

Goal:

- Add Android launcher shortcuts for common entry points such as Library,
  Recommendation Home, Cached Tracks, or Now Playing.

Boundaries:

- Android-only.
- Must not change backend contracts.
- Must not rewrite navigation or playback.
- Shortcuts should fail gracefully when the user is signed out.

## Duplicate Detection Detailed Task Split

Duplicate detection is the first V1.1 priority and should be implemented in
small compatibility steps.

## Task V1.1.1: Duplicate Detection Data Model And Fingerprint Storage

### Goal

Persist stable duplicate-detection signals for uploaded tracks without changing
current upload behavior.

### Directories

- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/app/media/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/models/track.py`
- `backend/app/schemas/track.py`
- `backend/app/services/uploads.py`
- `backend/app/services/tracks.py`
- `backend/app/media/storage.py`
- New duplicate helper module if useful, such as
  `backend/app/services/duplicates.py`
- New Alembic migration under `backend/alembic/versions/`
- New or updated backend tests under `backend/tests/`
- `docs/ARCHITECTURE.md` if durable model fields are added

### Acceptance Criteria

- Track records can store one or more stable duplicate signals, such as:
  - original file size
  - original file hash
  - normalized metadata key derived from title, artist, album, and duration
  - optional playback file hash if practical after processing
- Signal generation is scoped to the authenticated user's own tracks.
- Upload and worker processing still create and process tracks as before.
- Existing track responses remain compatible. Newly exposed fields are optional
  or documented.
- Hashing does not expose local filesystem paths or secret data.
- Backend tests cover migration model fields, hash generation for saved files,
  missing-file behavior, and unchanged upload success behavior.
- Documentation explains that duplicate signals are advisory and do not delete
  or merge tracks.

### Do Not

- Do not block uploads because a duplicate signal exists.
- Do not delete, merge, overwrite, or hide duplicate tracks.
- Do not add Web or Android UI in this task.
- Do not perform fuzzy audio fingerprinting or waveform analysis.
- Do not hash arbitrary repository files; only explicit uploaded media paths
  handled by the upload/media service.

## Task V1.1.2: Backend Duplicate Candidate Service

### Goal

Add a backend service that finds exact and likely duplicate candidates using
the stored duplicate signals.

### Directories

- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/tests/`

### Main Files

- `backend/app/services/duplicates.py`
- `backend/app/schemas/duplicate.py`
- `backend/app/models/track.py`
- New backend tests under `backend/tests/`

### Dependencies

- Task V1.1.1.

### Acceptance Criteria

- Service considers only the authenticated user's tracks.
- Service can find exact duplicate candidates by file hash when available.
- Service can find likely duplicates by conservative metadata signals, such as
  matching normalized title/artist plus close duration.
- Service returns grouped duplicate candidates with:
  - group id or stable grouping key
  - candidate track ids
  - confidence or reason
  - match type, such as `exact_file` or `metadata_duration`
- Service ignores tracks that lack enough data for a confident match.
- Service does not mutate tracks.
- Backend tests cover exact hash match, metadata/duration match, insufficient
  data, cross-user isolation, failed/processing track behavior, and stable
  reason fields.

### Do Not

- Do not expose an API route in this task unless the implementation pattern
  requires a tiny internal smoke route. Prefer service tests first.
- Do not use AI for duplicate detection.
- Do not add destructive actions.
- Do not add broad analytics reports yet.

## Task V1.1.3: Backend Duplicate Candidate API

### Goal

Expose duplicate candidates through a small authenticated API for Web upload
and library flows.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `docs/`

### Main Files

- New route module if useful, such as `backend/app/api/routes/duplicates.py`
- `backend/app/api/router.py`
- `backend/app/schemas/duplicate.py`
- `backend/app/services/duplicates.py`
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Task V1.1.2.

### Acceptance Criteria

- Backend exposes an authenticated duplicate-candidate endpoint, for example
  `GET /api/tracks/duplicates`.
- Endpoint returns duplicate groups for the current user only.
- Endpoint can optionally filter by one uploaded or existing `track_id`.
- Response includes candidate tracks using a compact track payload or existing
  track response shape, plus match reason and confidence.
- Endpoint returns an empty array when no candidates exist.
- Endpoint does not mutate, delete, merge, or update tracks.
- Backend tests cover auth required, current-user isolation, empty result,
  exact duplicate result, likely duplicate result, and invalid `track_id`.
- Manual API smoke test is documented.

### Do Not

- Do not add merge or delete endpoints in this task.
- Do not change `DELETE /api/tracks/{track_id}` behavior.
- Do not expose internal file paths.
- Do not add Android UI.

## Task V1.1.4: Web Upload Duplicate Warning

### Goal

Show duplicate warnings in the Web upload flow after upload/processing creates
or updates a track, without blocking the user.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`

### Main Files

- `web/src/api/tracks.ts` or new `web/src/api/duplicates.ts`
- `web/src/types/track.ts` or new `web/src/types/duplicate.ts`
- `web/src/pages/UploadPage.tsx`
- `web/src/components/UploadResultList.tsx`
- `web/src/components/UploadForm.tsx` only if needed

### Dependencies

- Task V1.1.3.

### Acceptance Criteria

- After a successful upload result, Web can request duplicate candidates for
  the new track when a track id is available.
- Upload result list shows a clear advisory warning for exact or likely
  duplicate candidates.
- Warning includes enough information to inspect candidates: title, artist,
  album or duration if available, and match reason.
- User can continue normal upload and library workflows.
- Duplicate warning does not automatically delete, merge, or overwrite tracks.
- Loading, no-duplicate, unauthorized, and backend-error states are handled
  without crashing the upload page.
- Existing upload progress/result behavior remains compatible.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not block upload completion.
- Do not add destructive duplicate actions.
- Do not rewrite the upload form.
- Do not add Android changes.

## Task V1.1.5: Web Library Duplicate Review View

### Goal

Add a Web library view or filter that lets the user review duplicate groups
across the whole library.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/layout/` or routes only if a new protected page is used

### Main Files

- `web/src/api/duplicates.ts`
- `web/src/types/duplicate.ts`
- `web/src/pages/LibraryPage.tsx` or new duplicate review page
- `web/src/components/TrackTable.tsx`
- New duplicate group component if useful

### Dependencies

- Task V1.1.3.

### Acceptance Criteria

- Web user can review duplicate groups from Library or a protected duplicate
  review route.
- Groups show exact and likely match reasons.
- Each candidate links or navigates to the existing Track Detail page.
- UI clearly states that duplicate detection is advisory.
- No destructive action is required for this task.
- Existing Library search/list, Track Detail, Tags, Upload, Web playback, and
  recommendation pages continue to work.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not add merge/delete actions unless split into a later explicit task.
- Do not hide duplicates from the normal library list.
- Do not add report charts.
- Do not change Android.

## Task V1.1.6: Duplicate Detection Regression And Acceptance Notes

### Goal

Record duplicate-detection verification and keep future agents aligned on
advisory behavior.

### Directories

- `docs/`
- `backend/tests/`
- `web/`

### Main Files

- New acceptance note under `docs/ACCEPTANCE/` or another existing acceptance
  location, if this repository keeps V1.1 acceptance there.
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`
- `docs/ARCHITECTURE.md` if durable model fields were added

### Dependencies

- Tasks V1.1.1 through V1.1.5.

### Acceptance Criteria

- Acceptance note records backend and Web checks for duplicate detection.
- Backend tests cover duplicate signal storage, service grouping, and API
  responses.
- Web `npm run typecheck` passes.
- Web `npm run build` passes.
- Manual Web smoke verifies:
  - uploading a unique file shows no duplicate warning
  - uploading an exact duplicate shows an advisory duplicate warning
  - library duplicate review shows grouped candidates
  - opening candidate Track Detail still works
  - no duplicate workflow deletes or merges tracks automatically
- Documentation states Android is not changed unless shared track response
  fields required Android model updates.

### Do Not

- Do not mark duplicate detection accepted without Web upload and library
  review smoke checks.
- Do not add merge/delete behavior while documenting advisory duplicate
  detection.
- Do not commit media files used for manual duplicate testing.

## Other V1.1 Candidate Tasks

The following tasks are intentionally thinner than duplicate detection. Split
them further before implementation if local code inspection shows a larger
blast radius.

## Task V1.1.7: Better Upload Progress

### Goal

Improve Web visibility into client upload progress and backend processing
state.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`
- `backend/tests/`
- `docs/`

### Acceptance Criteria

- Web upload UI shows per-file client upload progress where the browser API
  supports it.
- Web clearly distinguishes uploaded, processing, ready, and failed states.
- Web can refresh or poll processing status for recently uploaded tracks
  without requiring a full page reload.
- Backend exposes or preserves enough track status and error detail for the UI
  to explain common failures.
- Existing upload success, worker processing, library listing, and playback
  behavior remain compatible.
- Backend tests cover any changed status/error contract.
- `npm run typecheck` and `npm run build` pass.
- Documentation updates any changed smoke-test workflow.

### Do Not

- Do not rewrite worker processing.
- Do not require WebSockets.
- Do not add duplicate detection behavior unless the duplicate tasks are the
  active task.

## Task V1.1.8: Batch Tag Editing

### Goal

Let Web users select multiple tracks and add or remove tags in a single
confirmed operation.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`
- `docs/`

### Acceptance Criteria

- Backend provides an authenticated batch tag update endpoint or a clearly
  documented use of existing per-track update calls.
- Batch operation validates track ownership and tag ownership.
- Batch operation can add selected tags to all selected tracks.
- Batch operation can remove selected tags from all selected tracks.
- Partial failure behavior is explicit and test-covered.
- Web Library supports selecting multiple tracks and confirming add/remove tag
  operations.
- Web shows loading, success, partial failure, and empty-selection states.
- Existing single-track editing continues to work.
- Backend tests cover auth, ownership, add, remove, invalid tag, invalid track,
  and partial failure behavior.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not auto-generate or AI-assign tags in batch.
- Do not change tag groups or taxonomy rules.
- Do not delete tracks.
- Do not add Android UI unless a shared API contract change requires model
  compatibility updates.

## Task V1.1.9: Library Organization Reports

### Goal

Provide read-only Web reports that help the owner organize the library.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`
- `docs/`

### Acceptance Criteria

- Backend exposes authenticated read-only report data for at least:
  - untagged ready tracks
  - tracks missing title, artist, album, or cover
  - failed or still-processing tracks
  - duplicate candidates if duplicate detection is already complete
  - rarely played or never played ready tracks
- Reports are scoped to the current user.
- Reports do not modify any track, tag, playback, or feedback data.
- Web displays report sections with links to Track Detail.
- Empty states are clear.
- Backend tests cover report queries and ownership isolation.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not add charting libraries unless a concrete report requires them.
- Do not add automatic cleanup actions.
- Do not implement a long-term analytics pipeline.
- Do not use AI to decide organization status.

## Task V1.1.10: Cover Editing

### Goal

Allow the Web user to replace a track cover image through an explicit upload
and confirmation flow.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/app/media/`
- `backend/tests/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`
- `android/app/src/main/java/com/easymusic/app/library/` if shared track
  payload changes affect Android
- `docs/`

### Acceptance Criteria

- Backend exposes an authenticated cover update endpoint or extends the track
  update flow with explicit image upload support.
- Backend validates track ownership.
- Backend validates image content type and size.
- Backend stores covers under the configured media cover location.
- Backend does not expose unsafe internal paths.
- Updating a cover does not regenerate playback audio or modify original audio.
- Web Track Detail can preview current cover, choose a new image, upload it,
  and see the updated cover after refresh.
- Android model compatibility is preserved if cover response fields change.
- Backend tests cover auth, ownership, valid image, invalid content type,
  oversized file, and path safety.
- Web `npm run typecheck` and `npm run build` pass.
- Android `.\gradlew.bat test` or build is run if Android models change.

### Do Not

- Do not auto-fetch cover art from internet services.
- Do not edit audio file embedded artwork in V1.1 unless split into a separate
  explicit task.
- Do not delete old cover files in bulk. If cleanup is needed, stop and ask
  the user because repository rules prohibit bulk deletion.

## Task V1.1.11: Advanced Recommendation Explanations

### Goal

Expose structured recommendation explanation details while preserving existing
rule-based ranking behavior.

### Directories

- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/api/routes/`
- `backend/tests/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/types/`
- `android/app/src/main/java/com/easymusic/app/recommendation/`
- `docs/`

### Acceptance Criteria

- Backend recommendation responses include structured explanation parts, such
  as matched tags, boosts, penalties, and exclusion/avoidance reasons.
- Existing `reason` text remains available or is replaced only with documented
  compatibility updates across Web and Android.
- Ranking score order does not change unless the task explicitly documents a
  small scoring bug fix.
- Web recommendation UI can display structured explanations without hiding the
  concise reason.
- Android recommendation UI can parse the response and either display the new
  details or safely ignore optional fields.
- Backend tests prove explanations reflect cooldown, recent playback,
  not-today, not-suitable, skip, liked, and tag-match behavior.
- Web type/build checks pass.
- Android tests/build pass if Android model or UI changes.

### Do Not

- Do not let AI choose tracks.
- Do not change feedback penalties without a separate ranking task.
- Do not add embeddings, vector search, or audio-feature scoring.

## Task V1.1.12: Recently Revived Tracks

### Goal

Surface ready tracks that have gone quiet and may be worth revisiting.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`
- `android/app/src/main/java/com/easymusic/app/recommendation/` if Android
  receives the feature
- `docs/`

### Acceptance Criteria

- Backend computes recently revived candidates from ready tracks and playback
  history.
- The query is current-user scoped.
- Tracks with no playback history can be handled through a documented rule,
  such as "never played" section or lower-priority revived candidates.
- Cooldown and strong negative feedback are respected or explicitly displayed
  as reasons to suppress a track.
- Web shows a read-only revived-tracks section with links to Track Detail or
  existing playback controls.
- If Android receives the feature, selecting a revived track uses existing
  player handoff and cached playback source selection.
- Backend tests cover never played, long-unplayed, recently played, cooldown,
  feedback suppression, and ownership isolation.
- Web type/build checks pass.
- Android tests/build pass if Android changes.

### Do Not

- Do not build a new recommendation engine.
- Do not auto-play or auto-cache revived tracks.
- Do not change playback-event sync.
- Do not bypass cooldown or not-today feedback.

## Task V1.1.13: Android Home Screen Shortcuts

### Goal

Add Android launcher shortcuts for common Easy Music entry points.

### Directories

- `android/app/src/main/`
- `android/app/src/main/java/com/easymusic/app/`
- `android/app/src/main/java/com/easymusic/app/ui/`
- `android/app/src/main/java/com/easymusic/app/library/`
- `android/app/src/main/java/com/easymusic/app/recommendation/`
- `android/app/src/test/`
- `docs/`

### Acceptance Criteria

- Android exposes launcher shortcuts for documented entry points, such as
  Library, Recommendation Home, Cached Tracks, or Now Playing.
- Shortcuts route through existing navigation and auth recovery.
- If the user is signed out, shortcut launch sends the user to login or the
  existing authenticated entry flow.
- Shortcuts do not create a new player, MediaSession, or playback service.
- Shortcuts do not change backend API contracts.
- Android JVM tests cover shortcut intent construction or navigation handling
  where practical.
- Android `.\gradlew.bat test` and `.\gradlew.bat build` pass.
- Manual emulator/device smoke verifies shortcuts open the expected screens.

### Do Not

- Do not add backend code.
- Do not rewrite app navigation.
- Do not change playback behavior.
- Do not add automatic background playback from a launcher shortcut unless a
  later task explicitly requests it.

## Suggested V1.1 Test Range

Backend:

- Run focused tests for the changed service/API first.
- Run full backend pytest when a task touches shared track responses, upload
  processing, recommendation responses, or migrations:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

Web:

- Run the existing checks for any Web change:

```powershell
cd web
npm run typecheck
npm run build
```

- For upload, duplicate review, batch tag editing, reports, and cover editing,
  perform a browser smoke test with the local backend when practical.

Android:

- Run Android checks if shared API models, recommendation responses, cover
  fields, navigation, shortcuts, playback handoff, or cached playback behavior
  change:

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat build
```

- Use emulator/device verification for launcher shortcuts, playback handoff,
  cached playback, notification behavior, or any UI flow that cannot be proven
  through JVM tests.

Docs:

- Update `docs/API_MANUAL_TESTING.md` when an API smoke flow changes.
- Update `docs/DEVELOPMENT.md` when local workflow or verification changes.
- Update `docs/ARCHITECTURE.md` when durable schema, module boundaries, or
  media-storage behavior changes.
- Add or update V1.1 acceptance notes after implementation tasks are actually
  verified.

## V1.1 Completion Acceptance

V1.1 is complete when the selected V1.1 tasks have been implemented and
accepted. At minimum, if V1.1 ships only the current top-priority slice,
Duplicate Detection is complete when:

1. Backend persists duplicate signals for uploaded tracks.
2. Backend can group exact and likely duplicate candidates for the current
   user.
3. Backend exposes duplicate candidates through an authenticated read-only API.
4. Web upload flow shows advisory duplicate warnings.
5. Web library flow lets the user review duplicate groups.
6. No duplicate workflow automatically deletes, merges, overwrites, or hides
   tracks.
7. Relevant backend and Web automated checks pass.
8. Manual Web smoke confirms unique upload, duplicate upload warning, duplicate
   review, and Track Detail navigation.
9. Documentation records the implemented scope and any Android impact.

## General Codex Prompt For Each V1.1 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
Please execute docs/TASKS/V1_1_TASKS.md Task V1.1.x: <task title>.

Read first:
- AGENTS.md
- README.md
- docs/TASKS/V1_1_TASKS.md
- docs/ROADMAP.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT.md
- docs/API_MANUAL_TESTING.md if the task changes or verifies API flows
- The existing backend / web / android files listed in the task's Directories
  and Main Files sections

Requirements:
- Complete only the current task. Do not implement later V1.1 candidate
  features early.
- Preserve existing MVP behavior across upload, media processing, Web library,
  Android playback/cache, Recommendation V1, and AI Assistant V1 unless the
  current task explicitly changes a contract.
- Keep duplicate detection advisory unless the current task explicitly adds a
  user-confirmed action. Do not auto-delete, auto-merge, overwrite, or hide
  tracks.
- Maintain backend ownership checks and path traversal protections.
- Do not hard-code production hosts, secrets, bearer tokens, real API keys,
  private local paths, or media-library contents.
- Do not commit .env files, build outputs, cache directories, virtual
  environments, node_modules, APKs, database files, or media files.
- Do not use bulk or recursive deletion commands. If a file must be deleted,
  delete only one explicit path at a time; if bulk deletion seems necessary,
  stop and ask the user to handle it manually.
- Run the smallest relevant automated checks for the current task and state
  any checks that could not be run.
- Inspect the diff before finishing.
- commit this change.
- Finished this task,tell me the suggestion of what to do next.
```
