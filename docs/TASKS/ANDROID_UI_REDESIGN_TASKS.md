# Android UI Redesign Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/ANDROID_UI_REDESIGN_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/TASKS/WEB_UI_REDESIGN_TASKS.md`
Pair: `docs/ACCEPTANCE/ANDROID_UI_REDESIGN_ACCEPTANCE.md`

## Goal

After the Web redesign, the owner asked for the same full usability and visual
pass on the Android listening client. This slice gives Android the Web design
language and removes daily friction: playing from lists without leaving them, a
mini player on every tab, system Back support, and clearer cache, playlist, and
recommendation flows. No backend contract or playback-core change.

## Scope

In scope:

- Compose theme shared with the Web: ink primary, amber reserved for "now
  playing", one hue per tag group (场景 / 类型 / 特点), light and dark schemes,
  typography, shapes, and edge-to-edge drawing.
- Shared components under `ui/components/`: banner, empty/loading states,
  status pills, tag chips and toggle chips, group headings, level meter, track
  row, row play button, key-value rows, and track artwork.
- Track artwork: authenticated cover loading (`GET /api/tracks/{id}/cover`) with
  an in-memory cache and a gradient placeholder; `TrackResponse` now parses the
  existing optional `cover_path` field.
- App shell: per-screen top bar title, account menu with logout confirmation,
  offline-sync badge, global snackbar, a dark mini player above the bottom
  navigation on every tab, Now Playing as a full-screen page with Back, and
  system Back handling for Now Playing, track detail, playlist detail, and
  non-library tabs.
- `TrackPlaybackLauncher`: list screens play directly with the same cache-first
  source selection as Now Playing, and can insert "play next" / "add to queue"
  through the existing `PlayerController` queue functions.
- Library: rounded search across title/artist/album (filter-mode switch kept:
  off highlights and scrolls to matches, on shows only matches), quick filters
  with counts (全部 / 可播放 / 已缓存 / 喜欢 / 处理中), pull-to-refresh, artwork
  rows, tap-to-play, row menu (下一首播放 / 加入播放队列 / 详情与离线缓存).
- Track detail: artwork hero, play/pause, play next, add to queue, cache card
  with progress, tags grouped by color, and formatted info.
- Now Playing: large artwork, tags, source pills, seek that commits on release
  (one seek event instead of one per drag tick), large transport controls, and
  a compact queue with drag handle, move, remove, repeat switch, and clear.
- Playlists: list with "now playing" indicator, detail hero with total time,
  play/shuffle/reverse, and tap-a-row to play the playlist from that track.
- Recommendations: segmented "一句话描述" / "按标签挑选" tabs, example prompts,
  colored tag toggles, playable result cards, and feedback chips.
- Offline cache list, login (password visibility, offline notice), and session
  check restyled.

Out of scope:

- Backend, Web, deployment, or API contract changes.
- Changes to Media3 service, `MediaSessionConnector`, cache download, playback
  event recording or sync, or auth token logic.
- New product features beyond exposing existing queue functions in the UI.

## Dependencies And Contracts

- `cover_path` is already returned by the backend track response; the Android
  model treats it as optional with a `null` default.
- Playback still goes through `PlayerController`; `TrackPlaybackLauncher`
  reuses `PlaybackSourceSelector` so cached audio wins and offline behavior is
  unchanged.
- Playing a playlist from a row starts the queue at that track (earlier tracks
  are not in that queue); the full-playlist buttons are unchanged.
- Android Library search now matches title, artist, and album, matching the Web.

## Implementation Tasks

- [x] Replace `ui/theme/EasyMusicTheme.kt` with the shared design tokens.
- [x] Add `ui/components/` (components, formatting, track artwork/cover loader,
  track row).
- [x] Add `player/domain/TrackPlaybackLauncher.kt`.
- [x] Rebuild `AppScaffold`, `AppNavGraph`, `MiniPlayer`, and `MainActivity`
  (edge-to-edge).
- [x] Rebuild Library, Track Detail, Now Playing, Playlists, Recommendations,
  Offline cache, and Login screens.
- [x] Extend `LibraryTrackFilter` and its unit tests for artist/album search and
  highlight ids.
- [x] Run `gradlew test assembleDebug` and an emulator smoke.

## Acceptance Criteria

- Login, library browse/search/filter, list playback, play next/add to queue,
  Now Playing controls and queue, playlist playback, track cache/delete,
  offline list playback, recommendations and feedback, and logout work.
- Mini player is visible on every tab while something is loaded and opens Now
  Playing; system Back returns to the previous screen instead of exiting.
- Loading, empty, error, offline, processing, and AI provider fallback states
  remain visible and understandable.
- Light and dark modes are readable.
- `gradlew test` and `gradlew assembleDebug` pass.
- Owner confirms on a real device against the real library, including
  background playback and lock-screen controls.

## Verification Plan

- Automated: `.\gradlew.bat test assembleDebug` from `android/`.
- Manual: emulator smoke against a local backend with seeded data; owner
  review on a real device.
- Environment/device requirements: running backend reachable from the device;
  real device for background, lock-screen, and headset behavior.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [x] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [ ] AGENTS.md stable rules

N/A reasons:

- PRD: no product scope or non-goal changed; only `docs/ARCHITECTURE.md`
  Android responsibilities were updated.
- Environment / deployment / API testing: no variables, defaults, deployment
  files, or API smoke flows changed; the Android library search step in
  `docs/DEVELOPMENT.md` was updated.
- AGENTS.md: no new stable agent rule was discovered.

## Progress Notes

- 2026-11-04: Implemented on `feature/android-ui-redesign` (from `main` at
  `a9d8e81`). Unit tests and debug build passed; emulator smoke is recorded in
  the paired acceptance document. Real-device review remains, so the slice is
  `Implemented`.
