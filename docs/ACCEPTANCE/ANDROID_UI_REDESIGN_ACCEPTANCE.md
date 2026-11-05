# Android UI Redesign Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/ANDROID_UI_REDESIGN_TASKS.md`, `docs/ROADMAP.md`
Pair: `docs/TASKS/ANDROID_UI_REDESIGN_TASKS.md`
Decision: Implemented

## Accepted Scope

- None yet. The scope in `docs/TASKS/ANDROID_UI_REDESIGN_TASKS.md` is
  implemented and emulator-smoke-tested; real-device review remains.

## Environment

- Branch/commit: `feature/android-ui-redesign`, branched from `main` at
  `a9d8e81`, working tree before the slice commit.
- Date and timezone: 2026-11-04, owner workstation local time.
- Runtime, device, browser, or OS versions: Windows 11; Android Studio JBR;
  emulator `EasyMusic_API_36` (1080x2400); debug APK; default emulator base
  URL `http://10.0.2.2:8000`.
- Relevant configuration with secrets redacted: throwaway local backend using
  SQLite created with `Base.metadata.create_all` plus the newer
  `refresh_tokens` table and track loudness columns, seeded test user, tags,
  tracks, playlists, generated WAV playback files and PNG covers,
  `AI_ENABLED=false`, no worker and no FFmpeg.

## Automated Evidence

- [x] Command: `.\gradlew.bat test assembleDebug` (from `android/`)
  - Result: passed, including the extended `LibraryTrackFilterTest` (artist and
    album matching, highlight ids).

## Manual Evidence

- [x] Flow: login
  - Expected: branded card, disabled button until both fields are filled, clear
    error banner.
  - Observed: a server error showed in the error banner; valid credentials
    opened the library.
- [x] Flow: library and list playback
  - Expected: cover art, quick filters with counts, tap/row button plays
    without leaving the list, mini player appears.
  - Observed: server covers loaded for tracks with covers and placeholders for
    the rest; filters showed 全部 15 / 可播放 10 / 喜欢 2 / 处理中 5; the row
    play button started playback, highlighted the row with the level meter, and
    showed the mini player with progress.
- [x] Flow: row menu and track detail cache
  - Expected: menu offers play next, add to queue, details; caching shows
    progress and then cached state.
  - Observed: the menu showed all three actions; detail showed play/next/queue
    buttons and the cache card; "缓存到本机" finished with size and time, the
    hero gained "已离线缓存", and the track appeared in the offline tab.
- [x] Flow: Now Playing and Back
  - Expected: opens from the mini player, shows artwork, tags, seek, controls,
    queue; Back returns to the previous tab.
  - Observed: opened from the mini player with a back arrow and no bottom
    navigation; system Back returned to the library.
- [x] Flow: playlists
  - Expected: list, detail hero, tapping a row plays the playlist from there.
  - Observed: tapping track 2 started "深夜写代码 v2 · 顺序" at that track with 4
    upcoming items; the queue auto-advanced to the next track.
- [x] Flow: recommendations
  - Expected: two tabs; tag selection requests results with play and feedback.
  - Observed: selecting 专注工作 and 安静 returned a primary "最佳匹配" card with
    formatted reasons, colored tag chips, play button, and feedback chips.
- [x] Flow: offline tab and dark mode
  - Expected: empty state with a way back to the library; cached list; dark
    scheme readable.
  - Observed: empty state offered "去曲库"; after caching, the list showed one
    track with size; switching the emulator to night mode rendered the dark
    scheme with readable text and chips.

## Known Gaps

- Real-device review, background playback, lock-screen and headset controls
  were not exercised in this slice.
- The emulator network was not validated for WorkManager, so the offline
  playback-event sync badge kept counting; sync code was not changed.
- Offline playback from the offline tab without network, play next / add to
  queue insertion, and the AI success path were not exercised on the emulator.
- Cached tracks show placeholder artwork because cached metadata does not store
  a cover path.

## Acceptance Decision

Current decision: `Implemented`.

Promote this record, the paired task, the roadmap row, and both README summaries
to `Accepted` only after the owner review on a real device and the known gaps
above are resolved or explicitly waived, with evidence recorded here.
