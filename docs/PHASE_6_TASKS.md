# Phase 6 AI Assistant V1 Tasks

This document splits Phase 6 into executable AI Assistant V1 development tasks.
Phase 6 starts from the accepted Phase 5 Recommendation V1 backend, Web, and
Android flows.

Phase 6 adds AI-assisted intent parsing and tag suggestions, but it must keep
Recommendation V1 controllable. The LLM can parse natural language, map user
intent to existing tags, suggest tags, and provide short helper explanations.
It must not replace the Phase 5 structured recommendation API or rule-based
ranking service.

## Current Inputs Available Before Phase 6

Accepted Phase 5 backend APIs available before Phase 6:

- `POST /api/feedback-events`
- `POST /api/recommendations`

Current data and behavior that Phase 6 must reuse:

- Ready tracks from the library.
- Track metadata: title, artist, album, `content_type`, `source_url`, status,
  liked state, and cooldown.
- Track tags in the existing groups: `scenario`, `state`, `type`, and
  `attribute`.
- Phase 4 playback events.
- Phase 5 feedback events: `like`, `tired`, `not_today`,
  `not_suitable_for_context`, and `skip_recommendation`.
- Phase 5 structured recommendation request fields:
  - `scenario_tag_ids`
  - `state_tag_ids`
  - `type_tag_ids`
  - `attribute_tag_ids`
  - `exclude_attribute_tag_ids`
  - `limit`
  - `client`
- Phase 5 rule-based ranking behavior:
  - Uses only authenticated user's `ready` tracks.
  - Validates tag ownership and tag group.
  - Respects cooldown.
  - Excludes or penalizes not-today, not-suitable, recent skips, and recent
    playback.
  - Returns one primary recommendation and up to two alternatives with
    deterministic rule reasons.

Phase 6 may add AI-specific endpoints, schemas, services, Web UI, Android UI,
and documentation. Do not assume embeddings, audio analysis, a background AI
job platform, production secrets management, or deployment hardening.

## Phase 6 Scope

In scope:

- Development-only AI provider configuration and client abstraction.
- Safe disabled/unconfigured provider behavior.
- Natural-language listening intent parsing into existing structured tag ids.
- Backend AI recommendation composition that calls the existing Phase 5 ranking
  service.
- Tag suggestions for a track based on existing metadata and existing tags.
- Optional suggested new tag names as suggestions only.
- Web AI Assistant panel for natural-language recommendations.
- Web tag suggestion UI with explicit user confirmation before applying tags.
- Android natural-language input in the existing Recommendation Home.
- Android AI loading, unauthorized, offline, provider-unavailable, and backend
  error states.
- Focused automated regression checks.
- Phase 6 acceptance documentation.

Out of scope:

- Production deployment hardening, rate limiting strategy, observability, or
  secret rotation. Those belong to Phase 7.
- Real API keys in source code, tests, committed docs, screenshots, or examples.
- LLM-selected tracks that bypass `POST /api/recommendations` or the
  recommendation service.
- Bypassing cooldown, recent playback penalties, feedback penalties, or
  structured tag validation.
- Embeddings, vector databases, audio feature analysis, BPM detection, vocal
  detection, language detection, or ML training platforms.
- Automatic Bilibili download or automatic video-to-audio extraction.
- Social features, public discovery, comments, reactions, or multi-user
  recommendation features.
- Automatic full-library offline sync or automatic download/cache of
  recommended tracks.
- Rewriting Android Media3 playback, MediaSession, Now Playing, or Phase 4
  cached playback source selection.
- Changing upload/transcode pipeline behavior unless a task explicitly adds a
  tiny compatibility hook.

## AI Assistant V1 API Shape

Later tasks may adjust exact field names to match local code style, but the
minimum contracts should stay explicit and structured.

### Parse Listening Intent

- `POST /api/ai/parse-listening-intent`
- Request:
  - `text`: natural-language listening request
  - optional `client`, such as `android` or `web`
  - optional `fallback_to_empty`, defaulting to a documented value
