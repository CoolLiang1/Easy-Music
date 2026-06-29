# V2.1 Playback Queue Acceptance

This document records acceptance for client-side playback queues built on top
of ordinary V2.1 playlists.

## Scope

In scope:

- Web local playback queue generated from a playlist's ordered tracks.
- Web current index, previous, next, and automatic next on track end.
- Web playlist sequence playback.
- Web playlist shuffled-once playback, with no repeated track within that
  generated queue.
- Web playlist reverse playback.
- Android Media3 playlist queues built from playlist tracks.
- Android playlist sequence playback.
- Android shuffled-once playback, with no repeated track within that generated
  queue.
- Android reverse playback.
- Android notification, lock-screen, and headset next/previous commands
  operating on the current Media3 queue.
- Empty playlists and playlists without ready tracks showing clear disabled or
  error states.

Out of scope:

- Cross-device queue sync.
- Server-side persistent playback queues.
- Smart playlists.
- Later-play queues.
- Queue drag reorder.
- Single-track repeat.
- List repeat.
- Recommendation algorithm changes.

## Acceptance Checklist

- [x] Web playlist detail can start sequence playback for the whole playable
  playlist.
- [x] Web playlist detail can start shuffled-once playback without repeats in
  that generated queue.
- [x] Web playlist detail can start reverse playback.
- [x] Web automatically advances to the next queue item when the current track
  ends.
- [x] Web previous/next controls use the current queue.
- [x] Android playlist detail can start sequence playback for the whole
  playable playlist.
- [x] Android playlist detail can start shuffled-once playback without repeats
  in that generated queue.
- [x] Android playlist detail can start reverse playback.
- [x] Android notification, lock-screen, and headset next/previous commands are
  no longer blocked and target the Media3 queue.
- [x] Empty playlists and playlists without ready tracks have reasonable
  disabled or error states.
- [x] Web typecheck/build pass.
- [x] Android related tests/build pass.
- [x] No backend changes were needed because playlist detail already returns
  stable position-ordered tracks.

## Verification Record

### 2026-06-26 - Implementation Pass

Implemented:

- Added a reusable Web playback queue player while preserving the existing
  single-track Web player API.
- Added Web playlist detail controls for sequence, shuffled-once, and reverse
  playback.
- Added Web queue current index, previous/next controls, and automatic advance
  on `ended`.
- Added Android queue mode and queue metadata to player UI state.
- Added `PlayerController.playQueue` to build Media3 queues from playlist
  tracks.
- Added Media3 media-item transition handling so current track state follows
  queue next/previous and automatic transitions.
- Stopped blocking Media3 next/previous commands and exposed previous/next
  notification buttons.
- Added Android playlist detail controls for sequence, shuffled-once, and
  reverse playback.

Automated checks:

```powershell
cd web
npm run typecheck
npm run build

cd ..\android
.\gradlew.bat testDebugUnitTest --tests "com.easymusic.app.playlist.*"
.\gradlew.bat build
```

Results:

- Web TypeScript check: passed.
- Web production build: passed.
- Android playlist focused unit tests: `BUILD SUCCESSFUL`.
- Android full build: `BUILD SUCCESSFUL`.

Manual checks:

- Manual browser playlist queue smoke: superseded by the accepted V2.2 playback
  queue smoke record.
- Android emulator/device playlist queue and system controls smoke: superseded
  by the accepted V2.2 playback queue smoke record.

Acceptance status:

- V2.1 playback queue automated acceptance: accepted.
- V2.1 playback queue full manual product acceptance: superseded by
  `docs/ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md`, which records accepted
  Web and Android manual smoke for the first-class playback queue model.
