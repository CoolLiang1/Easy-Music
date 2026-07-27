# Easy Music Roadmap

## MVP Definition

MVP means the system can be used daily by the owner for real listening.

It must include:

- Web upload
- Cloud library
- MP3 playback generation
- Android playback
- Android background playback
- Android manual cache
- Basic recommendation
- AI assistant for intent parsing and tag suggestion
- Login
- Docker Compose deployment

## Status Authority

This file is the canonical source for current project status and next
authorized work. `README.md` and `README.zh-CN.md` contain public summaries;
task files contain plans; acceptance files contain evidence. See
[Documentation Guide](README.md) for the ownership and update rules.

<!-- status-snapshot: 2026-07-27 -->
Last verified: 2026-07-27 on `develop`.

## Current Status

| Initiative | Status | Evidence or work record | Current note |
| --- | --- | --- | --- |
| MVP Phase 0-7 | Accepted | [Phase 7 acceptance](ACCEPTANCE/PHASE_7_ACCEPTANCE.md) | Backend, Web, Android, local deployment artifacts, and earlier phase acceptance are complete. |
| V1.1 workflow enhancements | Accepted | [V1.1 acceptance](ACCEPTANCE/V1_1_WORKFLOW_ENHANCEMENTS_ACCEPTANCE.md) | Includes duplicate detection, cover editing, reports, recommendation explanations, revived tracks, and Android shortcuts. |
| V2 import and video | Accepted | [Import/video acceptance](ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md) | Import roots remain allowlisted and source files remain read-only. |
| V2.1 playlists | Accepted | [Playlist acceptance](ACCEPTANCE/V2_1_PLAYLISTS_ACCEPTANCE.md) | Owner-scoped manual playlists are implemented on backend, Web, and Android. |
| V2.2 playback queue | Implemented | [Queue task](TASKS/V2_2_PLAYBACK_QUEUE_TASKS.md) / [acceptance](ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md) | The original queue smoke passed; targeted Web manual regression checks remain after later playback-control fixes. |
| V2 Recommendation Foundation | Accepted | [Recommendation acceptance](ACCEPTANCE/V2_RECOMMENDATION_FOUNDATION_ACCEPTANCE.md) | Cooldown modes, feedback scoring, and playlist signals are implemented. |
| V2.4 tag taxonomy | Accepted | [Tag taxonomy acceptance](ACCEPTANCE/V2_4_TAG_TAXONOMY_ACCEPTANCE.md) | Current groups are `scene`, `type`, and `feature`. |
| V2.5 AI Tag Suggestions | Accepted | [AI tag acceptance](ACCEPTANCE/V2_5_AI_TAG_SUGGESTIONS_V2_ACCEPTANCE.md) | Provider fallback and optional search context remain constrained to tag suggestions. |
| First Ubuntu/domain/HTTPS production smoke | Implemented | [Production smoke record](ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md) | Functional smoke passed from `develop`; exact Ubuntu release was not captured, so acceptance evidence is incomplete and `main` is not verified. |
| UI optimization round 1 | Implemented | [UI task](TASKS/NEXT_UI_OPTIMIZATION_TASKS.md) / [acceptance](ACCEPTANCE/UI_OPTIMIZATION_ROUND_1_ACCEPTANCE.md) | Web and Android automated gates passed; complete manual visual/flow acceptance before marking it accepted. |

## Active And Next Work

1. Finish and record manual visual/flow acceptance for UI optimization round 1.
   A later UI slice requires a newly selected target and is not authorization
   for a broad redesign.
2. Run and record the targeted V2.2 Web playback regression checks listed in
   its acceptance record.
3. Close the production smoke evidence gap by recording a run on a confirmed
   supported Ubuntu release. Also document certificate renewal and decide
   whether high-port HTTPS remains the intended access pattern.
4. No later product feature is currently authorized. Create or update a task
   document and register it in this section before implementation.

## Phase 0: Project Foundation

Status: Accepted.

Goals:

- Create repository structure
- Add development docs
- Decide environment variables
- Create Docker Compose skeleton
- Add database migration setup

Deliverables:

- `backend/`
- `web/`
- `android/`
- `deploy/`
- `.env.example`
- Initial `docker-compose.yml`

## Phase 1: Backend Core

Status: Accepted.

Goals:

- Implement login
- Implement track model
- Implement tag model
- Implement upload endpoint
- Save original files
- Generate MP3 playback files through FFmpeg
- Extract basic metadata

Deliverables:

- Auth API
- Track CRUD API
- Tag CRUD API
- Upload pipeline
- Worker processing
- PostgreSQL migrations

## Phase 2: Web Management Console

Status: Accepted.

Goals:

- Login from browser
- Upload audio files
- View library
- Edit track metadata
- Edit tags
- Play tracks in browser

Deliverables:

- Web login page
- Library page
- Upload flow
- Track detail editor
- Tag editor
- Web audio player

## Phase 3: Android Player

Status: Accepted.

Goals:

- Login from Android
- Browse/search tracks
- Stream from server
- Stable background playback
- Notification controls
- Lock screen controls
- Headset controls

Deliverables:

- Android app shell
- Auth storage
- Track list/search
- Media3 playback service
- Now playing screen
- Playback event sync

## Phase 4: Android Offline Cache

Status: Accepted.

Goals:

- Manually cache tracks
- Play cached tracks offline
- Delete cached tracks
- Sync offline playback events after reconnecting

Deliverables:

- Cache button
- Cached tracks view
- Local metadata store
- Offline playback path
- Event sync queue

## Phase 5: Recommendation V1

Status: Accepted.

Goals:

- Recommend from structured context
- Support scene, type, and feature tags
- Penalize recent plays
- Respect cooldown and not-today feedback
- Return one primary result and two alternatives

Deliverables:

- Recommendation API
- Ranking rules
- Feedback event API
- Android recommendation home
- Web recommendation test panel

## Phase 6: AI Assistant V1

Status: Accepted.

Goals:

- Parse natural-language listening requests
- Suggest tags after upload
- Generate recommendation reasons

Deliverables:

- AI provider abstraction
- Intent parsing endpoint
- Tag suggestion endpoint
- Android natural-language recommendation input
- Web AI assistant panel

## Phase 7: Deployment Hardening

Status: Accepted by local automated/static verification. A later real-server
functional smoke is recorded separately as `Implemented`; its exact Ubuntu
release was not captured. See
`docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md`.

Goals:

- Prepare a production deployment for an Ubuntu server
- Configure HTTPS
- Configure persistent storage
- Add backups
- Add logging

Deliverables:

- Production Docker Compose
- Caddy config
- Media directory layout
- Database backup script or documented backup process
- Basic health checks

## V1.1 Delivered Scope

- Batch tag editing
- Duplicate detection
- Better upload progress
- Cover editing
- More advanced recommendation explanations
- Recently revived tracks
- Library organization reports
- Android home screen shortcuts

## Unscheduled Product Backlog

- Automatic audio analysis
- BPM detection
- Vocal detection
- Language detection
- Energy and mood analysis
- Embedding-based recommendation
- Optional Bilibili metadata import
- Multi-user support
- Windows desktop client if browser usage is not enough

## Explicit Non-Goals For MVP

- Automatic Bilibili downloader
- Public music sharing
- Social recommendation
- Full ML recommendation system
- Complete offline library sync
- Native Windows client