- Response:
  - `structured_request` with Phase 5-compatible tag id arrays:
    - `scenario_tag_ids`
    - `state_tag_ids`
    - `type_tag_ids`
    - `attribute_tag_ids`
    - `exclude_attribute_tag_ids`
    - `limit`
    - `client`
  - `matched_tags`, grouped by tag group, using existing tag payloads or a
    compact equivalent
  - optional `unmatched_terms`
  - optional `explanation`
  - `provider_status`, such as `ok`, `disabled`, `unconfigured`, or `error`

The parser must use only the authenticated user's existing tags. It must not
create tags or invent tag ids.

### AI Recommendation Composition

- `POST /api/ai/recommend`
- Request:
  - `text`: natural-language listening request
  - optional `limit`, defaulting to `3`
  - optional `client`
  - optional fallback behavior flag if needed
- Response:
  - `parsed_intent`, using the parse response shape above
  - `request_id` or `recommendation_request_id`
  - `results`, ordered by existing rule-based ranking
  - each result includes rank, score, rule reason, optional AI helper reason,
    and a normal track payload compatible with existing clients

The endpoint must parse intent first, then call the existing Phase 5
recommendation service. The LLM must not directly select track ids.

### Track Tag Suggestions

- Preferred route: `POST /api/ai/tracks/{track_id}/suggest-tags`
- Request:
  - optional `include_new_tag_suggestions`
- Response:
  - `track_id`
  - `existing_tag_suggestions`, grouped by tag group, each mapped to an
    existing tag id owned by the current user
  - optional `new_tag_suggestions`, with name, group, confidence, and reason
  - optional `explanation`
  - `provider_status`

The endpoint must not automatically create tags and must not automatically bind
tags to the track.

## Task 6.1: Backend AI Provider Configuration And Client Abstraction

### Goal

Add the smallest development-friendly AI provider abstraction needed by later
AI Assistant endpoints, including safe disabled and unconfigured behavior.

### Directories

- `backend/app/core/`
- `backend/app/services/`
- `backend/app/schemas/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/core/config.py`
- `backend/app/services/ai_provider.py`
- `backend/app/schemas/ai.py`
- New backend tests under `backend/tests/`
- `.env.example`
- `docs/DEVELOPMENT.md`

### Dependencies

- Existing backend settings pattern in `backend/app/core/config.py`.
- Existing backend test setup.

### Acceptance Criteria

- Backend settings support development-only AI configuration, such as:
  - `AI_PROVIDER`
  - `AI_API_KEY`
  - `AI_MODEL`
  - `AI_BASE_URL`, if needed by the chosen provider abstraction
  - `AI_ENABLED`
- `.env.example` documents placeholder values only and contains no real API key.
- Provider client construction is isolated in a service module.
- AI-disabled and AI-unconfigured states are explicit and testable.
- Later services can request a structured completion without knowing provider
  details.
- Provider failures are converted into local typed errors or result objects that
  API routes can map to clear responses.
- Backend tests cover provider disabled, provider unconfigured, and provider
  error mapping without calling a real network provider.
- `docs/DEVELOPMENT.md` documents local development configuration without real
  secrets.

### Do Not

- Do not write real API keys into source code, docs, tests, or examples.
- Do not implement production secret rotation, billing controls, provider
  quotas, or observability.
- Do not add AI endpoints in this task.
- Do not call a real AI provider from automated tests.
- Do not add embeddings, vector databases, or audio analysis.

## Task 6.2: Backend AI Prompt Contracts And JSON Parsing Utilities

### Goal

Create reusable backend contracts for asking the AI provider for strict JSON
and parsing the result into validated local schemas.

### Directories

- `backend/app/services/`
- `backend/app/schemas/`
- `backend/tests/`

### Main Files

- `backend/app/services/ai_json.py`
- `backend/app/services/ai_provider.py`
- `backend/app/schemas/ai.py`
- New backend tests under `backend/tests/`

### Dependencies

- Task 6.1.

### Acceptance Criteria

- Backend has a helper that sends a compact prompt plus schema instructions to
  the configured provider abstraction.
- Helper accepts a Pydantic model or equivalent parser for expected JSON shape.
- Invalid JSON, missing fields, wrong field types, and unknown tag ids are
  handled as clear local failures.
- Tests cover valid JSON, malformed JSON, extra text around JSON if supported,
  missing fields, and provider failure.
- Prompt text tells the LLM to use only supplied tags and never invent tag ids.

