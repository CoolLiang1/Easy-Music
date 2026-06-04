# Phase 5 Recommendation V1 Tasks

This document splits Phase 5 into executable Recommendation V1 development
tasks. Phase 5 starts from the accepted Phase 0/1 backend, accepted Phase 2 Web
management console, accepted Phase 3 Android Media3 player, and accepted Phase
4 Android offline cache.

Phase 5 is a minimal usable recommendation loop. It is not the AI Assistant
phase.

## Current Inputs Available Before Phase 5

Accepted backend APIs available before Phase 5:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/tracks`
- `POST /api/tracks/upload`
- `GET /api/tracks/{track_id}`
- `GET /api/tracks/{track_id}/stream`
- `PATCH /api/tracks/{track_id}`
- `DELETE /api/tracks/{track_id}`
- `GET /api/tags`
- `POST /api/tags`
- `PATCH /api/tags/{tag_id}`
- `DELETE /api/tags/{tag_id}`
- `POST /api/playback-events`

Current data that can support Recommendation V1:

- Ready tracks from the library.
- Track metadata and `content_type`.
- Track tags in the existing groups: `scenario`, `state`, `type`, and
  `attribute`.
- Existing `Track.liked`.
- Existing `Track.cooldown_until`.
- Phase 4 playback events, including Android online/offline playback.
- Android local cached-track state, for display and playback compatibility only.

Phase 5 needs two minimal backend additions before clients can complete the
recommendation loop:

1. A feedback-event API, because `not_today`, `not_suitable_for_context`, and
   recommendation-specific skips do not exist in the current backend.
2. A structured recommendation API, because no accepted recommendation endpoint
   exists yet.

Do not assume natural-language parsing, AI-generated explanations, a production
ML platform, or any API not introduced by the tasks below.

## Phase 5 Scope

In scope:

- Structured recommendation requests based on selected scenario, state, type,
  and attribute tags.
- Rule-based ranking over existing library data.
- Recent-play penalty from `playback_events`.
- Respect `cooldown_until`.
- Respect `not_today` and `not_suitable_for_context` feedback.
- Return one primary result and two alternatives when enough candidates exist.
- Android recommendation home using structured controls or quick tag chips.
- Web recommendation test panel using structured controls.
- Feedback actions needed by Recommendation V1.

Out of scope:

- AI Assistant.
- Natural-language intent parsing.
- AI-generated recommendation reasons.
- AI tag suggestion.
- Complex ML training, embeddings, or audio feature analysis.
- Social features, multi-user recommendations, or public discovery.
- Production deployment hardening.
- Rewriting Phase 3 Media3 playback or Phase 4 manual cache architecture.
- Automatic full-library offline sync or background music downloads.

## Recommendation V1 API Shape

Later tasks may adjust exact field names to match local code style, but the
minimum contract should stay structured and explicit:

- `POST /api/recommendations`
- Request:
  - optional `scenario_tag_ids`
  - optional `state_tag_ids`
  - optional `type_tag_ids`
  - optional `attribute_tag_ids`
  - optional `exclude_attribute_tag_ids`
  - optional `limit`, defaulting to `3`, capped at a small value
  - optional `client`, such as `android` or `web`
- Response:
  - `request_id`
  - `results`, ordered by rank
  - each result includes `rank`, `score`, `reason`, and a normal track payload
    compatible with existing client track models

Reason text in Phase 5 must be deterministic rule text, not AI text. Example:
`Matched scenario and type tags; recently played penalty applied.`

## Task 5.1: Backend Feedback Event Compatibility

### Goal

Add the smallest backend API support needed to record Recommendation V1
feedback events.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/app/services/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/feedback_events.py`
- `backend/app/api/router.py`
- `backend/app/schemas/feedback_event.py`
- `backend/app/models/feedback_event.py`
- `backend/app/services/feedback_events.py`
- New Alembic migration under `backend/alembic/versions/`
- New or updated backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Accepted Phase 1 backend auth, tracks, and tags.
- Accepted Phase 4 playback-event endpoint only as an existing pattern for
  authenticated event ingestion.

### Acceptance Criteria

- Backend exposes a documented authenticated endpoint, preferably
  `POST /api/feedback-events`.
- Request payload supports one feedback event at a time or a small batch with:
  - optional client-generated event id or idempotency key
  - `track_id`
  - `feedback_type`
  - optional structured context tag ids for scenario, state, type, and
    attribute
  - `occurred_at`
  - `client`, with Android and Web as expected values
