# Phase 3 Android Player Tasks

This document splits Phase 3 into executable Android Player development tasks.
Phase 3 starts from the accepted Phase 0/1 backend and accepted Phase 2 Web
management console.

The Android app must use only APIs that already exist in Phase 1:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/tracks`
- `GET /api/tracks/{track_id}`
- `GET /api/tracks/{track_id}/stream`
- `GET /api/tags`

The app may read track fields returned by the current `TrackResponse`, including
`id`, `title`, `artist`, `album`, `duration_seconds`, `content_type`,
`status`, `liked`, `cooldown_until`, `created_at`, `updated_at`, and `tags`.
Playback must be limited to tracks whose `status` is `ready`.

Phase 3 must not implement offline cache, recommendation, AI Assistant, Web
features, production deployment hardening, playback-history events, or feedback
events.

## Android Environment Notes

- Use Android Studio with a recent stable Android Gradle Plugin and Kotlin
  version supported by that Android Studio release.
- Use Kotlin, Jetpack Compose, Material 3, AndroidX Lifecycle/ViewModel,
  Navigation Compose, DataStore, Retrofit or Ktor client, Kotlin serialization
  or Moshi, Coroutines, and AndroidX Media3.
- Use Media3 ExoPlayer for playback and Media3 Session for background playback,
  notification, lock screen, and headset controls.
- The local backend smoke-test flow remains the same as
  `docs/API_MANUAL_TESTING.md`: run PostgreSQL, API, migrations, create or
  reuse the initial user, upload/process at least one track, and verify the
  track is `ready`.
- Android emulator access to a host backend should use a configurable base URL.
  For the Android emulator, `http://10.0.2.2:8000` should be documented as the
  usual host-loopback URL. Do not hard-code one environment.

## Task 3.1: Android Project Shell

### Goal

Create the initial Android project under `android/` with a buildable Kotlin +
Jetpack Compose app shell and no backend or playback behavior yet.

### Directories

- `android/`
- `android/app/`

### Main Files

- `android/settings.gradle.kts`
- `android/build.gradle.kts`
- `android/gradle.properties`
- `android/app/build.gradle.kts`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/.../MainActivity.kt`
- `android/app/src/main/java/.../ui/App.kt`

### Dependencies

- Accepted Phase 0 repository structure.
- Android Studio and Gradle environment available locally.

### Acceptance Criteria

- `android/` exists and contains a normal Android application module.
- The app launches to a Compose screen with the Easy Music app name.
- Package/application id is stable and documented in Gradle files.
- The project builds from Android Studio and with a Gradle command from
  `android/`.
- The task does not require the backend to be running.

### Do Not

- Do not implement login, networking, track list, or playback.
- Do not add placeholder source trees outside `android/`.
- Do not add offline cache, Room, WorkManager, recommendation, or AI code.

## Task 3.2: App Architecture Skeleton

### Goal

Add the Android app module structure for UI, navigation, configuration,
networking, auth, library, and playback boundaries without implementing feature
behavior.

### Directories

- `android/app/src/main/java/.../core/`
- `android/app/src/main/java/.../core/config/`
- `android/app/src/main/java/.../core/network/`
- `android/app/src/main/java/.../auth/`
- `android/app/src/main/java/.../library/`
- `android/app/src/main/java/.../player/`
- `android/app/src/main/java/.../ui/`

### Main Files

- `android/app/src/main/java/.../core/config/AppConfig.kt`
- `android/app/src/main/java/.../core/network/ApiClient.kt`
- `android/app/src/main/java/.../ui/AppNavGraph.kt`
- `android/app/src/main/java/.../auth/AuthRoutes.kt`
- `android/app/src/main/java/.../library/LibraryRoutes.kt`
- `android/app/src/main/java/.../player/PlayerRoutes.kt`

### Dependencies

- Task 3.1.

### Acceptance Criteria

- The app has explicit package/module boundaries for auth, library, and player.
- Compose navigation can switch between placeholder Login, Library, and Now
  Playing screens.
- API base URL is represented as configuration and can be changed for emulator
  versus physical-device testing.
- The project still builds without requiring backend connectivity.

### Do Not

- Do not call real backend endpoints yet.
- Do not implement token persistence yet.
- Do not create Media3 service classes yet.

## Task 3.3: Phase 1 API Models And Client

### Goal

Implement typed Android client models and API calls for the accepted Phase 1
backend contract.

### Directories

- `android/app/src/main/java/.../core/network/`
- `android/app/src/main/java/.../auth/data/`
- `android/app/src/main/java/.../library/data/`

### Main Files

- `android/app/src/main/java/.../core/network/ApiClient.kt`
- `android/app/src/main/java/.../core/network/ApiResult.kt`
- `android/app/src/main/java/.../auth/data/AuthApi.kt`
- `android/app/src/main/java/.../auth/data/AuthModels.kt`
- `android/app/src/main/java/.../library/data/TrackApi.kt`
- `android/app/src/main/java/.../library/data/TrackModels.kt`
- `android/app/src/main/java/.../library/data/TagModels.kt`

### Dependencies

- Task 3.2.
- Phase 1 backend API contract.

### Acceptance Criteria

- Android has models for login request, token response, current user, tag, and
  track response.
- Android has callable client functions for:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/tracks`
  - `GET /api/tracks/{track_id}`
  - `GET /api/tags`