### Do Not

- Do not expose an API route in this task.
- Do not implement recommendation ranking.
- Do not persist AI requests or responses.
- Do not call a real provider from tests.
- Do not create tags or update tracks.

## Task 6.3: Backend Natural-Language Listening Intent Parsing

### Goal

Expose an authenticated endpoint that parses a natural-language listening
request into the Phase 5 structured recommendation request shape using only the
current user's existing tags.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/ai.py`
- `backend/app/api/router.py`
- `backend/app/schemas/ai.py`
- `backend/app/services/ai_intent.py`
- `backend/app/services/ai_provider.py`
- `backend/app/services/recommendations.py`
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Task 6.2.
- Existing Tag model and tag group values.
- Existing Phase 5 `RecommendationRequest` schema and tag validation rules.

### Acceptance Criteria

- Backend exposes `POST /api/ai/parse-listening-intent`.
- Endpoint is authenticated.
- Request accepts natural-language text and optional client metadata.
- Service loads only the authenticated user's existing tags.
- AI result is validated into:
  - `scenario_tag_ids`
  - `state_tag_ids`
  - `type_tag_ids`
  - `attribute_tag_ids`
  - `exclude_attribute_tag_ids`
- Endpoint validates tag ownership and tag group after AI parsing, using the
  same expectations as `POST /api/recommendations`.
- Endpoint never creates tags.
- When the provider is disabled or unconfigured, endpoint returns either:
  - a documented fallback empty structured request, or
  - a clear provider-unavailable response.
- When parsing fails, endpoint returns a clear error or documented fallback
  empty structured request.
- Backend tests cover auth required, provider disabled, provider unconfigured,
  valid parse, invalid tag ownership, invalid tag group, invented tag id, and
  fallback/error behavior.
- Manual API smoke test is documented.

### Do Not

- Do not call `recommend_tracks` in this task.
- Do not return selected track ids.
- Do not create, rename, delete, or bind tags.
- Do not accept tags from another user.
- Do not implement Web or Android UI.

## Task 6.4: Backend AI Recommendation Composition Endpoint

### Goal

Add an authenticated AI Assistant recommendation endpoint that parses natural
language and then delegates ranking to the existing Phase 5 recommendation
service.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/ai.py`
- `backend/app/schemas/ai.py`
- `backend/app/services/ai_intent.py`
- `backend/app/services/recommendations.py`
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Task 6.3.
- Existing `POST /api/recommendations` service behavior from Phase 5.

### Acceptance Criteria

- Backend exposes `POST /api/ai/recommend`.
- Endpoint is authenticated.
- Endpoint parses the natural-language request into a Phase 5-compatible
  structured request.
- Endpoint calls the existing recommendation service for ranking.
- Response includes parsed intent plus primary and alternative results using
  the same track payload compatibility as `POST /api/recommendations`.
- Response preserves deterministic rule reason text from Phase 5.
- Optional AI helper explanation is allowed, but it must not replace rule reason
  text.
- Provider disabled/unconfigured behavior is documented and implemented as
  either fallback empty structured recommendation or a clear error response.
- Backend tests prove the AI endpoint calls existing ranking behavior instead
  of directly returning AI-selected tracks.
- Backend tests prove a cooled-down track or a track excluded by `not_today`
  cannot be recommended through the AI endpoint by bypassing ranking.
- Manual API smoke test is documented.

### Do Not

- Do not let the LLM choose track ids.
- Do not bypass cooldown, recent playback, not-today, not-suitable, skip, or
  feedback penalties.
- Do not fork or duplicate the Phase 5 ranking algorithm unless extracting a
  shared helper is needed.
- Do not implement tag suggestion in this task.
- Do not modify Android playback or cache behavior.

## Task 6.5: Backend Track Tag Suggestion Endpoint

### Goal

Add a minimal authenticated endpoint that suggests tags for one existing track
using track metadata and the current user's existing tag taxonomy.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/ai.py`
- `backend/app/schemas/ai.py`
- `backend/app/services/ai_tag_suggestions.py`
- `backend/app/services/tracks.py`
- New backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Task 6.2.
- Existing Track, Tag, and TrackTag models.
- Existing authenticated `GET /api/tracks/{track_id}` and `PATCH
  /api/tracks/{track_id}` behavior.