- Supported feedback types include:
  - `like`
  - `tired`
  - `not_today`
  - `not_suitable_for_context`
  - `skip_recommendation`
- Backend validates that the track belongs to the authenticated user.
- Backend validates that any context tag ids belong to the authenticated user.
- `like` updates the existing `tracks.liked` field to `true` or records the
  event in a way the recommendation task can use.
- `tired` records feedback and applies a minimal compatible cooldown by setting
  `tracks.cooldown_until` to a default future date, such as 14 days from
  `occurred_at`, unless the implementation documents a clearer equivalent.
- Duplicate client event ids are safe to retry if idempotency is included.
- Backend tests cover auth required, ownership, context tag validation,
  successful feedback insert, `like`, `tired` cooldown behavior, and retry
  behavior if supported.
- `docs/API_MANUAL_TESTING.md` and `docs/DEVELOPMENT.md` document the local
  smoke-test request shape.

### Do Not

- Do not implement recommendation ranking in this task.
- Do not add AI Assistant endpoints.
- Do not add natural-language parsing.
- Do not add Web or Android UI.
- Do not build a general analytics dashboard.
- Do not change existing playback-event behavior.

## Task 5.2: Backend Recommendation Data Access And Ranking Rules

### Goal

Implement a focused rule-based ranking service over existing tracks, tags,
playback events, cooldowns, and feedback events.

### Directories

- `backend/app/services/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/tests/`

### Main Files

- `backend/app/services/recommendations.py`
- `backend/app/schemas/recommendation.py`
- `backend/app/models/feedback_event.py`
- `backend/app/models/playback_event.py`
- `backend/app/models/track.py`
- New or updated backend tests under `backend/tests/`

### Dependencies

- Task 5.1.
- Existing Track, Tag, TrackTag, and PlaybackEvent models.

### Acceptance Criteria

- Ranking considers only authenticated user's `ready` tracks.
- Ranking scores positive matches for requested scenario, state, type, and
  attribute tags.
- Ranking can apply negative filters or penalties for excluded attribute tags.
- Ranking boosts liked tracks modestly without making `liked` override all
  context matching.
- Ranking excludes or strongly penalizes tracks with `cooldown_until` in the
  future.
- Ranking penalizes recently played tracks using existing `playback_events`.
- Ranking excludes or strongly penalizes `not_today` feedback from the current
  day.
- Ranking penalizes `not_suitable_for_context` when the stored feedback context
  overlaps the current structured request.
- Ranking penalizes recent `skip_recommendation` feedback.
- Service returns at most three ordered results for the Phase 5 default.
- If fewer than three valid tracks exist, service returns the available results
  without fabricating placeholders.
- Each result includes deterministic reason text that names the main matched
  tags and major penalties.
- Backend unit tests cover enough scenarios to make scoring behavior
  predictable.

### Do Not

- Do not call an LLM.
- Do not implement natural-language intent parsing.
- Do not add embeddings, audio analysis, BPM, vocal detection, or ML training.
- Do not require Android cache state for backend ranking.
- Do not modify media processing or upload behavior.

## Task 5.3: Backend Recommendation API

### Goal