- The stream URL builder for `GET /api/tracks/{track_id}/stream` exists, but
  playback is not implemented in this task.
- Bearer token injection is supported for authenticated calls.
- Network errors, 401 responses, and non-JSON errors are represented in a way
  ViewModels can display.

### Do Not

- Do not invent search, recommendation, playback-event, feedback-event, or cache
  endpoints.
- Do not implement login UI behavior beyond what is needed to exercise the
  client in tests or previews.
- Do not start Media3 playback.

## Task 3.4: Auth Token Storage

### Goal

Persist and restore the Phase 1 bearer token using Android DataStore.

### Directories

- `android/app/src/main/java/.../auth/data/`
- `android/app/src/main/java/.../auth/domain/`

### Main Files

- `android/app/src/main/java/.../auth/data/AuthTokenStore.kt`
- `android/app/src/main/java/.../auth/domain/AuthSession.kt`
- `android/app/src/main/java/.../auth/domain/AuthRepository.kt`

### Dependencies

- Task 3.3.

### Acceptance Criteria

- Successful token save, read, and clear behavior is implemented through
  DataStore.
- App startup can distinguish unknown/checking, authenticated, and
  unauthenticated session states.
- Logout clears the local token even if the backend logout request fails.
- No password is persisted.

### Do Not

- Do not store tokens in plain SharedPreferences.
- Do not add refresh-token behavior because Phase 1 does not provide it.
- Do not implement biometric unlock or account management.

## Task 3.5: Login Screen

### Goal

Implement Android login using `POST /api/auth/login`, store the bearer token,
and route authenticated users into the app.

### Directories

- `android/app/src/main/java/.../auth/ui/`
- `android/app/src/main/java/.../auth/domain/`
- `android/app/src/main/java/.../ui/`

### Main Files

- `android/app/src/main/java/.../auth/ui/LoginScreen.kt`
- `android/app/src/main/java/.../auth/ui/LoginViewModel.kt`
- `android/app/src/main/java/.../auth/domain/AuthRepository.kt`
- `android/app/src/main/java/.../ui/AppNavGraph.kt`

### Dependencies

- Task 3.4.
- Running Phase 1 backend for manual verification.

### Acceptance Criteria

- User can enter username and password and submit login.
- Successful login stores `access_token` and navigates to the authenticated
  area.
- Invalid credentials display a clear error and do not store a token.
- Loading state prevents duplicate submits.
- Restarting the app with a valid stored token skips the login screen after
  session restoration.

### Do Not

- Do not add user registration.
- Do not add password reset.
- Do not call any API outside Phase 1 Auth endpoints.

## Task 3.6: Session Restore And Logout

### Goal

Validate stored sessions with `GET /api/auth/me`, handle expired/invalid
tokens, and provide logout.

### Directories

- `android/app/src/main/java/.../auth/`
- `android/app/src/main/java/.../ui/`

### Main Files

- `android/app/src/main/java/.../auth/ui/SessionViewModel.kt`
- `android/app/src/main/java/.../auth/domain/AuthRepository.kt`
- `android/app/src/main/java/.../ui/AppScaffold.kt`
- `android/app/src/main/java/.../ui/AppNavGraph.kt`

### Dependencies

- Task 3.5.

### Acceptance Criteria

- App startup calls `GET /api/auth/me` when a token exists.
- Valid token routes to the library area.
- Invalid or expired token clears local auth state and routes to login.
- Logout calls `POST /api/auth/logout`, clears local token, and returns to
  login.
- Auth failures from later API calls can trigger the same sign-out path.

### Do Not

- Do not implement multi-account switching.
- Do not persist user profile data beyond what is necessary for current session
  display.
- Do not add server-side token revocation assumptions beyond current logout
  behavior.

## Task 3.7: Track Library List

### Goal

Show the cloud music library from `GET /api/tracks` and make ready/non-ready
status clear.

### Directories

- `android/app/src/main/java/.../library/ui/`
- `android/app/src/main/java/.../library/domain/`
- `android/app/src/main/java/.../library/data/`

### Main Files

- `android/app/src/main/java/.../library/ui/LibraryScreen.kt`
- `android/app/src/main/java/.../library/ui/LibraryViewModel.kt`
- `android/app/src/main/java/.../library/domain/TrackRepository.kt`
- `android/app/src/main/java/.../library/data/TrackApi.kt`