### Acceptance Criteria

- Backend exposes `POST /api/ai/tracks/{track_id}/suggest-tags`.
- Endpoint is authenticated.
- Endpoint validates that the track belongs to the authenticated user.
- Prompt context may include track metadata:
  - title
  - artist
  - album
  - `content_type`
  - `source_url`
  - original filename or stored original path basename if available and safe
- Prompt context includes only the authenticated user's existing tags.
- Response maps suggested existing tags to owned tag ids and correct groups.
- Optional new tag suggestions are returned only as suggestions with name,
  group, confidence, and reason.
- Endpoint does not create tags.
- Endpoint does not assign tags to the track.
- Provider disabled/unconfigured behavior is clear and test-covered.
- Backend tests cover auth required, track ownership, provider disabled,
  existing tag mapping, invalid invented tag id rejection, and no automatic tag
  creation or assignment.
- Manual API smoke test is documented.

### Do Not

- Do not modify upload, transcode, worker, or media-processing pipeline.
- Do not create a background AI job system.
- Do not auto-bind suggested tags to a track.
- Do not infer BPM, vocal, language, or audio features.
- Do not expose internal storage paths beyond existing track response behavior.

## Task 6.6: Web AI Assistant API Client And Protected Panel Shell

### Goal

Add Web TypeScript types, API helpers, and a protected AI Assistant panel shell
without changing existing Library, Upload, Tags, Track Detail, playback, or
structured Recommendation behavior.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/routes/`
- `web/src/layout/`

### Main Files

- `web/src/api/ai.ts`
- `web/src/types/ai.ts`
- `web/src/pages/AiAssistantPage.tsx`
- `web/src/routes/router.ts`
- `web/src/App.tsx`
- `web/src/layout/AppLayout.tsx`

### Dependencies

- Task 6.4.
- Existing Web auth/session handling.
- Existing Phase 5 Web recommendation types.

### Acceptance Criteria

- Web app has a protected AI Assistant route or a clearly separated AI panel on
  the existing recommendation page.
- Layout navigation exposes the AI Assistant entry if a new route is used.
- API helper can call `POST /api/ai/parse-listening-intent`.
- API helper can call `POST /api/ai/recommend`.
- TypeScript types represent parse request/response, AI recommendation
  request/response, provider status, parsed intent, and results.
- Placeholder panel compiles before full interaction is implemented.
- `npm run typecheck` passes.

### Do Not

- Do not remove or break the existing `/recommendations` structured test panel.
- Do not add tag suggestion UI in this task.
- Do not change upload, track detail, or tag management behavior.
- Do not rewrite the Web app layout.
- Do not store API keys in the browser.

## Task 6.7: Web Natural-Language Recommendation Panel

### Goal

Build a Web AI Assistant panel where the user can type a natural-language
listening request, inspect parsed structured intent, view recommendation
results, and send existing Phase 5 feedback.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/AiAssistantPage.tsx` or `web/src/pages/RecommendationPage.tsx`
- New AI-specific components under `web/src/components/` if useful
- `web/src/api/ai.ts`
- `web/src/api/feedback.ts`
- `web/src/types/ai.ts`
- `web/src/types/feedback.ts`

### Dependencies

- Task 6.6.
- Existing Phase 5 feedback endpoint and Web feedback helper.

### Acceptance Criteria

- User can enter a natural-language recommendation request.
- User manually triggers the AI recommendation request.
- Panel displays parsed structured intent grouped by scenario, state, type,
  desired attribute, and excluded attribute.
- Panel displays primary result and up to two alternatives.
- Each result shows title, artist or album, rank or score, deterministic rule
  reason, and optional AI helper reason if provided.
- Panel can send existing Phase 5 feedback actions for a result.
- Feedback sends the structured context produced by the AI parse when
  applicable.
- Loading, empty result, unauthorized, provider unavailable, parse failure, and
  backend error states are understandable.
- Existing Library, Upload, Tags, Track Detail, Web playback, and structured
  Recommendation page continue to work.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not let Web choose or submit AI-selected track ids.
- Do not hide deterministic rule reasons.
- Do not automatically request recommendations on every keystroke.
- Do not automatically edit tags or tracks.
- Do not add production analytics charts.

