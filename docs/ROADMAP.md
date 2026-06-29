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

## Current Progress

Status as of 2026-06-29:

- Phase 0 / Phase 1: Accepted. Repository foundation, backend core, auth,
  track/tag/upload APIs, media processing, worker flow, migrations, streaming,
  and development Docker Compose are implemented.
- Phase 2: Accepted. The Web management console includes login, upload,
  library, track editing, tag editing, and browser playback.
- Phase 3: Accepted. The Android app includes login, library/detail screens,
  authenticated streaming, Media3 background playback, notification controls,
  lock-screen/media-button behavior, and shared playback UI.
- Phase 4: Accepted. Android manual offline cache, cached playback, local
  metadata store, queued playback events, and reconnect sync are implemented.
- Phase 5: Accepted. Recommendation V1 includes structured recommendation
  requests, rule-based ranking, feedback events, Android recommendation home,
  and Web recommendation test panel.
- Phase 6: Accepted. AI Assistant V1 includes provider abstraction,
  intent parsing, AI-assisted recommendation composition through the existing
  ranking service, tag suggestions, Web AI panel, and Android
  natural-language recommendation input.
- Phase 7: Accepted by local verification. Deployment hardening includes
  production Docker Compose, Caddy HTTPS config, production env template, host
  storage layout, database backup script, structured logging, health checks,
  and deployment documentation.
- V1.1: Duplicate Detection is accepted. Better upload progress, batch tag
  editing, library organization reports, cover editing, advanced recommendation
  explanations, recently revived tracks, and Android launcher shortcuts are
  implemented. Automated checks and manual acceptance are recorded in
  `docs/ACCEPTANCE/V1_1_WORKFLOW_ENHANCEMENTS_ACCEPTANCE.md`.
- V2 import/video slice: Accepted for local closure. Automatic import tools
  and optional user-provided video-to-audio processing are implemented through
  safe configured import roots, scan/confirm flows, import batch history,
  Web import UI, Web video upload, worker video extraction, mixed
  audio/video imports, and documented automated plus browser smoke acceptance.
- V2.1 playlist management: Implemented. Ordinary owner-scoped user playlists
  now have backend CRUD/add/remove/reorder APIs, Web management UI, and Android
  browse/play flows. Web and Android also support client-side playback queues
  for playlist sequence, one-time shuffled, and reverse playback. Smart
  playlists, sharing, collaboration, auto-generation, cross-device queue sync,
  and server-side persistent queues remain out of scope. Playlist-based
  recommendation scoring is covered separately by V2 Recommendation Foundation.
- V2.2 playback queue: Implemented for local temporary client queues. Web and
  Android now expose first-class queue state, queue management, upcoming
  reorder, playlist-only repeat, and same-client source playlist sync.
  Automated checks plus Web and Android manual smoke are recorded as accepted
  in `docs/ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md`.
- V2 Recommendation Foundation: Implemented. Recommendation cooldown now
  defaults to soft scoring instead of hard exclusion, `cooldown_mode` supports
  `off`, `soft`, and `strict`, `not_today` remains a same-day hard exclusion,
  `like` and `dislike` feedback affect ranking, and owner-scoped playlist
  membership plus playlist name/description relevance are recommendation
  scoring signals.
- V2.4 tag taxonomy simplification: Implemented. Supported tag groups are now
  `scene`, `type`, and `feature`; old `scenario` maps to `scene`, old `state`
  maps to `feature`, and old `attribute` tags plus track-tag links are removed
  during migration.
- V2.5 AI Tag Suggestions V2: Implemented as quality improvements to the
  existing `POST /api/ai/tracks/{track_id}/suggest-tags` flow. It strengthens
  `scene`/`type`/`feature` prompt guidance, supports richer existing-tag
  suggestions with confidence and reasons, can optionally use
  suggest-tags-only Tavily title/snippet/URL search context, keeps legacy
  provider output compatibility, and documents DeepSeek as an OpenAI-compatible
  provider option without adding organization, playlist suggestions, or
  auto-apply.

The remaining deployment caveat is a real production smoke test on an Ubuntu
server with a real domain and HTTPS certificate. That requires operator
infrastructure and is intentionally deferred to first deployment.

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

Status: Accepted by local automated/static verification. Real-server
production smoke testing remains an operator deployment step.

Goals:

- Deploy to Ubuntu server
- Enable HTTPS
- Configure persistent storage
- Add backups
- Add logging

Deliverables:

- Production Docker Compose
- Caddy config
- Media directory layout
- Database backup script or documented backup process
- Basic health checks

## V1.1 Ideas

- Batch tag editing
- Duplicate detection
- Better upload progress
- Cover editing
- More advanced recommendation explanations
- Recently revived tracks
- Library organization reports
- Android home screen shortcuts

## V2 Ideas

- Completed local V2 slice:
  - Automatic import tools.
  - Optional user-provided video-to-audio processing.
- V2.1 user-built playlist management and client-side playlist playback queue.
- V2.2 first-class local playback queue module.
- V2 recommendation foundation: soft/default cooldown, strict/off modes,
  feedback scoring, and playlist membership/name/description boosts.
- V2.5 AI tag suggestion quality pass for the existing suggest-tags endpoint,
  including OpenAI-compatible DeepSeek provider guidance and optional Tavily
  search context.
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
