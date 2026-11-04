# Web UI Redesign Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/WEB_UI_REDESIGN_TASKS.md`, `docs/ROADMAP.md`
Pair: `docs/TASKS/WEB_UI_REDESIGN_TASKS.md`
Decision: Implemented

## Accepted Scope

- None yet. The scope listed in `docs/TASKS/WEB_UI_REDESIGN_TASKS.md` is
  implemented and smoke-tested; owner review and the known gaps below remain.

## Environment

- Branch/commit: `feature/web-ui-redesign`, branched from `develop` at
  `2235b5d`, working tree before the slice commit.
- Date and timezone: 2026-11-04, owner workstation local time.
- Runtime, device, browser, or OS versions: Windows 11; Node/Vite dev server on
  `127.0.0.1:8081`; Chromium-based browser pane in the Claude desktop app at
  1440x900, 1280x800, 1024x768, and the 375x812 mobile preset (touch, no hover).
- Relevant configuration with secrets redacted: throwaway local backend from
  `backend/` using SQLite created with `Base.metadata.create_all` (not
  Alembic), seeded test user/tags/tracks/playlists, generated WAV playback files
  and PNG covers, `AI_ENABLED=false`, `IMPORT_ALLOWED_ROOTS` set to a throwaway
  scratch directory for the import checks, no worker and no FFmpeg.

## Automated Evidence

- [x] Command: `npm run typecheck` (from `web/`)
  - Result: passed with no errors.
- [x] Command: `npm run build` (from `web/`)
  - Result: passed; 80 modules, CSS 47.9 kB, JS 359.4 kB before gzip.

## Manual Evidence

- [x] Flow: login
  - Expected: wrong credentials show a clear message; a stored session opens
    the library.
  - Observed: wrong password showed "用户名或密码不正确。"; a valid stored token
    restored the session and loaded the library.
- [x] Flow: library browse, filter, search
  - Expected: covers, tags, status filters with counts, sorting; search with
    filter mode off highlights and scrolls to matches.
  - Observed: 12 seeded tracks rendered with status filter counts; searching
    "quiet" highlighted and scrolled to the track whose artist matched while all
    rows stayed visible.
- [x] Flow: playback deck and queue
  - Expected: row play starts the global deck; list rows and deck reflect the
    playing track; queue drawer shows current and upcoming.
  - Observed: the audio element played with advancing time, the row showed the
    level meter, the deck showed title/artist/progress/volume/queue count;
    adding two selected tracks to the queue showed current plus two upcoming in
    the drawer; space bar paused playback.
- [x] Flow: row menu and selection toolbar
  - Expected: add to playlist from the row menu; batch tag dialog updates only
    selected rows; delete asks for confirmation.
  - Observed: the row menu added a track to a playlist with a toast; adding two
    tags to two selected tracks updated those rows; deleting one track showed a
    styled confirmation and reduced the list from 15 to 14 rows.
- [x] Flow: playlists
  - Expected: play from a row, add via picker, reorder, rename.
  - Observed: row play started the playlist at that position (deck showed
    `2/5`); the picker search added a track (5 to 6 rows); moving the first row
    down swapped the first two tracks; inline rename updated the hero and list.
- [x] Flow: track detail
  - Expected: dirty tracking, tag save, AI fallback warning, cover upload, and
    unsaved edits preserved across unrelated updates.
  - Observed: toggling a tag showed the unsaved note and saving updated hero
    tags; AI suggestions showed the disabled-provider warning; an album edit
    survived a liked toggle and then saved; a dropped PNG cover saved and
    refreshed the hero cover.
- [x] Flow: recommendations and AI assistant
  - Expected: results with play actions and feedback; AI disabled state is
    explained; AI success view shows parsed intent and results.
  - Observed: two selected tags returned three results and a like feedback was
    recorded; the AI page explained the disabled provider; with an in-page
    stubbed `ok` response it rendered matched tags, unmatched terms,
    explanation, and result cards.
- [x] Flow: upload and import
  - Expected: dropped files upload automatically with progress/processing
    status; unsupported files are rejected; import scans, selects, confirms,
    and shows batch results.
  - Observed: a generated WAV uploaded and showed processing plus duplicate
    check, while a `.txt` file was rejected with supported formats listed;
    import showed the disabled message without roots, then with a scratch root
    found 3 candidates and 1 skipped file and imported 2 files into batch #1.
- [x] Flow: tags, reports, duplicates
  - Expected: three-column tag board with usage counts; reports summary with
    Chinese reasons; duplicate groups compared side by side.
  - Observed: tag board rendered all groups with counts; report reasons showed
    as "缺少专辑" etc.; with two tracks given the same hash in the test database,
    the duplicates page showed one "文件完全一致" group with both candidates.
- [x] Flow: mobile 375px
  - Expected: no horizontal page overflow; navigation and row actions usable.
  - Observed: all ten main routes had page scroll width equal to the viewport;
    the navigation drawer opened from the top bar; library rows showed play,
    title, like, and menu without horizontal table scrolling.

## Known Gaps

- Owner review on the real library and backend has not been recorded.
- End-to-end processing to `ready` with a running worker and FFmpeg was not
  exercised; only upload creation and processing status were observed.
- Video upload, a live AI provider success path, hardware media keys through
  Media Session, and queue drag-and-drop reorder were not exercised.

## Acceptance Decision

Current decision: `Implemented`.

Promote this record, the paired task, the roadmap row, and both README summaries
to `Accepted` only after the owner review and the known gaps above are resolved
or explicitly waived, with evidence recorded here.