Expose the Recommendation V1 ranking service through a minimal authenticated
API.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/recommendations.py`
- `backend/app/api/router.py`
- `backend/app/schemas/recommendation.py`
- `backend/app/services/recommendations.py`
- New or updated backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Task 5.2.

### Acceptance Criteria

- Backend exposes `POST /api/recommendations`.
- Endpoint is authenticated.
- Request accepts structured tag ids grouped by scenario, state, type,
  attribute, and excluded attribute.
- Endpoint validates that requested tag ids belong to the authenticated user
  and match expected tag groups.
- Endpoint returns ordered recommendation results with rank, score, reason, and
  track payload compatible with existing `TrackResponse`.
- Endpoint returns an empty `results` array with a clear non-error response
  when no ready candidates match.
- Endpoint does not require a raw text prompt.
- Backend tests cover auth required, invalid tag ownership, invalid tag group,
  no candidates, successful three-result response, and reason fields.
- Manual API smoke test is documented.

### Do Not

- Do not add AI Assistant behavior.
- Do not accept or parse natural-language requests in Phase 5.
- Do not expose internal file paths beyond what existing track responses
  already expose.
- Do not add pagination, saved recommendation history UI, or analytics pages.

## Task 5.4: Android Recommendation API Client And Models

### Goal

Add Android data models and API calls for the explicit Phase 5 backend
recommendation and feedback endpoints without changing UI flow yet.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/data/`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/`
- `android/app/src/test/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/data/RecommendationApi.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/RecommendationModels.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/FeedbackApi.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/FeedbackModels.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/RecommendationRepository.kt`
- New Android JVM tests where practical

### Dependencies

- Task 5.3.
- Existing Phase 3 auth token storage and `ApiClient`.
- Existing `TrackResponse` and `TagResponse` models.

### Acceptance Criteria

- Android can call `POST /api/recommendations` with bearer authentication.
- Android parses recommendation results into existing track-compatible models.
- Android can call `POST /api/feedback-events` with bearer authentication.
- API client maps unauthorized, HTTP, network, and serialization failures using
  the existing `ApiResult` style.
- Tests cover JSON parsing for a recommendation result with three tracks and
  an empty result response.
- No Compose screen is added in this task.

### Do Not

- Do not add natural-language input.
- Do not add AI Assistant client code.
- Do not change Media3 player service.
- Do not change offline cache database schema unless a later task proves it is
  required.
- Do not trigger playback from the API client.

## Task 5.5: Android Recommendation Home Shell

### Goal

Add a Recommendation Home entry point with structured controls for choosing
scenario, state, type, and attribute tags.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/`
- `android/app/src/main/java/com/easymusic/app/ui/`
- `android/app/src/main/java/com/easymusic/app/library/data/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeScreen.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppNavGraph.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppScaffold.kt`

### Dependencies

- Task 5.4.
- Existing `GET /api/tags`.

### Acceptance Criteria

- Authenticated Android area includes navigation to Recommendation Home.
- Recommendation Home loads existing tags and groups them by `scenario`,
  `state`, `type`, and `attribute`.
- User can select zero or more tags as structured recommendation context.
- User can mark attribute tags as desired or excluded if the backend request
  supports both.
- Screen has a manual action to request recommendations.
- Loading, empty tag list, offline, unauthorized, and backend error states are
  visible.
- No recommendation request is sent automatically on every small selection
  change.

### Do Not

- Do not add natural-language text input.
- Do not add AI Assistant UI.
- Do not replace Library as the only way to browse tracks.
- Do not start playback in this task.
- Do not add new backend endpoints.

## Task 5.6: Android Recommendation Results And Playback Handoff

### Goal

Show the primary recommendation and alternatives, then hand selected tracks to
the existing Media3 playback flow.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/`
- `android/app/src/main/java/com/easymusic/app/player/`
- `android/app/src/main/java/com/easymusic/app/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeScreen.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppNavGraph.kt`
- Existing player route files only as needed for navigation handoff

### Dependencies

- Task 5.5.
- Accepted Phase 3 Media3 playback architecture.
- Accepted Phase 4 offline cache source selection.

### Acceptance Criteria

- Recommendation response shows one primary result and up to two alternatives.
- Each result shows title, artist or album, key tags if available, score or
  rank, and deterministic reason text.
- Selecting a recommended track opens the existing Now Playing flow or starts
  playback through the existing player handoff used by Library/Cached Tracks.
- If a recommended track is locally cached, existing Phase 4 source selection
  can use the cached file.
- If a recommended track is not cached, existing online streaming remains the
  fallback.
- Empty recommendation result shows a clear state and lets the user adjust tag
  selections.
- Existing Library, Cached Tracks, mini player, notification, lock screen, and
  headset controls continue to work.

### Do Not

- Do not create a second ExoPlayer, MediaSession, or playback service.
- Do not rewrite Now Playing.
- Do not add queue, playlist, shuffle, or repeat.
- Do not download recommended tracks automatically.
- Do not add AI-generated explanations.

## Task 5.7: Android Recommendation Feedback Actions

### Goal

Let Android send the Phase 5 feedback actions from recommendation results
without disrupting playback or offline cache behavior.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeScreen.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/RecommendationRepository.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/FeedbackApi.kt`

### Dependencies

- Task 5.6.
- Task 5.1 feedback endpoint.

### Acceptance Criteria

- User can send feedback for a recommended track:
  - Like
  - Tired
  - Not today
  - Not suitable
  - Skip recommendation
- Feedback request includes the structured context used for the current
  recommendation when applicable.
