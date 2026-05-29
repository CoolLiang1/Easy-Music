# Phase 4 Android Offline Cache Acceptance

This document records the Phase 4 Android Offline Cache verification flow for
Easy Music. Phase 4 builds on the accepted Phase 3 Android Media3 playback
architecture and adds manual single-track offline cache behavior around the
existing player.

Do not mark Phase 4 accepted until the manual offline playback checks below
have been run on an Android emulator or physical device against a backend with
at least one `ready` track.

## Scope

In scope for this acceptance pass:

- Authenticated backend playback-event bulk sync at `POST /api/playback-events`.
- Android local Room metadata for cached tracks and queued playback events.
- Manual caching of one `ready` track through
  `GET /api/tracks/{track_id}/stream`.
- Library, Track Detail, Cached Tracks, and Now Playing cache/offline status.
- Offline playback from an app-private cached audio file.
- Existing Media3 foreground playback, background playback, notification, lock
  screen, and headset/media-button controls.
- Local playback-event recording while online or offline, followed by retry
  sync after reconnecting.
- Deleting one selected cached track without deleting server track data.

Out of scope for Phase 4:

- Recommendation.
- AI Assistant.
- Web new features.
- Production deployment hardening.
- Automatic full-library offline sync.
- Complex download queue management.
- Background caching of the entire library.

## Automated Verification

Run backend checks from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Expected result:

- Backend tests pass.
- Coverage includes the authenticated playback-event sync endpoint, auth
  required, ownership validation, payload validation, duplicate retry, and
  successful bulk insert behavior.

Run Android checks from `android/`:

```powershell
.\gradlew.bat test
.\gradlew.bat build
```

Expected result:

- JVM tests pass.
- The Android app compiles.
- Cache database, local file-store, one-file deletion, playback source
  selection, playback-event recording, sync state, and retry handling stay
  covered by focused tests.
- No live backend is required for Android automated checks.

Latest local result, 2026-05-29:

- `.\.venv\Scripts\python.exe -m pytest` from `backend/`: passed, 55 tests.
- `.\gradlew.bat test` from `android/`: passed.
- `.\gradlew.bat build` from `android/`: passed.
- Manual emulator/device offline playback verification: pending.

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

4. Ensure at least one track is uploaded and processed to `ready`.

   The Web console smoke flow in `docs/DEVELOPMENT.md` can be used to upload a
   track. Process pending work with either command from the repository root:

   ```powershell
   docker compose run --rm worker
   docker compose up -d worker-loop
   ```

5. Confirm the track is `ready` before Android offline-cache verification.

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
6. Load Library and confirm tracks from `GET /api/tracks` appear.
7. Open a `ready` track and confirm Track Detail loads fresh data from
   `GET /api/tracks/{track_id}`.
8. Start manual cache for the selected `ready` track.
9. Confirm the cache action shows progress and then success.
10. Confirm the cached state appears in both Library and Track Detail.
11. Open Cached Tracks and confirm the cached track appears from local storage.
12. Disable network access or stop the backend API while keeping the Android
    app session locally available.
13. Open Cached Tracks again and confirm it remains usable without a backend
    request.
14. Play the cached track while offline and confirm Now Playing indicates
    cached/offline playback.
15. Press Home or switch apps and confirm cached playback continues through the
    existing Media3 service.
16. Use notification play/pause and stop controls and confirm they update
    playback.
17. On a supported Android version, lock the device and confirm lock screen
    controls mirror the Media3 session state.
18. Use wired or Bluetooth headset play/pause, or system media-button controls,
    and confirm playback state updates in the notification and in the app after
    reopening.
19. While still offline, pause, resume, seek, stop before completion, and play
    through completion where practical to create queued playback events.
20. Confirm the app shows pending or failed playback-event sync state.
21. Restore network access and the backend API.
22. Confirm queued playback events sync through
    `POST /api/playback-events`.
23. Delete the cached copy for the selected track from Track Detail or Cached
    Tracks.
24. Confirm the app asks for confirmation before deleting the cached file.
25. Confirm the cached track disappears from Cached Tracks and no longer shows
    as cached in Library or Track Detail.
26. Confirm the server track still exists by refreshing Library or calling
    `GET /api/tracks/{track_id}`.
27. Log out and confirm local auth state is cleared and the app returns to the
    login screen.

## Playback Event Sync Smoke Test

After login and a `ready` track are available, use the smoke test in
`docs/API_MANUAL_TESTING.md` to verify `POST /api/playback-events` directly.

Expected backend behavior:

- Missing auth returns `401 Unauthorized`.
- A valid Android event for a track owned by the authenticated user is accepted.
- Retrying the same `client_event_id` returns a duplicate result and does not
  insert another row.
- An event for a track not owned by the authenticated user is reported in
  `failed` without blocking other valid events in the same batch.

## Manual Verification Record

Record the result of an actual emulator or device run here before accepting
Phase 4:

- Device or emulator: pending.
- Android API level: pending.
- Backend base URL used: pending.
- Ready track ID/title: pending.
- Manual cache download for one ready track: pending.
- Library cache state: pending.
- Track Detail cache state: pending.
- Cached Tracks local list: pending.
- Cached Tracks usable while backend is unavailable: pending.
- Offline cached playback: pending.
- Background playback: pending.
- Notification controls: pending.
- Lock screen controls: pending.
- Headset/media-button controls: pending.
- Offline playback-event recording: pending.
- Playback-event sync after reconnecting: pending.
- Delete one cached track: pending.
- Server track preserved after cache deletion: pending.
- Logout: pending.
- Result: pending.

Current status, 2026-05-29:

- Phase 4 acceptance documentation is prepared.
- Phase 4 must not be marked accepted until the manual emulator/device offline
  playback verification record above is completed.
