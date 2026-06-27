# V2.2 Playback Queue Tasks

This document turns `docs/SPECS/PLAYBACK_QUEUE.md` into executable work slices.

V2.2 focuses on a first-class local playback queue module. It should not add a
backend queue service and should not rewrite recommendations.

## Required Reading

Before implementing any task here, read:

- `AGENTS.md`
- `README.md`
- `docs/SPECS/PLAYBACK_QUEUE.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- Current Web player and playlist code.
- Current Android Media3 player and playlist code.

## Current Baseline

Available before V2.2:

- Backend persisted owner-scoped playlists and ordered playlist-track detail.
- Web playlist management and library-to-playlist add flow.
- Web basic playlist playback entry points for sequence, shuffle-once, and
  reverse queue generation.
- Android playlist browsing and basic Media3 queue playback entry points.

This baseline is not yet the final queue model. Queue state still needs to be
promoted into a first-class client module with history/current/upcoming,
queue-item identity, editing, repeat, and dedicated management UI.

## V2.2 Scope

In scope:

- Local temporary playback queues on Web and Android.
- Queue item ids that allow duplicate tracks in one queue.
- `history`, `current`, `upcoming`, and `baseCycleItems` semantics.
- Immediate play, play next, add to queue, previous, next, remove, clear.
- Playlist sequence, shuffle-once, and reverse queue generation.
- Playlist-only repeat from the queue management UI.
- Web queue drawer.
- Android queue management surface from Now Playing.
- Drag reorder of upcoming items.
- Same-client source playlist change handling for active playlist repeat.
- Automated and manual acceptance records.

Out of scope:

- Backend queue model or API.
- Cross-device queue sync.
- Queue persistence after page/process lifetime.
- Queue save-to-playlist.
- Multiple playlists combined into one looping queue.
- Single-track repeat.
- Generic repeat for non-playlist queues.
- Recommendation algorithm changes.

## Recommended Implementation Order

1. Define shared product semantics through tests and client queue models.
2. Build the Web queue store and adapt existing Web playback to use it.
3. Add Web queue drawer and queue editing.
4. Align Android Media3 queue state with the same semantics.
5. Add Android queue management UI.
6. Add playlist repeat and same-client playlist-change handling.
7. Update docs and acceptance records after verification.

## Task V2.2.1: Queue Core Model And Web Store

### Goal

Create a first-class Web playback queue state module that represents the spec's
core model without yet building the full drawer UI.

### Directories

- `web/src/player/` or another clearly named Web queue module directory
- `web/src/components/`
- `web/src/pages/`
- `web/src/types/`
- `docs/`

### Main Files

- New Web queue model/store, for example `web/src/player/PlaybackQueueProvider.tsx`
- Existing `web/src/components/WebAudioPlayer.tsx`
- Existing playlist and library pages that trigger playback
- New focused Web unit tests if a test framework exists, or strongly typed
  reducer tests if added in a later task

### Acceptance Criteria

- Web has a single queue state owner rather than queue state living only inside
  playlist detail.
- Queue state contains:
  - `history`
  - `current`
  - `upcoming`
  - `baseCycleItems`
  - source metadata
  - generation mode
  - repeat flag
- Queue items have local `queueItemId`.
- Duplicate track ids can appear as distinct queue items.
- Queue actions exist for:
  - immediate play
  - replace from playlist
  - play next
  - add to queue tail
  - previous
  - next
  - remove queue item
  - clear queue
- Previous uses actual history and does not implement seek-to-start behavior.
- Drag reorder logic is represented as an action on upcoming, even if UI is
  added later.
- Queue operations do not call playlist mutation APIs.
- Existing single-track Web playback still works.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not add backend APIs.
- Do not persist queue state in localStorage.
- Do not build the full drawer UI in this task unless it is trivial after the
  store exists.
- Do not change recommendation behavior.

## Task V2.2.2: Web Queue Entry Points

### Goal

Route existing Web playback actions through the queue store.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/player/`
- `web/src/api/`
- `docs/`

### Main Files

- `web/src/pages/PlaylistsPage.tsx`
- `web/src/pages/LibraryPage.tsx`
- `web/src/components/TrackTable.tsx`
- `web/src/pages/TrackDetailPage.tsx`
- Web queue provider/store files

### Dependencies

- Task V2.2.1.

### Acceptance Criteria

- Playlist detail sequence play replaces the current queue after confirmation
  if another queue is active.
- Playlist detail shuffle play creates one shuffled round with no repeats.
- Playlist detail reverse play creates a reversed queue.
- Generated queues filter non-ready tracks and show skipped-count feedback.
- Empty or no-ready playlists do not create a queue and show a clear message.
- Single-track immediate play replaces the current queue.
- Library and track surfaces can expose play next and add to queue actions
  where appropriate.
