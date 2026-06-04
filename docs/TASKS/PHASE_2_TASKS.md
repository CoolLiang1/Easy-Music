# Phase 2 Development Tasks

## Scope

Phase 2 builds the Web Management Console on top of the completed Phase 1
backend.

Phase 2 includes:

- Browser login.
- Authenticated Web app shell.
- Audio upload from browser.
- Library list.
- Track metadata editing.
- Tag editing.
- Browser playback for ready tracks.

Phase 2 excludes:

- Android app work.
- Recommendation behavior.
- AI Assistant behavior.
- AI tag suggestions.
- Production deployment hardening beyond local Web development needs.

## Execution Principles

- One Codex session should complete exactly one task.
- Work in the files and directories named by the current task.
- Do not implement later tasks early.
- Keep backend changes out of Phase 2 unless a Web task reveals a strict API
  contract bug that blocks the current task.
- After each implementation task, run the smallest relevant Web checks and
  inspect `git diff`.
- Commit completed tasks separately with a concise Conventional Commits
  message.

## Task 1: Scaffold The Web App

### Goal

Create the React, TypeScript, and Vite Web app foundation without implementing
product features.

### Directories

- `web/`
- `docs/`

### Main Files

- `web/package.json`
- `web/vite.config.ts`
- `web/tsconfig.json`
- `web/index.html`
- `web/src/main.tsx`
- `web/src/App.tsx`
- `web/src/styles.css`
- `docs/DEVELOPMENT.md`

### Dependencies

- Phase 1 acceptance is complete.

### Acceptance Criteria

- `web/` contains a runnable Vite React TypeScript app.
- `npm install` and the default Web checks run from `web/`.
- The app renders a minimal placeholder screen.
- `docs/DEVELOPMENT.md` documents how to install dependencies and start the Web
  dev server.
- No backend API integration is implemented yet.

### Do Not

- Do not implement login, upload, library, editing, or playback yet.
- Do not modify backend code.
- Do not add Android, Recommendation, or AI Assistant code.
- Do not create production deployment configuration.

## Task 2: Add Web App Structure And Routing

### Goal

Create the client-side layout, route structure, and protected-route placeholder
flow needed by the later Web features.

### Directories

- `web/src/`

### Main Files

- `web/src/App.tsx`
- `web/src/routes/`
- `web/src/layout/`
- `web/src/pages/LoginPage.tsx`
- `web/src/pages/LibraryPage.tsx`
- `web/src/pages/UploadPage.tsx`
- `web/src/pages/TrackDetailPage.tsx`
- `web/src/pages/TagsPage.tsx`
- `web/src/styles.css`

### Dependencies

- Task 1.

### Acceptance Criteria

- The app has routes for login, library, upload, track detail, and tags.
- Authenticated routes can be represented by a temporary local placeholder
  state, ready to be replaced by real auth in Task 4.
- Navigation between Phase 2 pages works in the browser.
- Layout is usable on desktop browser widths.
- Feature pages still show placeholders only.

### Do Not

- Do not call backend APIs yet.
- Do not implement real authentication yet.
- Do not implement upload, editing, or playback behavior.
- Do not add Recommendation, AI Assistant, or Android routes.

## Task 3: Add Shared API Client And Domain Types

### Goal

Create the Web-side API layer and TypeScript types for the existing Phase 1
backend contract.

### Directories

- `web/src/api/`
- `web/src/types/`
- `web/src/config/`

### Main Files

- `web/src/config/env.ts`
- `web/src/api/http.ts`
- `web/src/api/auth.ts`
- `web/src/api/tracks.ts`
- `web/src/api/tags.ts`
- `web/src/types/auth.ts`
- `web/src/types/track.ts`
- `web/src/types/tag.ts`

### Dependencies

- Task 1.

### Acceptance Criteria