## Task 6.8: Web Track Tag Suggestion UI

### Goal

Allow the Web user to request tag suggestions for a track and explicitly apply
selected existing tags through the existing track update flow.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/pages/`
- `web/src/components/`

### Main Files

- `web/src/api/ai.ts`
- `web/src/types/ai.ts`
- `web/src/pages/TrackDetailPage.tsx`
- `web/src/components/TrackTagEditor.tsx`
- New AI tag suggestion component if useful

### Dependencies

- Task 6.5.
- Existing Track Detail page.
- Existing track update API that can assign `tag_ids`.

### Acceptance Criteria

- Track Detail or AI Assistant panel can request tag suggestions for one track.
- UI shows suggested existing tags grouped by tag group.
- UI shows confidence and explanation when provided by backend.
- Optional new tag suggestions are displayed as suggestions only.
- User can choose which existing suggested tags to apply.
- Applying suggestions uses the existing authenticated track update flow.
- No tag changes are applied until the user confirms.
- UI handles loading, unauthorized, provider unavailable, track not found, and
  backend error states.
- Existing Track Detail metadata editing and manual tag editing continue to
  work.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not automatically create new tags.
- Do not automatically assign tags after loading suggestions.
- Do not batch-modify the whole library.
- Do not change upload/transcode behavior.
- Do not require AI suggestions before a track can be edited manually.

## Task 6.9: Android AI Recommendation API Client And Models

### Goal

Add Android models and repository support for Phase 6 AI Assistant endpoints
without changing the Recommendation Home UI yet.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/data/`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/`
- `android/app/src/test/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/data/AiRecommendationApi.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/AiRecommendationModels.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/RecommendationRepository.kt`
- New Android JVM tests under `android/app/src/test/`

### Dependencies

- Task 6.4.
- Existing Android auth token handling and `ApiResult` style.
- Existing Android Phase 5 recommendation models.

### Acceptance Criteria

- Android can build a request for `POST /api/ai/parse-listening-intent`.
- Android can build a request for `POST /api/ai/recommend`.
- Android can parse parsed intent, provider status, recommendation results, and
  existing track-compatible payloads.
- Repository maps unauthorized, offline/network, provider unavailable, backend,
  and serialization failures into existing UI-friendly result types.
- JVM tests cover JSON request construction, successful AI recommendation
  response parsing, provider-unavailable response mapping where practical, and
  empty result parsing.
- No Compose UI is added in this task.

### Do Not

- Do not change Media3 playback.
- Do not change Now Playing.
- Do not change Phase 4 cache database or source selection.
- Do not store AI prompts in the Phase 4 playback-event queue.
- Do not implement tag suggestion UI in this task.

## Task 6.10: Android Natural-Language Recommendation Input

### Goal

Extend the existing Android Recommendation Home with a natural-language input
that calls the AI recommendation endpoint and displays parsed context plus
results.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/`
- `android/app/src/main/java/com/easymusic/app/recommendation/data/`
- `android/app/src/test/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeScreen.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/RecommendationRepository.kt`
- Android JVM tests where practical

### Dependencies

- Task 6.9.
- Existing Android Recommendation Home.
- Accepted Phase 3 Media3 playback and Phase 4 cached playback behavior.

### Acceptance Criteria

- Recommendation Home keeps existing structured controls.
- Recommendation Home adds a natural-language input entry.
- User manually submits natural-language text.
- UI calls `POST /api/ai/recommend`.
- UI shows parsed structured context returned by backend.
- UI shows primary result and alternatives using the existing recommendation
  result presentation where practical.
- Selecting a result uses the existing player handoff.
- Cached recommended tracks still use Phase 4 cached playback source selection.
- Empty prompt, loading, unauthorized, offline, provider unavailable, parse
  failure, backend error, and empty-result states are visible.
- Existing Library, Cached Tracks, mini player, notification, lock screen, and
  headset/media-button controls continue to work.

### Do Not

- Do not rewrite the player, MediaSession, Now Playing, or cache architecture.
- Do not automatically cache recommended tracks.
- Do not remove structured Recommendation Home controls.
- Do not make an AI request on every text change.
- Do not add offline AI.

## Task 6.11: Android AI Feedback And Error-State Polish