- Play next inserts at upcoming head.
- Add to queue inserts at upcoming tail.
- Runtime track load failure shows an error and attempts to continue.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not mutate source playlists from queue actions.
- Do not add playlist repeat yet unless Task V2.2.6 is being implemented.
- Do not add recommendation queue behavior.

## Task V2.2.3: Web Queue Drawer And Editing UI

### Goal

Add a global Web queue management drawer for current and upcoming items.

### Directories

- `web/src/components/`
- `web/src/layout/`
- `web/src/player/`
- `web/src/styles.css`
- `docs/`

### Main Files

- New queue drawer component, for example `web/src/components/PlaybackQueueDrawer.tsx`
- Web layout or mini-player components that open the drawer
- Web queue store/provider files
- Existing CSS

### Dependencies

- Task V2.2.1.
- Task V2.2.2.

### Acceptance Criteria

- Web has a global "Playback Queue" entry point from the player area.
- Drawer shows:
  - source type and playlist name when present
  - generation mode
  - repeat status
  - played count summary
  - upcoming count summary
  - current item
  - upcoming item list
- Drawer does not show editable history.
- Upcoming items can be removed one at a time.
- Current item can be removed, causing immediate transition to next item or
  stop according to the spec.
- Clear queue asks for confirmation when playing, then stops playback and
  clears all queue state.
- Upcoming items can be drag reordered.
- Drag reorder does not affect current or history.
- Duplicate tracks remain independently removable/reorderable through
  `queueItemId`.
- Drawer works on desktop and narrow viewports without overlapping controls.
- `npm run typecheck` and `npm run build` pass.

### Do Not

- Do not add history editing.
- Do not add save queue as playlist.
- Do not add visual redesign beyond what the queue drawer needs.

## Task V2.2.4: Android Queue Core Alignment

### Goal

Align Android Media3 playback with the same queue semantics used by Web.

### Directories

- `android/app/src/main/java/com/easymusic/app/player/`
- `android/app/src/main/java/com/easymusic/app/playlist/`
- `android/app/src/test/java/com/easymusic/app/player/`
- `docs/`

### Main Files

- `PlayerController.kt`
- `PlaybackStateStore.kt`
- `MediaSessionConnector.kt`
- `NowPlayingViewModel.kt`
- Playlist route/screen files that start playback
- New Android JVM tests for queue state where practical

### Dependencies

- `docs/SPECS/PLAYBACK_QUEUE.md`

### Acceptance Criteria

- Android queue state can represent history/current/upcoming and source
  metadata.
- Media3 queue items can be mapped back to local queue items, not only track
  ids.
- Duplicate track ids can exist as separate queue items.
- Immediate play replaces the queue.
- Play next inserts at upcoming head without interrupting current playback.
- Add to queue inserts at upcoming tail without interrupting current playback.
- Previous uses actual history.
- Next uses upcoming.
- Removing current follows the spec's next/stop behavior.
- Clearing queue stops playback and clears player state.
- Notification, lock-screen, and headset next/previous controls operate on the
  active queue.
- Android focused JVM tests cover queue reducer/controller behavior where
  practical.
- `.\gradlew.bat test` or focused relevant tests pass.
- `.\gradlew.bat build` passes.

### Do Not

- Do not persist queue state to Room or DataStore.
- Do not add backend APIs.
- Do not rewrite offline cache selection unless a queue item must reuse the
  existing source selector.

## Task V2.2.5: Android Queue Management UI

### Goal

Expose queue management from Android Now Playing.

### Directories

- `android/app/src/main/java/com/easymusic/app/player/ui/`
- `android/app/src/main/java/com/easymusic/app/playlist/ui/`
- `android/app/src/test/`
- `docs/`

### Main Files

- `NowPlayingScreen` / `NowPlayingRouteContent` related files
- `MiniPlayer.kt` if a queue entry button is added
- New queue list composables
- Android queue state/viewmodel files

### Dependencies

- Task V2.2.4.

### Acceptance Criteria

- Now Playing exposes a queue page, tab, or bottom sheet.
- UI shows current and upcoming.
- UI shows source, generation mode, repeat state, played count, and upcoming
  count.
- UI does not expose editable history.
- Upcoming queue items can be removed.
- Current item can be removed with the spec's transition behavior.
- Clear queue asks for confirmation when playing.
- Upcoming items can be drag reordered.
- Drag reorder updates the Media3 queue and client queue state consistently.
- Empty queue, single-item queue, duplicate-track queue, and playback-error
  states are understandable.
- Android build passes.
- Emulator/device smoke is required before manual acceptance is marked
  complete.

### Do Not

- Do not add Android playlist editing.
- Do not add queue persistence.
- Do not add recommendation queue behavior.

## Task V2.2.6: Playlist Repeat And Source Playlist Change Handling

### Goal

Implement playlist-only repeat and same-client source playlist change behavior
on Web and Android.

### Directories

