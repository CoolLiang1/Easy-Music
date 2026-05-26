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

## Phase 0: Project Foundation

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

Goals:

- Recommend from structured context
- Support scenario, state, and type tags
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

- Automatic audio analysis
- BPM detection
- Vocal detection
- Language detection
- Energy and mood analysis
- Embedding-based recommendation
- Automatic import tools
- Optional Bilibili metadata import
- Optional user-provided video-to-audio processing
- Multi-user support
- Windows desktop client if browser usage is not enough

## Explicit Non-Goals For MVP

- Automatic Bilibili downloader
- Public music sharing
- Social recommendation
- Full ML recommendation system
- Complete offline library sync
- Native Windows client