### Dependencies

- Task 3.6.
- At least one backend track for manual verification.

### Acceptance Criteria

- Authenticated user can load the track list.
- Empty, loading, error, and loaded states are visible.
- Track rows show title, artist/album when available, duration when available,
  status, and tags when useful.
- Pull-to-refresh or an explicit refresh action reloads from the backend.
- Non-ready tracks are visible but clearly not playable.
- Selecting a track navigates to the detail or Now Playing entry point.

### Do Not

- Do not implement server-side search because Phase 1 has no search endpoint.
- Do not upload, edit, or delete tracks from Android in Phase 3.
- Do not hide processing or failed tracks unless the UI explicitly explains the
  current filter.

## Task 3.8: Track Detail And Now Playing Placeholder

### Goal

Add a focused track detail or Now Playing screen backed by
`GET /api/tracks/{track_id}` before playback is wired in.

### Directories

- `android/app/src/main/java/.../library/ui/`
- `android/app/src/main/java/.../player/ui/`

### Main Files

- `android/app/src/main/java/.../library/ui/TrackDetailScreen.kt`
- `android/app/src/main/java/.../library/ui/TrackDetailViewModel.kt`
- `android/app/src/main/java/.../player/ui/NowPlayingScreen.kt`

### Dependencies

- Task 3.7.

### Acceptance Criteria

- Selecting a track opens a screen with fresh detail data from
  `GET /api/tracks/{track_id}`.
- Detail screen shows metadata, tags, liked state, cooldown date when present,
  and playback readiness.
- Ready tracks show a Play action placeholder.
- Non-ready tracks disable Play and explain that only ready tracks can stream.
- Detail errors include not found and unauthorized states.

### Do Not

- Do not implement metadata editing in Android.
- Do not implement playback in this task.
- Do not add recommendation, feedback, or history UI.

## Task 3.9: Foreground Online Playback With Media3 ExoPlayer

### Goal

Play ready tracks online through Media3 ExoPlayer using the authenticated stream
endpoint.

### Directories

- `android/app/src/main/java/.../player/data/`
- `android/app/src/main/java/.../player/domain/`
- `android/app/src/main/java/.../player/ui/`

### Main Files

- `android/app/src/main/java/.../player/data/AuthenticatedDataSourceFactory.kt`
- `android/app/src/main/java/.../player/domain/PlayerController.kt`
- `android/app/src/main/java/.../player/ui/NowPlayingScreen.kt`
- `android/app/src/main/java/.../player/ui/NowPlayingViewModel.kt`

### Dependencies

- Task 3.8.
- A ready backend track.

### Acceptance Criteria

- Pressing Play on a ready track starts streaming from
  `GET /api/tracks/{track_id}/stream`.
- The stream request includes `Authorization: Bearer <token>`.
- ExoPlayer can load MP3 playback files generated by the Phase 1 worker.
- Play, pause, seek, buffering, duration, position, and error states are visible
  in the UI.
- A 401 or 404 playback response produces a useful UI error.
- Non-ready tracks cannot start playback.

### Do Not

- Do not download or persist audio files for offline use.
- Do not emit playback history or feedback events.
- Do not implement background service behavior in this task.

## Task 3.10: Playback State UI Synchronization

### Goal

Make Library, Detail, and Now Playing reflect one shared playback state.

### Directories

- `android/app/src/main/java/.../player/domain/`
- `android/app/src/main/java/.../player/ui/`
- `android/app/src/main/java/.../library/ui/`

### Main Files

- `android/app/src/main/java/.../player/domain/PlaybackStateStore.kt`
- `android/app/src/main/java/.../player/ui/MiniPlayer.kt`
- `android/app/src/main/java/.../player/ui/NowPlayingScreen.kt`
- `android/app/src/main/java/.../library/ui/LibraryScreen.kt`

### Dependencies

- Task 3.9.

### Acceptance Criteria

- The app exposes a single current track, playback status, position, duration,
  and buffering/error state to Compose UI.
- Library indicates the currently playing track.
- Mini player appears in authenticated screens when a track is loaded.
- Opening Now Playing shows the same state as the mini player.
- Pausing, resuming, seeking, or playback completion updates all visible UI.

### Do Not

- Do not create multiple competing ExoPlayer instances for separate screens.
- Do not add queue, playlist, shuffle, or repeat unless already required by
  simple single-track playback.
- Do not write playback state to backend events.

## Task 3.11: Media3 Playback Service

### Goal

Move playback ownership into a Media3 `MediaSessionService` so audio can
continue when the app is backgrounded.

### Directories

- `android/app/src/main/java/.../player/service/`
- `android/app/src/main/java/.../player/domain/`

