# Phase 6 AI Assistant V1 Acceptance

This document records the Phase 6 AI Assistant V1 verification flow for Easy
Music. Phase 6 builds on the accepted Phase 5 structured recommendation request
and rule-based ranking service. The LLM may parse intent, suggest tags, provide
short helper explanations, or organize suggestion text. It must not choose
tracks directly.

Do not mark Phase 6 accepted until the manual Web AI Assistant flow and the
manual Android natural-language recommendation flow below have both been run
against a local backend with a local user and at least three `ready` tagged
tracks.

## Scope

In scope for this acceptance pass:

- Development-safe AI provider configuration with disabled and unconfigured
  behavior.
- Authenticated `POST /api/ai/parse-listening-intent`.
- Authenticated `POST /api/ai/recommend`.
- Authenticated `POST /api/ai/tracks/{track_id}/suggest-tags`.
- Natural-language parsing into the existing Phase 5 structured recommendation
  request shape.
- Recommendation composition that delegates all track selection and ordering to
  the existing Phase 5 rule-based ranking service.
- Web AI Assistant panel and track tag-suggestion confirmation flow.
- Android natural-language recommendation input on Recommendation Home.
- Existing Phase 3 Media3, MediaSession, Now Playing, and Phase 4 cached
  playback source selection for recommended tracks.

Out of scope for Phase 6:

- Production deployment hardening.
- Embeddings, audio feature analysis, BPM detection, vocal detection, language
  detection, complex ML, or training platforms.
- Social features, multi-user recommendation, public discovery, comments, or
  reactions.
- Automatic download or caching of recommended tracks.
- Rewriting Android Media3 playback, MediaSession, Now Playing, or Phase 4
  manual cache behavior.
- Letting an LLM directly choose track ids, bypass cooldowns, bypass recent
  playback checks, or bypass feedback penalties.

## Automated Verification

Run backend checks from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Expected result:

- Backend tests pass.
- Coverage includes AI provider disabled and unconfigured behavior, JSON
  completion parsing, listening-intent parsing, tag-id validation,
  recommendation composition through the Phase 5 recommendation service, and
  track tag suggestion behavior.
- Tests do not require a live AI provider.

Run Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript completes without errors.
- The production Vite build completes.
- AI Assistant API helpers, UI state, tag suggestion confirmation, existing
  Library, Upload, Tags, Track Detail, structured Recommendation, and Web
  playback code compile together.

Run Android checks from `android/`:

```powershell
.\gradlew.bat test
.\gradlew.bat build
```

Expected result:

- JVM tests pass.
- The Android app compiles.
- Structured Recommendation Home behavior, AI response parsing, feedback
  request construction, repository failure mapping, Media3 handoff, and cached
  playback source selection coverage remain intact.
- No live backend is required for Android JVM tests.

Latest local result, 2026-05-30:

- `.\.venv\Scripts\python.exe -m pytest` from `backend/`: passed, 167 tests.
- `npm run typecheck` from `web/`: passed.
- `npm run build` from `web/`: passed.
- `.\gradlew.bat test` from `android/`: passed.
- `.\gradlew.bat build` from `android/`: passed.
- Manual Web AI Assistant verification: pending.
- Manual Android natural-language recommendation verification: pending.

## Development AI Provider Configuration

Use only development-local values. No real API key, production bearer token,
production host, private local path, or device-local secret should be committed
to this repository.

AI features are off by default. To test a local provider, set values in the
current shell or in a local `.env` file that is ignored by git:

```powershell
$env:AI_ENABLED = "true"
$env:AI_PROVIDER = "openai-compatible"
$env:AI_API_KEY = "your-own-provider-key"
$env:AI_MODEL = "gpt-4o-mini"
$env:AI_BASE_URL = "https://api.openai.com/v1"
```

Safe fallback behavior:

- With `AI_ENABLED=false`, AI endpoints return provider status `disabled`.
- With a missing key or model, AI endpoints return provider status
  `unconfigured`.
- Default fallback responses are `200 OK` with empty structured AI output where
  supported.
- Requests with `fallback_to_empty=false` may return `503 Service Unavailable`
  for disabled, unconfigured, or failed provider calls.

## Backend Preparation

1. Start PostgreSQL and the API from the repository root:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse a local user. If a user already exists, keep using that
   account.
4. Ensure at least three tracks are uploaded, processed to `ready`, and tagged
   with useful `scenario`, `state`, `type`, and `attribute` tags.
5. Configure the AI provider only for local development if testing provider-ok
   behavior. Leave it disabled or unconfigured when testing fallback behavior.

## Backend Manual Flow

Run these API checks after login and after setting `$headers`, `$trackId`,
`$scenarioTagId`, `$stateTagId`, `$typeTagId`, and `$attributeTagId` for the
local account. Use the concrete request examples in `docs/API_MANUAL_TESTING.md`.

