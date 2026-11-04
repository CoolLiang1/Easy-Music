# Web UI Redesign Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/WEB_UI_REDESIGN_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md`
Pair: `docs/ACCEPTANCE/WEB_UI_REDESIGN_ACCEPTANCE.md`

## Goal

The owner reported that the Web console was unattractive, hard to operate, and
not friendly in daily use. This slice reworks the Web client's visual system and
the interaction of every existing Web screen so common listening and library
tasks take fewer steps, without changing backend contracts or the product
feature set.

## Scope

In scope:

- A shared Web design system: color tokens (one hue per tag group: 场景 / 类型 /
  特点), typography, buttons, forms, cards, badges, chips, tables, dialogs,
  menus, toasts, skeleton loading, and empty/error states.
- App shell: regrouped sidebar navigation with icons, user chip and sign-out,
  mobile top bar with an off-canvas navigation drawer, page titles in the
  browser tab, and scroll reset on navigation.
- One global player deck replacing per-row inline players: cover, title link,
  previous/play/next, seek, volume, queue entry, buffering and error states,
  space-bar play/pause, and browser Media Session metadata/actions.
- Playback queue drawer: current/upcoming sections, drag or button reorder,
  remove/skip, playlist repeat switch, and styled clear confirmation.
- Library: cover thumbnails, inline tag chips, status quick filters, sorting,
  title/artist/album search (filter-mode switch kept: off highlights and jumps
  to matches, on shows only matches), row play, row action menu, inline liked
  toggle, select-all, and a selection toolbar for queue, playlist, batch tag
  dialog, and delete.
- Track detail: hero header with actions, metadata form with dirty tracking,
  chip-based tag editor with AI suggestion adoption, drag-and-drop cover editor,
  file information with collapsible storage paths; unrelated updates no longer
  discard unsaved edits.
- Playlists: two-pane layout, inline create/rename, searchable track picker,
  play-from-row, hero actions, and styled delete confirmation.
- Upload: single drop zone for audio and video with automatic sequential
  upload, client-side type/size validation, progress, processing, and
  duplicate-warning rows.
- Import: three-step layout, select-all, row toggling, skipped-file disclosure,
  result statistics, and latest batch summary.
- Tags board, recommendations, AI assistant, reports, duplicates, login, and
  not-found screens restyled with clearer copy; recommendation and AI results
  gain play and add-to-queue actions.
- Client-side Chinese display of known backend reason strings in reports,
  duplicates, and import warnings.

Out of scope:

- Backend, Android, deployment, or API contract changes.
- New recommendation, AI, playlist, or queue semantics.
- Cross-device queue sync, dark mode, or a frontend framework change.

## Dependencies And Contracts

- All Web API wrappers and types are unchanged; requests and response shapes
  match the existing backend.
- Queue semantics remain owned by `web/src/player/PlaybackQueueProvider.tsx`;
  the player deck keeps the existing stream-URL, auto-advance, and playback
  error behavior.
- AI remains constrained: provider `disabled`/`unconfigured`/`error` states are
  displayed as warnings and never bypass rule-based recommendation.
- Android Library search remains title-only with its existing filter toggle;
  Web now also matches artist and album.

## Implementation Tasks

- [x] Replace `web/src/styles.css` with the new token-based design system.
- [x] Add shared UI primitives under `web/src/components/ui/` (icons, toast,
  dialog/confirm, menu, track cover cache, page/empty/callout helpers).
- [x] Add `web/src/player/playerStatus.ts` so list play buttons reflect and
  toggle the single deck.
- [x] Rebuild the app shell, player deck, and queue drawer.
- [x] Rebuild Library, Track Detail, Playlists, Upload, Import, Tags,
  Recommendations, AI Assistant, Reports, Duplicates, Login, and not-found.
- [x] Remove the now-unused `PlaybackQueueActions`, `UploadForm`,
  `VideoUploadForm`, `TagForm`, and `TagList` components.
- [x] Run Web typecheck/build and a browser smoke of changed flows.

## Acceptance Criteria

- Existing Web flows complete: login, library browse/search/filter, playback
  and queue, batch tags, playlist management and playback, track metadata/tag/
  cover edits, upload status, import scan/confirm, recommendation requests and
  feedback, AI fallback states, reports, and duplicates.
- No backend request or response shape changes.
- Desktop and 375px mobile layouts have no horizontal page overflow, and
  primary row actions stay reachable on touch devices.
- Loading, empty, error, processing, and AI provider fallback states remain
  visible and understandable.
- `npm run typecheck` and `npm run build` pass.
- The owner confirms the redesign against the real library and backend.

## Verification Plan

- Automated: `npm run typecheck`, `npm run build` from `web/`.
- Manual: browser smoke against a local backend with seeded data at desktop and
  mobile widths; owner review on the real library.
- Environment/device requirements: a running backend; worker and FFmpeg for
  end-to-end upload processing; a configured provider for the AI success path.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [x] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [ ] AGENTS.md stable rules

N/A reasons:

- PRD: no product scope or non-goal changed; only `docs/ARCHITECTURE.md` Web
  responsibilities were updated.
- Environment / deployment: no variables, defaults, or deployment files changed.
- AGENTS.md: no new stable agent rule was discovered.

## Progress Notes

- 2026-11-04: Implemented the full Web redesign on
  `feature/web-ui-redesign`. Typecheck and production build passed. Browser
  smoke against a throwaway local SQLite backend is recorded in the paired
  acceptance document. Owner review on the real library, end-to-end
  worker/FFmpeg processing, and a live AI provider remain open, so the slice is
  `Implemented`.