- Web API base URL is configurable for local development.
- API client supports bearer-token requests.
- API modules cover:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/tracks`
  - `GET /api/tracks/{id}`
  - `PATCH /api/tracks/{id}`
  - `POST /api/tracks/upload`
  - `GET /api/tags`
  - `POST /api/tags`
  - `PATCH /api/tags/{id}`
  - `DELETE /api/tags/{id}`
- TypeScript types match the Phase 1 API fields used by the Web UI.
- API errors are normalized enough for UI pages to display useful messages.

### Do Not

- Do not implement UI features in this task.
- Do not invent backend endpoints.
- Do not add Recommendation, AI, playback-event, or feedback-event clients.
- Do not store tokens yet beyond what is needed by testable API helpers.

## Task 4: Implement Browser Login And Session State

### Goal

Allow the owner to log in from the browser and keep an authenticated Web
session.

### Directories

- `web/src/auth/`
- `web/src/pages/`
- `web/src/api/`
- `web/src/routes/`

### Main Files

- `web/src/auth/AuthProvider.tsx`
- `web/src/auth/storage.ts`
- `web/src/pages/LoginPage.tsx`
- `web/src/routes/ProtectedRoute.tsx`
- `web/src/api/auth.ts`

### Dependencies

- Task 2.
- Task 3.

### Acceptance Criteria

- Login page accepts username and password.
- Successful login stores the access token and routes to the library.
- Failed login shows a clear error without losing the form context.
- Refreshing the browser preserves the session if the stored token is still
  accepted by `GET /api/auth/me`.
- Logout clears the token and returns to login.
- Protected pages redirect unauthenticated users to login.

### Do Not

- Do not implement registration, password reset, OAuth, or multi-user UI.
- Do not hard-code production credentials.
- Do not implement upload, library editing, or playback yet.
- Do not change backend auth behavior unless a blocking contract bug is found.

## Task 5: Implement Library List

### Goal

Show the authenticated user's music library in the browser.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/LibraryPage.tsx`
- `web/src/components/TrackTable.tsx`
- `web/src/components/TrackStatusBadge.tsx`
- `web/src/api/tracks.ts`
- `web/src/types/track.ts`

### Dependencies

- Task 4.

### Acceptance Criteria

- Library page fetches `GET /api/tracks`.
- Tracks display title, artist, album, content type, status, duration, liked
  state, and updated time when available.
- Empty library, loading, and error states are handled.
- Selecting a track navigates to its detail page.
- Non-ready tracks are visible with their current processing status.

### Do Not

- Do not implement search or filtering beyond simple local display helpers.
- Do not implement recommendation ranking.
- Do not implement playback controls yet.
- Do not hide processing or failed tracks from the management view.

## Task 6: Implement Browser Upload Flow

### Goal

Allow the owner to upload supported audio files from the Web console.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`

### Main Files

- `web/src/pages/UploadPage.tsx`
- `web/src/components/UploadForm.tsx`
- `web/src/components/UploadResultList.tsx`
- `web/src/api/tracks.ts`

### Dependencies

- Task 4.
- Task 5.

### Acceptance Criteria

- Upload page accepts MP3, FLAC, M4A, WAV, and OGG files.
- Upload uses `POST /api/tracks/upload`.
- Upload progress or in-flight state is visible enough that repeated clicks are
  prevented.
- Successful uploads show the created track and its initial processing status.
- Upload errors are shown per failed file or request.
- After upload, the user can return to the library and see the new track.

### Do Not

- Do not implement drag-and-drop batch polish unless the basic flow is already
  complete.
- Do not run FFmpeg in the browser.
- Do not implement AI tag suggestion after upload.
- Do not add backend upload formats beyond Phase 1 support.

## Task 7: Add Processing Status Refresh

### Goal

Make the Web console reflect backend worker progress after upload.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`

### Main Files

- `web/src/pages/LibraryPage.tsx`
- `web/src/pages/TrackDetailPage.tsx`
- `web/src/components/TrackStatusBadge.tsx`
- `web/src/api/tracks.ts`

### Dependencies

- Task 5.
- Task 6.

### Acceptance Criteria

- Library and track detail can refresh track data.
- Processing and failed states are visually distinct from ready state.
- A ready track becomes visible as ready after the worker completes.
- Manual refresh is available; lightweight polling may be used only while
  processing tracks are present.
- Failed tracks display a management-friendly status without exposing raw stack
  traces.

### Do Not

- Do not introduce WebSockets or server-sent events.
- Do not implement a worker control panel.
- Do not create new backend job-management APIs.
- Do not implement Android cache or playback-event sync.

## Task 8: Implement Track Detail Metadata Editor

### Goal

Allow editing track metadata from the Web console.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/TrackDetailPage.tsx`
- `web/src/components/TrackMetadataForm.tsx`
- `web/src/api/tracks.ts`
- `web/src/types/track.ts`

### Dependencies

- Task 5.
- Task 7.

### Acceptance Criteria

- Track detail page fetches `GET /api/tracks/{id}`.
- Metadata form can update title, artist, album, content type, source URL,
  liked state, and cooldown date if the backend accepts it.
- Save uses `PATCH /api/tracks/{id}`.
- Successful save refreshes the detail data and returns a clear success state.
- Validation and API errors are shown near the form.
- Read-only technical fields such as file paths and processing status are
  displayed separately from editable fields.

### Do Not

- Do not implement delete unless it is explicitly assigned in a later task.
- Do not expose raw local media paths as clickable public links.
- Do not implement lyrics, cover editing, BPM, vocal detection, or mood
  analysis.
- Do not implement Recommendation or AI metadata cleanup.

## Task 9: Implement Track Tag Assignment Editor

### Goal

Allow assigning and removing existing tags on a track from the track detail
page.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/TrackDetailPage.tsx`
- `web/src/components/TrackTagEditor.tsx`
- `web/src/api/tracks.ts`
- `web/src/api/tags.ts`
- `web/src/types/tag.ts`
- `web/src/types/track.ts`

