# V2.2 Playback Queue Acceptance

This document records acceptance for the first-class local playback queue work
implemented in V2.2.

## Scope

In scope:

- Web first-class local queue state with `history`, `current`, `upcoming`, and
  `baseCycleItems`.
- Web immediate play, play next, add to queue, previous, next, remove current
  or upcoming, clear, and drag reorder of upcoming items.
- Web playlist sequence, shuffled, and reverse queue generation.
- Web playlist-only repeat, including per-round shuffle reshuffle and manual
  item exclusion from repeat rounds.
- Web same-client source playlist change handling for active playlist queues.
- Android Media3 queue state aligned to the same queue model.
- Android Now Playing queue management for remove, clear, and drag reorder.
- Android playlist-only repeat controls and repeat-round MediaSource
  generation.
- Android same-client selected playlist refresh sync for the active source
  playlist queue.

Out of scope:

- Backend queue tables, queue endpoints, or persistent queue state.
- Cross-device queue sync.
- Queue persistence across Web page lifetime or Android process lifetime.
- Saving a temporary queue back to a playlist.
- Multi-playlist repeat.
- Single-track repeat.
- Generic repeat for manual, single-track, recommendation, or mixed queues.
- Recommendation algorithm changes.

Queue remains local temporary client state. Playlists are the durable backend
organization model; Queue is not a backend API resource.

## Acceptance Checklist

- [x] Acceptance doc records implemented scope.
- [x] Acceptance doc records explicit out-of-scope behavior.
- [x] Web automated checks pass.
- [x] Android automated checks pass.
- [x] Web browser smoke has been run.
- [x] Android emulator/device smoke has been run.
- [x] Docs state that Queue remains local temporary state with no backend queue
  API.

## Verification Record

### 2026-06-27 - V2.2 Queue Acceptance Pass

Implemented:

- Web queue provider and drawer manage `history`, `current`, `upcoming`, queue
  item identity, clear, remove, previous/next, upcoming reorder, and
  playlist-only repeat.
- Web library and playlist entry points feed the shared queue provider for
  immediate play, play next, add to queue, and playlist sequence/shuffle/reverse
  generation.
- Web playlist mutations and selected playlist refreshes synchronize the active
  same-client source playlist queue for future repeat rounds.
- Android Media3 connector publishes queue state to `PlayerUiState`, supports
  queue remove/clear/reorder from Now Playing, and generates playlist repeat
  rounds from `baseCycleItems`.
- Android playlist screen synchronizes selected source playlist changes back
  into the active queue.

Automated checks:

```powershell
cd web
npm run typecheck
npm run build

cd ..\android
.\gradlew.bat test
.\gradlew.bat build
```

Results:

- Web TypeScript check: passed.
- Web production build: passed.
- Android JVM tests: `BUILD SUCCESSFUL`.
- Android full build and lint: `BUILD SUCCESSFUL`.

Manual browser smoke:

- Environment: Chrome headless through DevTools Protocol against Vite
  `http://127.0.0.1:8081/`, with mocked authenticated API responses for queue
  UI verification.
- Covered single-track immediate play replacing an existing queue.
- Covered play next and add to queue from the Web library.
- Covered playlist sequence, shuffle, and reverse queue generation.
- Covered skipped non-ready playlist-track count.
- Covered previous and next controls.
- Covered current-item removal promoting the next item.
- Covered upcoming removal from the queue drawer.
- Covered clear queue.
- Covered drag reorder event for upcoming queue items.
- Covered playlist repeat toggle and shuffle repeat UI availability.

Result:

- Web manual browser smoke: passed.

Android emulator/device smoke:

- Manual Android emulator/device smoke was reported as passed on 2026-06-27.
- Covered the same queue semantics as Web: single-track immediate play
  replacing the queue, play next, add to queue, playlist sequence/shuffle/reverse
  generation, previous/next, remove current and upcoming, clear queue, upcoming
  reorder, and playlist repeat including shuffle repeat.
- Covered Android notification, lock-screen, and headset next/previous controls
  against the active Media3 queue.

Acceptance status:

- V2.2 playback queue automated acceptance: accepted.
- V2.2 Web manual product acceptance: accepted for the recorded browser smoke.
- V2.2 Android full manual product acceptance: accepted.
- V2.2 full manual product acceptance: accepted.
