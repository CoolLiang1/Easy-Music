# Phase 5 Recommendation V1 Acceptance

This document records the Phase 5 Recommendation V1 verification flow for Easy
Music. Phase 5 builds on the accepted Phase 3 Android Media3 playback
architecture and the accepted Phase 4 manual offline cache architecture. The
recommendation loop is structured and rule-based.

Do not mark Phase 5 accepted until the manual Android and Web checks below have
been run against a local backend with a local user and at least three `ready`
tracks tagged with `scenario`, `state`, `type`, and `attribute` tags.

## Scope

In scope for this acceptance pass:

- Authenticated Recommendation V1 feedback ingestion at
  `POST /api/feedback-events`.
- Authenticated structured recommendation requests at
  `POST /api/recommendations`.
- Rule-based ranking over ready tracks, structured tags, liked state,
  cooldowns, playback-event recency, and recommendation feedback penalties.
- One primary recommendation and up to two alternatives with deterministic
  rule text.
- Android Recommendation Home with structured tag controls, result display,
  feedback actions, and handoff to the existing player.
- Existing Android cached playback source selection for recommended tracks that
  are already cached.
- Web `/recommendations` test panel with structured controls, result display,
  and feedback actions.

Out of scope for Phase 5:

- AI Assistant.
- Natural-language parsing.
- AI-generated recommendation reasons.
- Production ML, embeddings, audio feature analysis, or training platforms.
- Production deployment hardening.
- Social features, public discovery, comments, or reactions.
- Rewriting Android Media3 playback, MediaSession, Now Playing, or Phase 4
  manual cache behavior.
- Automatic download of recommended tracks.

## Automated Verification

Run backend checks from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Expected result:

- Backend tests pass.
- Coverage includes feedback-event auth, ownership, context-tag validation,
  successful insert, `like`, `tired`, duplicate retry, recommendation auth,
  tag ownership and group validation, empty results, ordered three-result
  responses, deterministic reason text, ranking penalties, and liked boost.

Run Web checks from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected result:

- TypeScript completes without errors.
- The production Vite build completes.
- The Recommendation route, API helpers, and feedback/recommendation types
  compile with the existing Web app.

Run Android checks from `android/`:

```powershell
.\gradlew.bat test
.\gradlew.bat build
```

Expected result:

- JVM tests pass.
- The Android app compiles.
- Recommendation JSON parsing, feedback request construction, repository
  failure mapping, cache tests, and playback source selection coverage remain
  intact.
- No live backend is required for Android automated checks.

Latest local result, 2026-05-29:

- `.\.venv\Scripts\python.exe -m pytest` from `backend/`: passed, 81 tests.
- `npm run typecheck` from `web/`: passed.
- `npm run build` from `web/`: passed.
- `.\gradlew.bat test` from `android/`: passed.
- `.\gradlew.bat build` from `android/`: passed.
- Manual Android structured recommendation verification: passed, reported by
  the user on 2026-05-29.
- Manual Web structured recommendation verification: passed, reported by the
  user on 2026-05-29.

## Backend Preparation

Use development-only local values. Do not write production hosts, usernames,
passwords, bearer tokens, or device-local absolute paths into source files or
committed documentation.

1. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres api
   ```

2. Apply migrations:

   ```powershell
   docker compose exec api alembic upgrade head
   ```

3. Create or reuse the initial local user. If a user already exists, keep using
   that account.

   ```powershell
   cd backend
   $env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
   $env:MEDIA_ROOT = ".\media"
   $env:APP_SECRET_KEY = "development-secret-key-change-before-deploy"
   $env:EASY_MUSIC_INITIAL_PASSWORD = "replace-with-a-local-password"
   .\.venv\Scripts\python.exe -m app.auth.initial_user --username admin
   ```

4. Ensure at least three tracks are uploaded, processed to `ready`, and tagged
   with useful `scenario`, `state`, `type`, and `attribute` tags. Use the Web
   console and worker flow in `docs/DEVELOPMENT.md` if the local library needs
   seed data.

5. Confirm the three tracks are visible through authenticated
   `GET /api/tracks` and that their tags are visible through `GET /api/tags`.

## Backend Manual Flow

Run these API checks after login and after setting `$headers`, `$trackId`,
`$scenarioTagId`, `$stateTagId`, `$typeTagId`, and `$attributeTagId` for the
local account.

1. Send `POST /api/feedback-events` with `feedback_type: "not_today"` and the
   current structured context.
2. Retry the same feedback request with the same `client_event_id`.
3. Send `POST /api/feedback-events` with `feedback_type: "like"` for another
   owned ready track.
4. Send `POST /api/feedback-events` with `feedback_type: "tired"` for a third
   owned ready track.
5. Request `POST /api/recommendations` with structured tag ids and `limit = 3`.
6. Request recommendations again after `not_today`, `tired`,
   `not_suitable_for_context`, or `skip_recommendation` feedback to confirm
   subsequent ranking changes.

Expected backend behavior:

- Missing auth returns `401 Unauthorized`.
- Valid feedback for owned tracks is accepted.
- Retrying the same feedback event is safe and reports `duplicate`.
- Invalid or unowned track ids and context tag ids are rejected or reported in
  `failed`.
- `like` updates the track liked state.
- `tired` applies a compatible future cooldown.
- Structured recommendation requests return `request_id` and ordered `results`.
- Each result includes `rank`, `score`, deterministic `reason`, and a track
  payload compatible with `GET /api/tracks`.
- No raw text prompt is accepted or required.

## Android Manual Flow

Run this flow on an emulator or physical Android device:

1. Start the accepted backend with PostgreSQL, migrations, API, worker, a local
   user, and at least three ready tagged tracks.
2. Open the Android app from Android Studio or install a debug APK.
3. Configure the Android base URL for the target environment:
   `http://10.0.2.2:8000` for the stock emulator host-loopback case, the host
   LAN URL for a physical device, or `http://127.0.0.1:8000` when using
   `adb reverse`.