### Dependencies

- Task 8.
- Task 10 may be done before this task if the tag-management UI is preferred
  first.

### Acceptance Criteria

- Track detail page can load all tags and the current track's assigned tags.
- User can add and remove tag associations using existing tags.
- Save uses `PATCH /api/tracks/{id}` with the backend-supported tag association
  payload.
- Tags are grouped by scenario, state, type, and attribute.
- The UI handles tracks with no tags and libraries with no tags.

### Do Not

- Do not implement AI tag suggestions.
- Do not implement batch tag editing across multiple tracks.
- Do not create duplicate tags implicitly while editing a track unless the
  backend contract already supports it and the task is explicitly extended.
- Do not implement Recommendation filtering.

## Task 10: Implement Tag Management Page

### Goal

Allow creating, listing, updating, and deleting tags from the Web console.

### Directories

- `web/src/pages/`
- `web/src/components/`
- `web/src/api/`
- `web/src/types/`

### Main Files

- `web/src/pages/TagsPage.tsx`
- `web/src/components/TagList.tsx`
- `web/src/components/TagForm.tsx`
- `web/src/api/tags.ts`
- `web/src/types/tag.ts`

### Dependencies

- Task 4.
- Task 3.

### Acceptance Criteria

- Tags page fetches `GET /api/tags`.
- User can create tags with group values limited to scenario, state, type, and
  attribute.
- User can rename a tag and change its group if the backend accepts it.
- User can delete one explicit tag at a time.
- Loading, empty, validation, and API error states are handled.

### Do Not

- Do not batch-delete tags.
- Do not use recursive or bulk filesystem delete commands.
- Do not implement AI organization suggestions.
- Do not implement Recommendation behavior based on tags.

## Task 11: Implement Web Audio Player

### Goal

Allow ready tracks to be played in the browser through the authenticated stream
endpoint.

### Directories

- `web/src/components/`
- `web/src/pages/`
- `web/src/api/`

### Main Files

- `web/src/components/WebAudioPlayer.tsx`
- `web/src/pages/TrackDetailPage.tsx`
- `web/src/pages/LibraryPage.tsx`
- `web/src/api/tracks.ts`

### Dependencies

- Task 5.
- Task 7.

### Acceptance Criteria

- Ready tracks expose a play action in the Web UI.
- Browser playback uses `GET /api/tracks/{id}/stream` with authentication.
- Non-ready tracks cannot be played and show an appropriate disabled state.
- Player supports at least play, pause, seek through native browser controls or
  a small custom wrapper.
- Stream errors, expired sessions, and missing playback files are handled
  gracefully.

### Do Not

- Do not implement queue management, playlists, shuffle, repeat, or background
  Android playback.
- Do not implement playback history or feedback events in Phase 2 unless a
  later task explicitly adds them.
- Do not expose unauthenticated media URLs.
- Do not implement Recommendation playback flows.

## Task 12: Add Phase 2 Web Verification And Manual Test Docs

### Goal

Make the completed Web console repeatably verifiable by automated checks and a
manual browser smoke test.

### Directories

- `web/`
- `docs/`

### Main Files

- `web/`
- `docs/DEVELOPMENT.md`
- `docs/API_MANUAL_TESTING.md`
- `docs/ACCEPTANCE/PHASE_0_1_ACCEPTANCE.md` or a new Phase 2 acceptance note if Phase 2 is
  being closed

### Dependencies

- Tasks 1 through 11.

### Acceptance Criteria

- Web lint/typecheck/build commands are documented and pass.
- Manual docs explain how to:
  - start PostgreSQL and API,
  - run migrations,
  - create or reuse the initial user,
  - start the Web dev server,
  - log in from the browser,
  - upload an audio file,
  - run the worker,
  - see the track become ready,
  - edit metadata and tags,
  - play the ready track in the browser.
- Documentation states that Android, Recommendation, and AI Assistant are still
  outside Phase 2.
- No unrelated docs are edited.

### Do Not

- Do not add Phase 3, Phase 5, or Phase 6 behavior.
- Do not rewrite product or architecture documents unless a real mismatch is
  discovered.
- Do not create production deployment hardening tasks here.
- Do not batch-delete files or directories while cleaning local artifacts.