- UI shows feedback send progress and result for the selected recommendation.
- After `not_today`, `tired`, `not_suitable`, or `skip_recommendation`, user can
  manually request a refreshed recommendation.
- `like` does not immediately force playback or cache behavior.
- Offline or network failures show a clear error. Phase 5 does not need to
  queue feedback offline unless a later task explicitly adds that scope.

### Do Not

- Do not add offline feedback sync in Phase 5 unless explicitly split into a
  later task.
- Do not store feedback in the Phase 4 playback-event queue.
- Do not change playback-event sync behavior.
- Do not implement social reactions or comments.
- Do not add AI Assistant prompts.

## Task 5.8: Web Recommendation API Client And Route

### Goal

Add Web API helpers and a protected route for a structured recommendation test
panel.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/routes/`
- `web/src/layout/`

### Main Files

- `web/src/api/recommendations.ts`
- `web/src/api/feedback.ts`
- `web/src/types/recommendation.ts`
- `web/src/types/feedback.ts`
- `web/src/pages/RecommendationPage.tsx`
- `web/src/routes/router.ts`
- `web/src/App.tsx`
- `web/src/layout/AppLayout.tsx`

### Dependencies

- Task 5.3.
- Existing Web auth/session handling.
- Existing Web tag and track types.

### Acceptance Criteria

- Web app has a protected `/recommendations` route.
- Layout navigation includes a Recommendation entry.
- Web API helper can call `POST /api/recommendations`.
- Web API helper can call `POST /api/feedback-events`.
- TypeScript types represent request, response, recommendation result, and
  feedback payload.
- Placeholder page compiles before the full panel is implemented.
- `npm run typecheck` passes.

### Do Not

- Do not add natural-language AI Assistant UI.
- Do not add upload, track edit, or tag edit changes unless needed for imports.
- Do not add Web playback history.
- Do not add new backend endpoints.

## Task 5.9: Web Structured Recommendation Test Panel

### Goal

Build a Web management-console panel for manually testing structured
recommendations.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/RecommendationPage.tsx`
- New recommendation-specific components under `web/src/components/` if useful
- `web/src/api/recommendations.ts`
- `web/src/api/feedback.ts`

### Dependencies

- Task 5.8.
- Existing `GET /api/tags`.
- Existing Web audio player can remain independent.

### Acceptance Criteria

- Panel loads existing tags and groups them by scenario, state, type, and
  attribute.
- User can select structured context tags and excluded attributes.
- User manually triggers recommendation request.
- Panel displays primary result and up to two alternatives with title,
  artist/album, tags, rank or score, and reason.
- Panel can send at least `like`, `not_today`, `tired`, and
  `not_suitable_for_context` feedback for a result.
- Feedback sends the current structured context.
- Loading, empty-result, no-ready-track, unauthorized, and backend error states
  are understandable.
- Existing Web library, upload, track detail, tag management, and playback
  continue to work.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not implement AI Assistant.
- Do not add natural-language prompt boxes.
- Do not add production analytics charts.
- Do not rewrite the Web app layout.
- Do not require a new backend API beyond Tasks 5.1 and 5.3.

## Task 5.10: Recommendation V1 Automated Regression Checks

### Goal

Add focused tests for the highest-risk Recommendation V1 behavior across
backend and clients.

### Directories

- `backend/tests/`
- `android/app/src/test/`
- `web/`

### Main Files

- Backend recommendation and feedback tests under `backend/tests/`
- Android recommendation model/repository tests under `android/app/src/test/`
- Web type/build configuration only if needed by existing scripts

### Dependencies

- Tasks 5.1 through 5.9.

### Acceptance Criteria

- Backend tests cover:
  - tag match ranking
  - recent playback penalty
  - future cooldown exclusion or penalty
  - `not_today`
  - `not_suitable_for_context`
  - `skip_recommendation`
  - liked-track boost
  - no-candidate behavior
- Android JVM tests cover recommendation JSON parsing and feedback request
  construction where practical.
- Web `npm run typecheck` passes.
- Web `npm run build` passes.
- Android `.\gradlew.bat test` passes.
- Android `.\gradlew.bat build` passes.
- Backend `.\.venv\Scripts\python.exe -m pytest` passes.

### Do Not

- Do not require a live backend for Android JVM tests.
- Do not add brittle UI screenshot tests unless the project already has that
  pattern.
- Do not broaden tests into AI Assistant or deployment hardening.
- Do not change ranking requirements without updating this task document.

