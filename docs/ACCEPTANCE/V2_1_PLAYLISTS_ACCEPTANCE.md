# V2.1 Playlist Management Acceptance

This document records acceptance for ordinary user-built playlists in Easy
Music V2.1.

## Scope

In scope:

- Owner-scoped private playlists.
- Backend playlist and playlist-track models, migration, schemas, service, and
  API routes.
- Create, list, detail, rename, and delete playlists.
- Add owned tracks to a playlist.
- Repeatedly adding the same track is idempotent and leaves one relationship.
- Remove tracks from playlists.
- Reorder playlist tracks.
- Delete-track cleanup for playlist-track relationships.
- Web playlist management flow.
- Android playlist list/detail browsing and playback handoff to the existing
  Now Playing flow.
- A narrow backend service method that exposes playlist-track signals for
  future recommendation work.

Out of scope:

- Smart playlists.
- Public sharing.
- Collaborative playlists.
- Automatically generated playlists.
- Android playlist editing.
- Recommendation ranking changes.
- Playback architecture rewrites.

## API Shape

- `GET /api/playlists`
- `POST /api/playlists`
- `GET /api/playlists/{playlist_id}`
- `PATCH /api/playlists/{playlist_id}`
- `DELETE /api/playlists/{playlist_id}`
- `POST /api/playlists/{playlist_id}/tracks`
- `DELETE /api/playlists/{playlist_id}/tracks/{track_id}`
- `PUT /api/playlists/{playlist_id}/tracks/order`

## Acceptance Checklist

- [x] User can create a playlist.
- [x] User can rename a playlist.
- [x] User can delete their own playlist.
- [x] User cannot access or mutate another user's playlist.
- [x] User can add their own tracks to a playlist.
- [x] Repeated add of the same track is idempotent.
- [x] User cannot add another user's track to a playlist.
- [x] User can remove tracks from a playlist.
- [x] User can reorder playlist tracks.
- [x] Deleting a track removes playlist-track relationships.
- [x] Web playlist management compiles and builds.
- [x] Android can compile playlist list/detail browsing and hand a playlist
  track to existing playback.
- [x] Backend playlist CRUD, ownership, add/remove/reorder tests pass.
- [x] Web typecheck/build pass.
- [x] Android related tests/build pass.
- [x] Manual browser playlist smoke has been run.
- [x] Android emulator/device playlist playback smoke has been run.

## Verification Record

Append dated verification results here. Do not mark V2.1 accepted until the
checks actually run in the current environment.

### 2026-06-26 - Implementation Pass

Implemented:

- Added `playlists` and `playlist_tracks` database tables through Alembic.
- Added owner-scoped backend playlist service and API routes.
- Added idempotent add-track behavior for duplicate playlist additions.
- Added reorder validation requiring exactly the current playlist track ids.
- Added explicit playlist-track cleanup in track deletion.
- Added Web `/playlists` management page with create, rename, delete, add,
  remove, order controls, and Web playback from playlist rows.
- Added Android playlist route, bottom navigation entry, list/detail UI, JSON
  models, repository, and playback handoff to the existing Now Playing flow.
- Added backend and Android focused tests.

Automated checks run so far:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_playlists_api.py

cd ..\web
npm run typecheck

cd ..\android
.\gradlew.bat testDebugUnitTest --tests "com.easymusic.app.playlist.*"
```

Results:

- Backend focused playlist API tests: 14 passed.
- Web TypeScript check: passed.
- Android focused playlist tests: build successful.

Final automated checks run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m alembic heads
```

Results:

- Full backend test suite: 320 passed, 2 skipped. The skipped checks were
  symlink-escape coverage because Windows symlink creation was unavailable in
  this environment.
- Alembic heads: `20260626_0009 (head)`.

Final Web checks run from `web/`:

```powershell
npm run build
```

Results:

- `npm run build`: passed. The build includes `tsc --noEmit`.

Final Android checks run from `android/`:

```powershell
.\gradlew.bat build
```

Results:

- Android build: `BUILD SUCCESSFUL`.
- Gradle reported existing deprecation warnings for future Gradle 9
  compatibility and an informational native-library strip message; neither
  failed the build.

Manual checks:

- Manual browser playlist smoke: passed.
- Android emulator/device playlist playback smoke: passed.

Acceptance status:

- V2.1 automated acceptance: accepted.
- V2.1 full manual product acceptance: accepted.
