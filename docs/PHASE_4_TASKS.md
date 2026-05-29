# Phase 4 Android Offline Cache Tasks

This document splits Phase 4 into executable Android Offline Cache development
tasks. Phase 4 starts from the accepted Phase 0/1 backend, accepted Phase 2 Web
management console, and accepted Phase 3 Android Player.

Phase 4 must preserve the Phase 3 Android playback architecture:

- Keep Media3 as the playback engine.
- Keep the existing Library, Track Detail, Now Playing, mini player, playback
  service, notification, lock screen, and media-button behavior.
- Add offline-cache behavior around the existing player instead of replacing it.

Current accepted backend APIs available before Phase 4:

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

Phase 4 audio caching can use `GET /api/tracks/{track_id}/stream` with bearer
authentication and save the response locally. Do not assume a
`download-cache` endpoint exists unless a backend compatibility task explicitly
adds it later. Phase 4 playback-event sync requires a minimal backend addition
because no accepted playback-event or sync endpoint exists yet.

Phase 4 does not include recommendation, AI Assistant, Web new features,
production deployment hardening, automatic full-library offline sync, complex
download queue management, or background caching of the entire library.

## Android Environment Notes

- Continue using Kotlin, Jetpack Compose, Material 3, AndroidX Lifecycle,
  DataStore, Coroutines, and AndroidX Media3 from Phase 3.
- Add Room only for local cached-track metadata and unsynced playback events.
- Add WorkManager only for lightweight retry of queued event sync and optional
  retry of an explicitly requested single-track cache operation.
- Local cached audio files should live in app-private storage.
- Cache behavior must be manual: the user chooses which ready tracks to cache.
- Offline playback must work without backend connectivity for tracks that are
  already fully cached.
- Do not hard-code production URLs, credentials, bearer tokens, or device-local
  absolute paths.

## Task 4.1: Backend Playback Event Sync Compatibility

### Goal

Add the smallest backend API support needed for Android to sync offline playback
events after reconnecting.

### Directories

- `backend/app/api/routes/`
- `backend/app/schemas/`
- `backend/app/models/`
- `backend/app/services/`
- `backend/alembic/versions/`
- `backend/tests/`
- `docs/`

### Main Files

- `backend/app/api/routes/playback_events.py`
- `backend/app/api/router.py`
- `backend/app/schemas/playback_event.py`
- `backend/app/models/playback_event.py`
- `backend/app/services/playback_events.py`
- New Alembic migration under `backend/alembic/versions/`
- New or updated backend tests under `backend/tests/`
- `docs/API_MANUAL_TESTING.md`
- `docs/DEVELOPMENT.md`

### Dependencies

- Accepted Phase 0/1 backend.
- Current Phase 1 auth and track ownership behavior.

### Acceptance Criteria

- Backend exposes a documented authenticated endpoint for bulk playback event
  sync, preferably `POST /api/playback-events`.
- Request payload supports a small list of events with:
  - client-generated event id or idempotency key
  - `track_id`
  - event type such as `play`, `pause`, `resume`, `seek`, `skip`, or `complete`
  - `position_seconds`
  - optional `duration_seconds`
  - `occurred_at`
  - `client`, with Android as an expected value
- Backend validates that each `track_id` belongs to the authenticated user.
- Duplicate client event ids are ignored or reported as already accepted so
  Android can retry safely.
- Response tells Android which events were accepted and which failed validation.
- Backend tests cover auth required, ownership, validation, duplicate retry,
  and successful bulk insert.
- `docs/API_MANUAL_TESTING.md` and `docs/DEVELOPMENT.md` document the local
  smoke-test command or request shape for the new endpoint.

### Do Not

- Do not add recommendation, feedback, or AI endpoints.
- Do not design a full analytics system.
- Do not add Web playback-history pages in this task.
- Do not add cache-specific backend state unless Android cannot complete the
  Phase 4 minimum loop without it.
- Do not change existing stream behavior unless a test proves it is required.

## Task 4.2: Android Room Cache Database Foundation

### Goal

Add a local Room database for cached-track metadata and unsynced playback
events without changing playback behavior yet.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/`
- `android/app/src/main/java/com/easymusic/app/cache/data/`
- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/test/`

### Main Files