### Goal

Finish Android AI Assistant user states and keep feedback behavior aligned with
Phase 5.

### Directories

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/`
- `android/app/src/test/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeScreen.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/ui/RecommendationHomeViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/recommendation/domain/RecommendationRepository.kt`
- New or updated Android JVM tests under `android/app/src/test/`

### Dependencies

- Task 6.10.
- Existing Phase 5 Android feedback behavior.

### Acceptance Criteria

- AI recommendation loading state is distinct from structured recommendation
  loading state if both can be used.
- Unauthorized state sends the user through the existing sign-in recovery path.
- Offline state clearly says AI requests need the backend.
- Provider unavailable state is understandable and does not look like playback
  failure.
- Backend parse/ranking errors are displayed without crashing.
- Feedback actions for AI recommendation results use the existing
  `POST /api/feedback-events` behavior.
- Feedback includes parsed structured context when available.
- AI feedback is not stored in the Phase 4 playback-event queue.
- JVM tests cover ViewModel request construction and representative error
  states where practical.

### Do Not

- Do not add offline AI.
- Do not queue AI prompts or feedback in the playback-event queue.
- Do not change the Phase 5 feedback endpoint contract.
- Do not change playback event sync behavior.
- Do not add background automatic recommendation refresh.

## Task 6.12: Phase 6 Automated Regression Checks

### Goal

Add and run focused automated checks for the highest-risk AI Assistant V1
behavior across backend, Web, and Android.

### Directories

- `backend/tests/`
- `web/`
- `android/app/src/test/`

### Main Files

- Backend AI provider, intent, recommendation, and tag suggestion tests under
  `backend/tests/`
- Web type/build configuration only if needed by existing scripts
- Android AI recommendation model/repository/ViewModel tests under
  `android/app/src/test/`

### Dependencies

- Tasks 6.1 through 6.11.

### Acceptance Criteria

- Backend tests cover:
  - provider disabled
  - provider unconfigured
  - auth required for AI endpoints
  - tag ownership validation
  - tag group validation
  - natural language to structured request parsing
  - invented or unowned tag ids rejected
  - AI recommendation endpoint calls existing ranking service
  - AI endpoint cannot recommend a cooled-down track by bypassing ranking
  - AI endpoint cannot recommend a not-today excluded track by bypassing ranking
  - tag suggestion maps existing tags
  - tag suggestion does not auto-create tags
  - tag suggestion does not auto-assign tags
- Web `npm run typecheck` passes.
- Web `npm run build` passes.
- Android `.\gradlew.bat test` passes.
- Android `.\gradlew.bat build` passes.
- Backend `.\.venv\Scripts\python.exe -m pytest` passes.

### Do Not

- Do not require a live AI provider for automated tests.
- Do not require a live backend for Android JVM tests.
- Do not add brittle screenshot tests unless the project already has that
  pattern.
- Do not broaden tests into Phase 7 deployment hardening.

## Task 6.13: Phase 6 Acceptance Documentation

### Goal

Document and run the end-to-end Phase 6 AI Assistant V1 verification flow.

### Directories

- `docs/`
- `backend/`
- `web/`
- `android/`

### Main Files

- `docs/PHASE_6_ACCEPTANCE.md`
- `docs/DEVELOPMENT.md`
- `docs/API_MANUAL_TESTING.md`

### Dependencies

- Tasks 6.1 through 6.12.

### Acceptance Criteria

- `docs/PHASE_6_ACCEPTANCE.md` records backend, Web, and Android automated
  checks.
- Acceptance doc records development-only AI provider configuration and states
  that no real secret should be committed.
- Manual backend flow verifies:
  - provider disabled/unconfigured behavior
  - `POST /api/ai/parse-listening-intent`
  - `POST /api/ai/recommend`
  - `POST /api/ai/tracks/{track_id}/suggest-tags`
  - AI recommendation results still obey Phase 5 ranking constraints
  - tag suggestions do not auto-create or auto-assign tags
- Manual Web flow verifies:
  - AI Assistant panel opens after login.
  - Natural-language request displays parsed structured intent.
  - Primary recommendation and alternatives appear.
  - Existing feedback actions work.
  - Track tag suggestions can be requested and applied only after confirmation.
  - Existing Library, Upload, Tags, Track Detail, structured Recommendation,
    and Web playback still work.
- Manual Android flow verifies:
  - Recommendation Home still supports structured controls.
  - Natural-language input calls the AI recommendation endpoint.
  - Parsed structured context and results appear.
  - Selecting a recommendation uses existing Media3/Now Playing handoff.
  - Cached recommended tracks still use Phase 4 cached playback source
    selection.
  - AI loading, unauthorized, offline, provider unavailable, backend error, and
    empty-result states are understandable.
  - Phase 5 feedback actions still work.
- `docs/DEVELOPMENT.md` includes concise Phase 6 local setup notes.
- `docs/API_MANUAL_TESTING.md` includes AI endpoint smoke tests.
- Acceptance doc explicitly states that production deployment hardening,
  embeddings, audio analysis, training platforms, social features, automatic
  downloads, and playback rewrites remain outside Phase 6.

### Do Not

- Do not mark Phase 6 accepted without manual Web AI Assistant verification.
- Do not mark Phase 6 accepted without manual Android natural-language
  recommendation verification.
- Do not write real API keys, bearer tokens, production hosts, or private local
  secrets into committed documentation.
- Do not expand Phase 6 into Phase 7 deployment hardening.

## Phase 6 Completion Acceptance

Phase 6 is complete when:

1. Backend has a development-safe AI provider abstraction with disabled and
   unconfigured fallback behavior.
2. Backend exposes `POST /api/ai/parse-listening-intent`.
3. Intent parsing maps natural language only to the current user's existing
   tags and validates ownership and group.
4. Backend exposes `POST /api/ai/recommend`.
5. AI recommendation composition calls the existing Phase 5 recommendation
   service and cannot bypass ranking constraints.
6. Backend exposes `POST /api/ai/tracks/{track_id}/suggest-tags`.
7. Tag suggestions can propose existing tags and optional new tag names without
   automatically creating or assigning anything.
8. Web AI Assistant can request natural-language recommendations, display
   parsed structured intent, display results, and send Phase 5 feedback.
9. Web tag suggestion UI applies tag changes only after user confirmation.
10. Android Recommendation Home supports natural-language recommendation input
    while preserving structured controls.
11. Android recommended tracks still use existing Media3 playback handoff and
    Phase 4 cached playback source selection.
12. Android AI loading and error states are clear.
13. Backend, Web, and Android automated checks pass.
14. `docs/PHASE_6_ACCEPTANCE.md` records manual backend, Web, and Android
    verification.

## General Codex Prompt For Each Phase 6 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
请执行 docs/PHASE_6_TASKS.md 中的 Task 6.x: <任务标题>。

先阅读：
- docs/PHASE_6_TASKS.md
- docs/PHASE_5_TASKS.md
- docs/PHASE_5_ACCEPTANCE.md
- docs/DEVELOPMENT.md
- docs/API_MANUAL_TESTING.md
- 与本任务 Directories/Main Files 相关的现有 backend / android / web 代码

要求：
- 只完成当前 Task，不提前实现后续任务。
- Phase 6 是 AI Assistant V1，必须复用 Phase 5 structured recommendation request 和 rule-based ranking。
- LLM 只能负责 intent parsing、tag suggestions、简短解释或组织建议；不得直接选择 track，不得绕过 cooldown/recent playback/feedback penalties。
- 不写真实 API key、生产 secret、真实 bearer token 或私有本地配置到代码或文档。
- 保持 Phase 3 Android Media3 播放器、MediaSession、Now Playing 兼容，不重写播放器。
- 保持 Phase 4 手动离线缓存和 cached playback source selection，不自动下载或缓存推荐曲目。
- 不做 embeddings、音频特征分析、BPM/vocal/language detection、复杂 ML/训练平台、社交功能、多用户推荐、公开发现或 Phase 7 生产部署加固。
- 如果发现当前任务需要的前置能力不存在，拆出最小 backend compatibility task，不要扩大范围。
- 不使用批量删除或递归删除命令；需要删除文件时只能一次删除一个明确路径的文件。
- 完成后运行本 Task 相关的最小自动检查，并说明未能运行的检查。
- 完成后检查 diff。
- 不要自动 commit，除非用户明确要求。
```