### Main Files

- `android/app/src/main/java/.../player/service/EasyMusicPlaybackService.kt`
- `android/app/src/main/java/.../player/service/MediaSessionConnector.kt`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/.../player/domain/PlayerController.kt`

### Dependencies

- Task 3.10.

### Acceptance Criteria

- Playback continues after pressing Home or switching apps.
- Returning to the app reconnects to the existing service/session.
- The service releases resources when playback is stopped and no session is
  needed.
- The manifest declares the required service and foreground-service permissions
  for the supported Android API levels.
- No duplicate playback starts when Activity is recreated.

### Do Not

- Do not implement offline cache.
- Do not add recommendation or event sync.
- Do not keep a foreground service alive when there is no active or paused
  playback session.

## Task 3.12: Notification And Lock Screen Controls

### Goal

Expose Media3 notification and lock screen controls for current playback.

### Directories

- `android/app/src/main/java/.../player/service/`
- `android/app/src/main/java/.../player/domain/`

### Main Files

- `android/app/src/main/java/.../player/service/EasyMusicPlaybackService.kt`
- `android/app/src/main/java/.../player/service/PlaybackNotificationConfig.kt`
- `android/app/src/main/AndroidManifest.xml`

### Dependencies

- Task 3.11.

### Acceptance Criteria

- Android notification shows current title and artist when available.
- Notification exposes play/pause and stop controls.
- Lock screen controls mirror the Media3 session state on supported Android
  versions.
- Notification actions update the in-app playback UI when the app is reopened
  or visible.
- Runtime notification permission behavior is handled for Android versions that
  require it.

### Do Not

- Do not implement custom artwork download if the backend has no cover-serving
  endpoint.
- Do not add next/previous controls unless a queue is implemented in a later
  task.
- Do not add offline cache actions to the notification.

## Task 3.13: Headset And Media Button Controls

### Goal

Handle headset and system media-button controls through the Media3 session.

### Directories

- `android/app/src/main/java/.../player/service/`
- `android/app/src/main/java/.../player/domain/`

### Main Files

- `android/app/src/main/java/.../player/service/EasyMusicPlaybackService.kt`
- `android/app/src/main/java/.../player/service/MediaSessionCallback.kt`
- `android/app/src/main/AndroidManifest.xml`

### Dependencies

- Task 3.12.

### Acceptance Criteria

- Wired or Bluetooth headset play/pause controls affect playback.
- System media buttons route through Media3 rather than custom broadcast hacks.
- State changes from headset controls update notification and in-app UI.
- Unplug/noisy-audio handling pauses playback if supported by the chosen Media3
  configuration.

### Do Not

- Do not add custom vendor-specific headset integrations.
- Do not add next/previous behavior unless a queue exists.
- Do not implement playback-history events.

## Task 3.14: Phase 3 Android Acceptance Documentation

### Goal

Document and run the end-to-end Phase 3 Android verification flow.

### Directories

- `docs/`
- `android/`

### Main Files

- `docs/ACCEPTANCE/PHASE_3_ACCEPTANCE.md`
- `docs/DEVELOPMENT.md`
- Android Gradle files or test files only if needed for documented checks.

### Dependencies

- Tasks 3.1 through 3.13.

### Acceptance Criteria

- `docs/ACCEPTANCE/PHASE_3_ACCEPTANCE.md` records automated and manual verification.
- The manual flow starts the accepted backend, uploads/processes a ready track
  if needed, logs into Android, loads library, opens detail, streams a ready
  track, backgrounds playback, uses notification controls, verifies lock screen
  controls, and verifies headset/media-button play-pause behavior.
- The document explicitly notes that offline cache, recommendation, AI
  Assistant, playback history, feedback events, and production deployment
  hardening remain outside Phase 3.
- `docs/DEVELOPMENT.md` includes concise Android setup and smoke-test notes.

### Do Not

- Do not mark Phase 3 accepted without manual playback verification on an
  emulator or device.
- Do not broaden scope into Phase 4 or later features.
- Do not add backend endpoints as part of acceptance documentation.

## Phase 3 Completion Acceptance

Phase 3 is complete when:

1. The Android app builds and launches.
2. The user can log in against the accepted Phase 1 backend.
3. The app persists the bearer token and restores a valid session.
4. The app lists tracks from `GET /api/tracks`.
5. The app displays track details from `GET /api/tracks/{track_id}`.
6. The app streams a `ready` track through
   `GET /api/tracks/{track_id}/stream` with bearer authentication.
7. Playback state stays synchronized between Library, mini player, and Now
   Playing.
8. Playback continues in the background through Media3.
9. Notification controls, lock screen controls, and headset play/pause controls
   work.
10. `docs/ACCEPTANCE/PHASE_3_ACCEPTANCE.md` records the automated and manual verification
    result.