- `android/app/build.gradle.kts`
- `android/app/src/main/java/com/easymusic/app/cache/data/EasyMusicDatabase.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/CachedTrackEntity.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/CachedTrackDao.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/OfflinePlaybackEventEntity.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/OfflinePlaybackEventDao.kt`
- `android/app/src/main/java/com/easymusic/app/cache/domain/CacheModels.kt`

### Dependencies

- Accepted Phase 3 Android app.

### Acceptance Criteria

- Android Gradle includes the Room dependencies and build plugins needed by the
  chosen Room setup.
- Local database stores cached track metadata, including track id, title,
  artist, album, duration, content type, tags snapshot if needed, source
  `updated_at`, local file path, byte size, cache status, cached timestamp, and
  last error.
- Local database stores unsynced playback events with client event id, track id,
  event type, position, duration, occurred timestamp, retry count, and sync
  status.
- DAOs support inserting/updating cached tracks, listing cached tracks, reading
  one cached track by id, deleting one cached track record, adding event rows,
  listing pending event rows, and marking event rows synced or failed.
- JVM tests or focused DAO tests cover the core insert, update, list, and delete
  behavior where practical.
- Existing Phase 3 build still passes.

### Do Not

- Do not download audio files in this task.
- Do not wire Room directly into Compose screens yet.
- Do not add automatic full-library sync.
- Do not store bearer tokens in Room.

## Task 4.3: Manual Track Cache Download

### Goal

Implement manual single-track caching by downloading a ready track through the
existing authenticated stream endpoint into app-private storage.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/data/`
- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/main/java/com/easymusic/app/library/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/cache/data/CacheFileStore.kt`
- `android/app/src/main/java/com/easymusic/app/cache/domain/TrackCacheRepository.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/TrackDetailViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/TrackDetailScreen.kt`

### Dependencies

- Task 4.2.
- Existing `GET /api/tracks/{track_id}/stream`.
- Existing Phase 3 bearer-token storage and stream URL builder.

### Acceptance Criteria

- Track Detail shows a cache action for `ready` tracks.
- User can manually cache one ready track.
- Download request uses `Authorization: Bearer <token>`.
- Audio bytes are saved under app-private storage with a deterministic filename
  or metadata mapping that avoids path traversal.
- Cache metadata is written only after a complete successful download, or a
  partial/in-progress status is clearly recorded and recoverable.
- UI shows caching progress, success, failure, and retry for the selected track.
- Non-ready tracks cannot be cached.
- Logout does not leave a partially authenticated download running.

### Do Not

- Do not add multi-track bulk cache.
- Do not add a complex queue UI.
- Do not assume `GET /api/tracks/{track_id}/download-cache` exists.
- Do not cache original upload files; cache only the MP3 playback stream.
- Do not change online streaming behavior for uncached tracks.

## Task 4.4: Cached Status In Library And Detail

### Goal