## Task 5.11: Phase 5 Acceptance Documentation

### Goal

Document and run the end-to-end Phase 5 Recommendation V1 verification flow.

### Directories

- `docs/`
- `backend/`
- `android/`
- `web/`

### Main Files

- `docs/ACCEPTANCE/PHASE_5_ACCEPTANCE.md`
- `docs/DEVELOPMENT.md`
- `docs/API_MANUAL_TESTING.md`

### Dependencies

- Tasks 5.1 through 5.10.

### Acceptance Criteria

- `docs/ACCEPTANCE/PHASE_5_ACCEPTANCE.md` records backend, Web, and Android automated
  checks.
- Manual backend flow verifies feedback events and structured recommendation
  requests with a local user and at least three ready tagged tracks.
- Manual Android flow verifies:
  - Recommendation Home opens.
  - Tags load into structured controls.
  - User can request recommendations.
  - Primary result and alternatives appear.
  - Selecting a recommendation uses existing playback.
  - Cached recommendation playback still works through Phase 4 source
    selection when the track is cached.
  - Feedback actions affect subsequent manual recommendation requests.
- Manual Web flow verifies:
  - Recommendation route opens after login.
  - Structured recommendation request returns results.
  - Feedback actions can be sent.
  - Existing Library, Upload, Tags, Track Detail, and Web playback still work.
- Acceptance doc explicitly states that AI Assistant, natural-language parsing,
  production ML, deployment hardening, and social features remain outside Phase
  5.
- `docs/DEVELOPMENT.md` includes concise Phase 5 local setup and smoke-test
  notes.
- `docs/API_MANUAL_TESTING.md` includes feedback and recommendation API smoke
  tests.

### Do Not

- Do not mark Phase 5 accepted without a manual structured recommendation flow
  on Android and Web.
- Do not add new Phase 6 AI Assistant scope while documenting acceptance.
- Do not change task scope retroactively unless implementation uncovered a
  real compatibility issue.

## Phase 5 Completion Acceptance

Phase 5 is complete when:

1. Backend records Recommendation V1 feedback events.
2. Backend exposes `POST /api/recommendations` for structured requests.
3. Recommendation ranking uses ready tracks, tags, liked state, cooldown,
   playback recency, and feedback penalties.
4. Recommendation response returns one primary result and up to two
   alternatives with deterministic reason text.
5. Android Recommendation Home can request and display structured
   recommendations.
6. Android recommended tracks play through the existing Media3 architecture.
7. Android Phase 4 cached playback remains compatible for recommended cached
   tracks.
8. Android can send Recommendation V1 feedback actions.
9. Web recommendation test panel can request recommendations and send feedback.
10. Backend, Android, and Web automated checks pass.
11. `docs/ACCEPTANCE/PHASE_5_ACCEPTANCE.md` records manual Android and Web verification.

## General Codex Prompt For Each Phase 5 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
请执行 docs/TASKS/PHASE_5_TASKS.md 中的 Task 5.x: <任务标题>。

先阅读：
- docs/TASKS/PHASE_5_TASKS.md
- docs/TASKS/PHASE_4_TASKS.md
- docs/ACCEPTANCE/PHASE_4_ACCEPTANCE.md
- docs/DEVELOPMENT.md
- docs/API_MANUAL_TESTING.md
- 与本任务 Directories/Main Files 相关的现有 backend / android / web 代码

要求：
- 只完成当前 Task，不提前实现后续任务。
- 保持 Phase 3 Android Media3 播放架构兼容，不重写播放器或 MediaSession。
- 保持 Phase 4 手动离线缓存架构兼容，不改变已有 cached playback source selection。
- 不假设不存在的后端 API；只能使用当前任务依赖中明确已经存在或当前任务明确要求新增的 API。
- Phase 5 只做结构化 Recommendation V1，不做 AI Assistant、自然语言解析、AI 生成原因、复杂 ML/训练平台、社交功能或生产部署加固。
- 如果发现当前任务无法在既有 API 上完成，停止并说明需要拆出的最小 backend compatibility task，不要偷偷扩大范围。
- 不使用批量删除或递归删除命令；需要删除文件时只能一次删除一个明确路径的文件。
- 完成后运行本 Task 相关的最小自动检查，并说明未能运行的检查。
- 完成后检查 diff。
- 不要自动 commit，除非用户明确要求。
```