4. Log in with the local user.
5. Open Recommendation Home from the authenticated app navigation.
6. Confirm tags load into structured controls for `scenario`, `state`, `type`,
   `attribute`, and excluded attributes.
7. Select a structured context and manually request recommendations.
8. Confirm the primary result and up to two alternatives appear with title,
   artist or album, rank or score, tags when available, and deterministic
   reason text.
9. Select a recommended track and confirm playback uses the existing Now
   Playing/Media3 handoff used by Library and Cached Tracks.
10. Cache one recommended ready track through the existing Track Detail cache
    action, then request or select it from recommendations again.
11. Confirm cached recommendation playback uses Phase 4 source selection and
    Now Playing identifies cached/offline playback.
12. Confirm a non-cached recommended track still falls back to the authenticated
    online stream when network is available.
13. Send `Like`, `Tired`, `Not today`, `Not suitable`, and
    `Skip recommendation` feedback from recommendation results where practical.
14. After `not_today`, `tired`, `not_suitable_for_context`, or
    `skip_recommendation`, manually request recommendations again and confirm
    the response can change according to feedback.
15. Confirm existing Library, Cached Tracks, mini player, notification, lock
    screen, and headset/media-button controls still work.

## Web Manual Flow

Run this flow in a browser against the local Web dev server:

1. Start PostgreSQL, migrations, API, worker, a local user, and at least three
   ready tagged tracks.
2. From `web/`, start Vite:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Open the Vite URL, usually `http://localhost:5173/`, and log in.
4. Open `/recommendations` from the protected navigation.
5. Confirm structured tags load into scenario, state, type, attribute, and
   excluded-attribute controls.
6. Select a structured context and request recommendations.
7. Confirm the primary result and up to two alternatives appear with title,
   artist or album, tags, rank or score, and deterministic reason text.
8. Send `Like`, `Not today`, `Tired`, and `Not suitable` feedback for results.
9. Request recommendations again and confirm feedback can affect subsequent
   results.
10. Confirm existing Library, Upload, Tags, Track Detail, and ready-track Web
    playback still work.

## Manual Verification Record

Recorded result of actual Android and Web runs:

- Backend local user: `phase5_accept_20260529105400`.
- Ready tagged track count: 3, track ids `7`, `8`, and `9`.
- Scenario/state/type/attribute tags used: `13`, `14`, `15`, and `16`.
- Backend feedback smoke test: passed on 2026-05-29.
- Backend structured recommendation smoke test: passed on 2026-05-29.
- Android device or emulator: passed on emulator or device; exact target not
  recorded.
- Android API level: not recorded.
- Android backend base URL: configurable local backend URL; exact value not
  recorded.
- Android Recommendation Home opens: passed.
- Android structured tags load: passed.
- Android recommendation request returns results: passed.
- Android primary result and alternatives appear: passed.
- Android selected recommendation uses existing playback: passed.
- Android cached recommendation playback uses Phase 4 source selection:
  passed.
- Android feedback affects subsequent manual recommendation requests: passed.
- Android existing Library, Cached Tracks, mini player, notification, lock
  screen, and headset/media-button controls: passed.
- Web browser and URL: passed in local browser; exact browser and URL not
  recorded.
- Web recommendation route opens after login: passed.
- Web structured recommendation request returns results: passed.
- Web feedback actions can be sent: passed.
- Web existing Library, Upload, Tags, Track Detail, and playback: passed.
- Result: passed, reported by the user on 2026-05-29.

Current status, 2026-05-29:

- Phase 5 acceptance documentation exists and defines the required automated
  and manual verification flow.
- Backend API manual verification passed after rebuilding the local API
  container with current Phase 5 code and applying migrations.
- Manual Android and Web structured recommendation verification has passed.
- Phase 5 Recommendation V1 acceptance documentation is complete for the
  recorded verification result.