1. Verify missing auth returns `401 Unauthorized` for each AI endpoint.
2. Verify provider disabled or unconfigured behavior for
   `POST /api/ai/parse-listening-intent`.
3. Call `POST /api/ai/parse-listening-intent` with a natural-language request.
4. Confirm the response maps only to existing tags owned by the current user.
5. Call `POST /api/ai/recommend` with a natural-language request.
6. Confirm the response includes parsed structured intent plus results from the
   Phase 5 recommendation service.
7. Send Phase 5 feedback such as `not_today`, `tired`,
   `not_suitable_for_context`, or `skip_recommendation`, then call
   `POST /api/ai/recommend` again.
8. Confirm AI recommendation results still obey cooldown, recent playback, and
   feedback penalties from Phase 5 ranking.
9. Call `POST /api/ai/tracks/{track_id}/suggest-tags`.
10. Confirm tag suggestions do not create tags and do not auto-assign tags to
    the track.

Expected backend behavior:

- AI parse responses contain a Phase 5-compatible structured request.
- AI recommend responses never contain LLM-selected track ids.
- Track selection, ordering, score, cooldown exclusion, recent playback
  handling, liked boost, and feedback penalties come from the Phase 5
  recommendation service.
- Tag suggestions are advisory only.

## Web Manual Flow

Run this flow in a browser against the local Web dev server:

1. Start PostgreSQL, migrations, API, worker, a local user, at least three ready
   tagged tracks, and a development-only AI provider if testing provider-ok
   behavior.
2. From `web/`, start Vite:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Open the Vite URL and log in.
4. Open the AI Assistant panel after login.
5. Submit a natural-language listening request.
6. Confirm the parsed structured intent is displayed.
7. Confirm a primary recommendation and alternatives appear when matching ready
   tracks exist.
8. Confirm existing feedback actions work from AI recommendation results.
9. Request track tag suggestions.
10. Confirm suggested existing tags can be applied only after explicit user
    confirmation.
11. Confirm suggested new tag names require explicit tag creation before they
    can be assigned.
12. Confirm existing Library, Upload, Tags, Track Detail, structured
    Recommendation, and Web playback still work.

## Android Manual Flow

Run this flow on an emulator or physical Android device:

1. Start the local backend stack with a local user, ready tagged tracks, and a
   development-only AI provider if testing provider-ok behavior.
2. Open the Android app from Android Studio or install a debug APK.
3. Configure the Android base URL for the target environment:
   `http://10.0.2.2:8000` for the stock emulator host-loopback case, the host
   LAN URL for a physical device, or `http://127.0.0.1:8000` when using
   `adb reverse`.
4. Log in with the local user.
5. Open Recommendation Home and confirm structured controls still work.
6. Enter a natural-language listening request.
7. Confirm Android calls `POST /api/ai/recommend`.
8. Confirm parsed structured context and recommendation results appear.
9. Select a recommended track and confirm playback uses the existing
   Media3/Now Playing handoff.
10. Cache one recommended ready track through the existing manual Track Detail
    cache action, then select it from recommendations again.
11. Confirm cached recommended tracks use Phase 4 cached playback source
    selection.
12. Confirm AI loading, unauthorized, offline, provider unavailable, backend
    error, and empty-result states are understandable.
13. Confirm Phase 5 feedback actions still work.

## Manual Verification Record

Record actual Web and Android results here after running the manual flows:

- Backend local user: pending.
- Ready tagged track count: pending.
- Scenario/state/type/attribute tags used: pending.
- Backend provider disabled/unconfigured smoke test: pending.
- Backend AI parse-listening-intent smoke test: pending.
- Backend AI recommend smoke test: pending.
- Backend AI ranking integrity check: pending.
- Backend AI tag suggestion smoke test: pending.
- Web browser and URL: pending.
- Web AI Assistant opens after login: pending.
- Web parsed structured intent display: pending.
- Web primary recommendation and alternatives: pending.
- Web feedback actions from AI results: pending.
- Web tag suggestions require confirmation: pending.
- Web existing Library, Upload, Tags, Track Detail, structured
  Recommendation, and playback regression check: pending.
- Android device or emulator: pending.
- Android API level: pending.
- Android backend base URL: pending.
- Android structured Recommendation Home controls: pending.
- Android natural-language recommendation request: pending.
- Android parsed context and results display: pending.
- Android selected recommendation uses existing Media3/Now Playing handoff:
  pending.
- Android cached recommended track uses Phase 4 source selection: pending.
- Android AI loading, unauthorized, offline, provider unavailable, backend
  error, and empty-result states: pending.
- Android Phase 5 feedback actions: pending.
- Result: pending.

Current status, 2026-05-30:

- Phase 6 acceptance documentation defines the required automated and manual
  verification flow.
- Phase 6 is not marked accepted until manual Web AI Assistant verification and
  manual Android natural-language recommendation verification are recorded.