- `web/src/player/`
- `web/src/pages/`
- `web/src/components/`
- `android/app/src/main/java/com/easymusic/app/player/`
- `android/app/src/main/java/com/easymusic/app/playlist/`
- `docs/`

### Dependencies

- Task V2.2.1.
- Task V2.2.3.
- Task V2.2.4.
- Task V2.2.5.

### Acceptance Criteria

- Repeat toggle appears in queue UI only for queues generated from one
  playlist.
- Repeat is hidden or disabled for single-track, manual, recommendation, or
  mixed queues.
- Sequence repeat regenerates the same sequence each round.
- Reverse repeat regenerates the same reverse sequence each round.
- Shuffle repeat reshuffles each round, with no repeats inside a round.
- Shuffle repeat avoids repeating the previous round's final track as the next
  round's first track when practical.
- Temporary manually inserted items do not repeat.
- Removing a base playlist item from the queue affects only the current round.
- Same-client source playlist track removal updates future rounds and removes
  matching upcoming base items.
- Same-client source playlist ready-track addition affects the next round, not
  the current round.
- If the source playlist has no playable base tracks left, repeat is disabled
  and the UI explains why.
- Web typecheck/build pass.
- Android tests/build pass.

### Do Not

- Do not sync queue state across devices.
- Do not watch backend changes in real time.
- Do not implement multi-playlist loop.
- Do not implement single-track repeat.

### Implementation Notes

- Implemented Web playlist-only repeat in the local queue provider, including
  sequence/reverse round regeneration, shuffle round reshuffle, manual-item
  exclusion, and same-client playlist source sync from Web playlist mutations.
- Implemented Android playlist repeat controls and same-client selected
  playlist refresh sync for the Media3 queue state, including generated
  repeat-round MediaSources for playlist queue continuation.
- Verified with Web `npm run typecheck`, Web `npm run build`, Android
  `.\gradlew.bat test`, and Android `.\gradlew.bat build`.

## Task V2.2.7: Queue Acceptance And Manual Smoke

### Goal

Record automated and manual verification for the completed queue behavior.

### Directories

- `docs/ACCEPTANCE/`
- `docs/DEVELOPMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `web/`
- `android/`

### Dependencies

- The implementation tasks being accepted.

### Acceptance Criteria

- Acceptance doc records:
  - implemented scope
  - explicit out-of-scope behavior
  - Web automated checks
  - Android automated checks
  - manual browser smoke
  - Android emulator/device smoke
- Web manual smoke covers:
  - single-track immediate play replaces queue
  - play next and add to queue
  - playlist sequence/shuffle/reverse generation
  - skipped non-ready count
  - previous/next
  - remove current and upcoming
  - clear queue
  - drag reorder upcoming
  - playlist repeat, including shuffle repeat
- Android manual smoke covers the same queue semantics plus notification,
  lock-screen, and headset next/previous.
- Docs state that Queue remains local temporary state with no backend queue API.
- `npm run typecheck` and `npm run build` pass.
- `.\gradlew.bat test` or focused relevant tests pass.
- `.\gradlew.bat build` passes.

### Do Not

- Do not mark full manual acceptance complete without an actual browser smoke
  and Android emulator/device run.
- Do not mark backend queue behavior accepted, because there is no backend
  queue system by design.

## Suggested Test Range

Web:

```powershell
cd web
npm run typecheck
npm run build
```

Android:

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat build
```

Backend:

Backend tests are not required for pure queue tasks unless playlist detail or
track response contracts change. If backend playlist behavior changes, run the
focused playlist tests and then broader backend regression as appropriate:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_playlists_api.py
```

## General Codex Prompt For Each V2.2 Session

Use this prompt at the start of each implementation session, replacing the task
number and title:

```text
Please execute docs/TASKS/V2_2_PLAYBACK_QUEUE_TASKS.md Task V2.2.x: <task title>.

Read first:
- AGENTS.md
- README.md
- docs/SPECS/PLAYBACK_QUEUE.md
- docs/TASKS/V2_2_PLAYBACK_QUEUE_TASKS.md
- docs/ROADMAP.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT.md
- The current Web player/playlist/library code listed in the task.
- The current Android Media3 player/playlist code listed in the task.

Requirements:
- Complete only the current task. Do not implement later V2.2 queue tasks early.
- Keep Queue local and temporary. Do not add backend queue tables or endpoints.
- Preserve Playlist as the durable organization model. Queue edits must not
  modify playlists unless the task explicitly edits playlist management.
- Preserve existing recommendation behavior.
- Preserve existing playback architecture where practical; extend it through
  queue state and Media3 queue controls rather than rewriting it.
- Maintain Web and Android Queue semantics from docs/SPECS/PLAYBACK_QUEUE.md.
- Run the relevant Web/Android checks for the touched area and state any checks
  that could not be run.
- Inspect the diff before finishing.
```