Surface local cache state in the existing Library and Track Detail screens.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/main/java/com/easymusic/app/library/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/cache/domain/TrackCacheRepository.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/LibraryViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/LibraryScreen.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/TrackDetailViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/TrackDetailScreen.kt`

### Dependencies

- Task 4.3.

### Acceptance Criteria

- Library rows can indicate whether a track is cached, caching, failed, or not
  cached.
- Track Detail shows local cache state, file size when known, and cached time
  when known.
- Cache status updates when a cache operation starts, succeeds, fails, or is
  deleted later.
- Online library loading remains based on `GET /api/tracks`.
- Empty, loading, and error states from Phase 3 remain intact.

### Do Not

- Do not add server-side search or cache filters.
- Do not hide uncached tracks from the normal Library.
- Do not add recommendation or AI UI.
- Do not rebuild the Library screen from scratch.

## Task 4.5: Cached Tracks View

### Goal

Add a focused view that lists only locally cached tracks and can be opened even
when the backend is unavailable.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/ui/`
- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/main/java/com/easymusic/app/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/cache/ui/CachedTracksScreen.kt`
- `android/app/src/main/java/com/easymusic/app/cache/ui/CachedTracksViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/cache/domain/TrackCacheRepository.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppNavGraph.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppScaffold.kt`

### Dependencies

- Task 4.4.

### Acceptance Criteria

- Authenticated app area includes navigation to Cached Tracks.
- Cached Tracks reads from Room, not from the backend.
- View shows cached track title, artist/album when available, duration when
  available, and cached file status.
- Empty state explains that no tracks have been cached yet.
- Selecting a cached track opens the existing Now Playing flow or a detail flow
  that can start offline playback.
- Cached Tracks is usable when the backend is offline after a valid session has
  already been established.

### Do Not

- Do not require `GET /api/tracks` to render cached tracks.
- Do not implement playlists, queue management, shuffle, or repeat.
- Do not add automatic full-library cache.

## Task 4.6: Offline Playback Source Selection

### Goal

Teach the existing player to choose a local cached audio file when available
and fall back to the online authenticated stream when needed.

### Directories

- `android/app/src/main/java/com/easymusic/app/player/domain/`
- `android/app/src/main/java/com/easymusic/app/player/ui/`
- `android/app/src/main/java/com/easymusic/app/cache/domain/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/player/domain/PlayerController.kt`
- `android/app/src/main/java/com/easymusic/app/player/ui/NowPlayingViewModel.kt`
- `android/app/src/main/java/com/easymusic/app/player/domain/PlaybackStateStore.kt`
- `android/app/src/main/java/com/easymusic/app/cache/domain/TrackCacheRepository.kt`

### Dependencies

- Task 4.5.
- Accepted Phase 3 Media3 playback service.

### Acceptance Criteria

- When a selected ready track has a valid local cached file, playback uses the
  local file URI.
- When no valid cache exists and the backend is reachable, playback continues
  to use the existing authenticated stream.
- Now Playing visibly distinguishes offline cached playback from online stream
  playback.
- Background playback, notification controls, lock screen controls, and headset
  controls still work for cached playback.
- If the cached file is missing or unreadable, the app marks the cache entry as
  invalid or failed and offers online playback when possible.
- No duplicate ExoPlayer or MediaSession ownership is introduced.

### Do Not

- Do not rewrite the Media3 service.
- Do not break online streaming for uncached tracks.
- Do not add queue, playlist, shuffle, or repeat behavior.
- Do not require network access to play a valid cached file.

## Task 4.7: Delete One Cached Track

### Goal

Allow the user to delete the local cached copy for one explicit track.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/main/java/com/easymusic/app/cache/data/`
- `android/app/src/main/java/com/easymusic/app/cache/ui/`
- `android/app/src/main/java/com/easymusic/app/library/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/cache/domain/TrackCacheRepository.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/CacheFileStore.kt`
- `android/app/src/main/java/com/easymusic/app/cache/ui/CachedTracksScreen.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/TrackDetailScreen.kt`

### Dependencies

- Task 4.6.

### Acceptance Criteria

- User can delete the cached copy for one selected track from Track Detail or
  Cached Tracks.
- UI asks for confirmation before deleting the cached file.
- Deletion removes one explicit local file path and its cached-track database
  record.
- If the deleted track is currently playing from cache, playback stops or
  switches to a clearly handled state.
- Deleting cache does not delete the server track, server media, or tags.
- Failed or missing local files can be cleaned up one track at a time.

### Do Not

- Do not implement bulk delete.
- Do not use recursive deletion commands or recursive filesystem deletion APIs.
- Do not delete app directories.
- Do not call `DELETE /api/tracks/{track_id}`.
- Do not delete unsynced playback events for that track unless they have been
  successfully synced or the user explicitly clears them in a later task.

## Task 4.8: Offline Playback Event Recording

### Goal

Record playback events locally while tracks are played online or offline, with
special attention to events created while offline.

### Directories

- `android/app/src/main/java/com/easymusic/app/player/domain/`
- `android/app/src/main/java/com/easymusic/app/cache/data/`
- `android/app/src/main/java/com/easymusic/app/cache/domain/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/player/domain/PlaybackEventRecorder.kt`
- `android/app/src/main/java/com/easymusic/app/player/domain/PlayerController.kt`
- `android/app/src/main/java/com/easymusic/app/player/service/MediaSessionConnector.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/OfflinePlaybackEventDao.kt`

### Dependencies

- Task 4.6.
- Task 4.1 API contract for eventual sync shape.

### Acceptance Criteria

- App creates local playback event rows for key player transitions:
  `play`, `pause`, `resume`, `seek`, `skip` or stop-before-complete, and
  `complete`.
- Events include track id, event type, position seconds, duration seconds when
  known, occurred timestamp, client id, and playback source if useful.
