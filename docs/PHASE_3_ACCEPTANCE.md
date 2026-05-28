# Phase 3 Android Acceptance

This document records the Phase 3 Android verification flow for Easy Music.
Phase 3 uses only the accepted Phase 1 backend API:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/tracks`
- `GET /api/tracks/{track_id}`
- `GET /api/tracks/{track_id}/stream`
- `GET /api/tags`

Do not mark Phase 3 accepted until the manual playback checks below have been
run on an Android emulator or physical device against a backend with at least
one `ready` track.

## Scope

In scope for this acceptance pass:

- Android login and session restoration against the Phase 1 backend.
- Android track library and track detail reads.
- Authenticated online streaming for `ready` tracks.
- Shared playback state across Library, mini player, and Now Playing.
- Media3 background playback service.
- Notification, lock screen, headset, and media-button play/pause controls.

Out of scope for Phase 3:

- Offline cache.
- Recommendation.
- AI Assistant.
- Web feature work.
- Playback history events.
- Feedback events.
- Production deployment hardening.
- New backend endpoints.

## Automated Verification

Run these checks from `android/`:

```powershell
.\gradlew.bat build
.\gradlew.bat test
```

Expected result:

- The Android app compiles.
- Available JVM unit tests pass. If no unit tests exist yet, Gradle should
  report the relevant test task as passing or having no sources.
- No backend process is required for automated build and test checks.

Latest local result, 2026-05-28:

- `.\gradlew.bat build`: passed.
- `.\gradlew.bat test`: passed.
- Manual emulator/device playback verification was not run from this command
  line session and remains required before Phase 3 can be accepted.

## Backend Preparation

Use development-only local values. Do not write production hosts, usernames,
passwords, or tokens into the Android app or this document.

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

4. Ensure at least one track is uploaded and processed to `ready`.

   The Web console smoke flow in `docs/DEVELOPMENT.md` can be used to upload a
   track. Process pending work with either command from the repository root:

   ```powershell
   docker compose run --rm worker
   docker compose up -d worker-loop
   ```

5. Confirm the track is `ready` before Android playback verification.

## Android Setup

The Android backend base URL must remain configurable.

- Android emulator to host backend: use `http://10.0.2.2:8000`.
- Physical Android device: use the host machine LAN URL, for example
  `http://<host-lan-ip>:8000`, and allow that host in the debug network
  security config if cleartext HTTP is used.
- `adb reverse tcp:8000 tcp:8000` may be used with a connected device or
  emulator when the app is configured for `http://127.0.0.1:8000`.

Do not hard-code production URLs, credentials, or bearer tokens.

## Manual Acceptance Flow

Run this flow on an emulator or physical Android device:

1. Start the accepted backend with PostgreSQL, migrations, API, and a local
   user.
2. Upload and process a supported audio file until at least one track has
   `status = ready`.
3. Open the Android app from Android Studio or install a debug APK.
4. Configure the Android base URL for the target environment:
   `http://10.0.2.2:8000` for the stock emulator host-loopback case, the host
   LAN URL for a physical device, or `http://127.0.0.1:8000` when using
   `adb reverse`.
5. Log in with the local user.
6. Confirm a successful login stores the bearer token and routes to Library.
7. Close and reopen the app. Confirm `GET /api/auth/me` restores the session
   and skips the login screen.
8. Load Library and confirm tracks from `GET /api/tracks` appear.
9. Confirm non-ready tracks remain visible but are clearly not playable.
10. Tap a track and confirm Track Detail loads fresh data from
    `GET /api/tracks/{track_id}`.
11. On a `ready` track, tap Play and confirm Now Playing opens.
12. Tap Play in Now Playing and confirm audio streams from
    `GET /api/tracks/{track_id}/stream` with bearer authentication.
13. Verify play, pause, seek, buffering, duration, position, and playback error
    states are visible where applicable.
14. Return to Library and confirm the mini player and currently playing row
    reflect the same playback state as Now Playing.
15. Press Home or switch apps and confirm playback continues through the Media3
    service.
16. Use the notification play/pause and stop controls and confirm they update
    playback.
17. On a supported Android version, lock the device and confirm lock screen
    controls mirror the Media3 session state.
18. Use wired or Bluetooth headset play/pause, or system media-button controls,
    and confirm playback state updates in the notification and in the app after
    reopening.
19. Unplug or trigger noisy-audio behavior if available and confirm playback
    pauses when the platform and Media3 configuration support it.
20. Log out and confirm local token state is cleared and the app returns to the
    login screen.

## Manual Verification Record

Record the result of an actual emulator or device run here before accepting
Phase 3:

- Device or emulator:
- Android API level:
- Backend base URL used:
- Ready track ID/title:
- Login/session restore:
- Library:
- Track detail:
- Foreground streaming:
- Shared playback UI:
- Background playback:
- Notification controls:
- Lock screen controls:
- Headset/media-button controls:
- Logout:
- Result:

Current status, 2026-05-28:

- Manual emulator/device playback verification has not been recorded in this
  repository yet.
- Phase 3 must remain unaccepted until the manual verification record above is
  completed with a passing result.