- Events are durable if the app is backgrounded or process-killed before sync.
- Event recording does not block playback UI responsiveness.
- Repeated position updates are not spammed as separate events.
- Event rows are marked pending until backend sync succeeds.

### Do Not

- Do not add feedback events such as like, tired, not today, or
  not-suitable-for-context.
- Do not add recommendation history.
- Do not require network connectivity to record events.
- Do not send one network request for every player tick.

## Task 4.9: Playback Event Sync Worker

### Goal

Sync queued playback events to the backend after network connectivity returns
or when the user manually retries.

### Directories

- `android/app/src/main/java/com/easymusic/app/cache/domain/`
- `android/app/src/main/java/com/easymusic/app/cache/data/`
- `android/app/src/main/java/com/easymusic/app/cache/sync/`
- `android/app/src/main/java/com/easymusic/app/core/network/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/cache/sync/PlaybackEventSyncWorker.kt`
- `android/app/src/main/java/com/easymusic/app/cache/domain/PlaybackEventSyncRepository.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/PlaybackEventSyncApi.kt`
- `android/app/src/main/java/com/easymusic/app/cache/data/OfflinePlaybackEventDao.kt`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle.kts`

### Dependencies

- Task 4.8.
- Task 4.1 backend compatibility endpoint.
- Phase 3 auth token storage.

### Acceptance Criteria

- Pending playback events are sent in small batches to the backend sync
  endpoint.
- Sync uses the stored bearer token and handles 401 by leaving events pending
  and surfacing that sign-in is required.
- Successful events are marked synced and are not resent.
- Failed validation for individual events is recorded without blocking valid
  events in the same batch.
- Transient network/server failures are retried with conservative backoff.
- User can see whether pending event sync exists, at least in a simple status
  area or debug-friendly UI surface.
- WorkManager is used only for lightweight event retry, not for full-library
  offline cache.

### Do Not

- Do not add complex queue management UI.
- Do not sync feedback events.
- Do not wake the app to download uncached music.
- Do not discard pending events silently.

## Task 4.10: Offline And Connectivity UX

### Goal

Make offline behavior understandable across Library, Cached Tracks, Now Playing,
and login/session restore edge cases.

### Directories

- `android/app/src/main/java/com/easymusic/app/core/network/`
- `android/app/src/main/java/com/easymusic/app/cache/ui/`
- `android/app/src/main/java/com/easymusic/app/library/ui/`
- `android/app/src/main/java/com/easymusic/app/player/ui/`
- `android/app/src/main/java/com/easymusic/app/auth/ui/`

### Main Files

- `android/app/src/main/java/com/easymusic/app/core/network/ConnectivityObserver.kt`
- `android/app/src/main/java/com/easymusic/app/ui/AppScaffold.kt`
- `android/app/src/main/java/com/easymusic/app/cache/ui/CachedTracksScreen.kt`
- `android/app/src/main/java/com/easymusic/app/library/ui/LibraryScreen.kt`
- `android/app/src/main/java/com/easymusic/app/player/ui/NowPlayingScreen.kt`
- `android/app/src/main/java/com/easymusic/app/auth/ui/SessionViewModel.kt`

### Dependencies

- Task 4.9.

### Acceptance Criteria

- App clearly shows when network-backed library refresh or online playback is
  unavailable.
- Cached Tracks remains reachable for a previously authenticated user even when
  the backend cannot be reached.
- Cached playback has a clear offline/cached indicator.
- Online-only actions such as login, library refresh, and first-time cache
  download show useful errors when offline.
- Event sync pending or failed state is visible enough for manual acceptance.
- Existing logout behavior still clears auth state and returns to login.

### Do Not

- Do not implement guest mode or account switching.
- Do not bypass authentication for server APIs.
- Do not add new Web features.
- Do not hide backend errors behind generic silent failures.

## Task 4.11: Android Offline Cache Automated Checks

### Goal

Add focused automated coverage for the highest-risk offline cache behavior.

### Directories

- `android/app/src/test/`
- `android/app/src/androidTest/`
- `android/app/src/main/java/com/easymusic/app/cache/`
- `android/app/src/main/java/com/easymusic/app/player/`

### Main Files

- New cache repository tests under `android/app/src/test/`
- New playback event sync tests under `android/app/src/test/`
- New DAO or instrumentation tests under `android/app/src/androidTest/` if
  needed by the chosen Room setup
- Existing Gradle files only if test dependencies are needed

### Dependencies

- Tasks 4.2 through 4.10.

### Acceptance Criteria

- Tests cover cache metadata insert/update/delete behavior.
- Tests cover local file-store path generation and one-file deletion behavior.
- Tests cover playback source selection: cached file preferred, online stream
  fallback when no valid cache exists.
- Tests cover event queue marking pending, synced, and failed.
- Tests cover sync retry behavior or repository-level handling of transient
  failures.
- `.\gradlew.bat test` passes from `android/`.
- `.\gradlew.bat build` passes from `android/`.

### Do Not

- Do not require a live backend for JVM unit tests.
- Do not add brittle sleep-based tests for Media3 internals.
- Do not broaden tests into recommendation, AI, Web, or deployment behavior.

## Task 4.12: Phase 4 Acceptance Documentation

### Goal

Document and run the end-to-end Phase 4 Android Offline Cache verification
flow.

### Directories

- `docs/`
- `android/`
- `backend/`

### Main Files

- `docs/PHASE_4_ACCEPTANCE.md`
- `docs/DEVELOPMENT.md`
- `docs/API_MANUAL_TESTING.md`
- Android Gradle or test files only if needed for documented checks.

### Dependencies

- Tasks 4.1 through 4.11.

### Acceptance Criteria

- `docs/PHASE_4_ACCEPTANCE.md` records automated backend checks, automated
  Android checks, and manual emulator/device verification.
- Manual flow starts the accepted backend, uploads/processes a ready track if
  needed, logs into Android, caches one ready track manually, confirms the
  cached track appears in Library and Cached Tracks, disables network/backend,
  plays the cached track offline, confirms background playback and notification
  controls still work, records offline playback events, restores network,
  confirms playback events sync, deletes one cached track, and confirms server
  track data is not deleted.
- The document explicitly notes that recommendation, AI Assistant, Web new
  features, production deployment hardening, automatic full-library sync,
  complex download queue management, and background caching of the entire
  library remain outside Phase 4.
- `docs/DEVELOPMENT.md` includes concise Android offline-cache setup and smoke
  test notes.
- `docs/API_MANUAL_TESTING.md` includes the backend playback-event sync smoke
  test introduced in Task 4.1.

### Do Not

- Do not mark Phase 4 accepted without manual offline playback verification on
  an emulator or device.
- Do not broaden scope into Phase 5 Recommendation, Phase 6 AI Assistant, or
  Phase 7 Deployment Hardening.
- Do not add new backend endpoints as part of acceptance documentation.

## Phase 4 Completion Acceptance

Phase 4 is complete when:

1. Android can manually cache one ready track using the authenticated stream
   endpoint.
2. Android stores cached-track metadata and cached audio in app-private local
   storage.
3. Library and Track Detail show cache state.
4. Cached Tracks lists locally cached tracks without requiring a backend
   request.
5. A cached track plays while offline.
6. Existing Phase 3 foreground playback, background playback, notification
   controls, lock screen controls, and headset/media-button controls still work.
7. User can delete one selected cached track without deleting server data.
8. Offline playback events are recorded locally and synced after reconnecting.
9. Backend and Android automated checks pass.
10. `docs/PHASE_4_ACCEPTANCE.md` records the manual emulator/device
    verification result.

## General Codex Prompt For Each Phase 4 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
请执行 docs/PHASE_4_TASKS.md 中的 Task 4.x: <任务标题>。

先阅读：
- docs/PHASE_4_TASKS.md
- docs/PHASE_3_TASKS.md
- docs/PHASE_3_ACCEPTANCE.md
- docs/DEVELOPMENT.md
- docs/API_MANUAL_TESTING.md
- 与本任务 Directories/Main Files 相关的现有代码

要求：
- 只完成当前 Task，不提前实现后续任务。
- 保持 Phase 3 Android Media3 播放架构兼容，不推翻重写播放器。
- 不假设不存在的后端 API；如果当前 Task 需要后端能力，只实现任务文档明确列出的最小兼容能力。
- 不实现推荐系统、AI Assistant、Web 新功能、生产部署加固、自动全量离线同步、复杂下载队列管理或后台自动缓存整库。
- 不使用批量删除或递归删除命令；需要删除文件时只能一次删除一个明确路径的文件。
- 完成后运行本 Task 相关的最小自动检查，并说明未能运行的检查。
- 不要自动 commit。
```
