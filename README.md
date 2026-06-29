# Easy Music

Easy Music is a self-hosted personal cloud music system for scenario-based
listening.

The initial usable product is now locally complete. The repository contains a
FastAPI backend, PostgreSQL migrations, media processing worker, React/Vite Web
management console, Kotlin/Jetpack Compose Android listening client, and Docker
Compose deployment artifacts.

Current status as of 2026-06-29:

- MVP Phase 0 through Phase 7 are implemented and locally accepted.
- V1.1 workflow improvements, duplicate detection, cover editing, advanced
  recommendation explanations, revived tracks, reports, and Android shortcuts
  are implemented and accepted.
- V2 import/video, playlists, client playback queues, Recommendation V2
  foundation, simplified tags, and AI Tag Suggestions V2 are implemented.
- The remaining production caveat is a first real Ubuntu/domain/HTTPS smoke
  test. Local deployment artifacts are ready, but that server-side verification
  depends on operator infrastructure.
- The next planned product work is UI optimization across Web and Android,
  followed by the first Ubuntu production deployment smoke.

## Documentation

- [Product Requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Development](docs/DEVELOPMENT.md)
- [Environment](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Git Workflow](docs/GIT_WORKFLOW.md)
- [Playback Queue Design](docs/SPECS/PLAYBACK_QUEUE.md)
- [Next UI Optimization Tasks](docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md)
- [Ubuntu Production Smoke Acceptance](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md)
- [V2.2 Playback Queue Tasks](docs/TASKS/V2_2_PLAYBACK_QUEUE_TASKS.md)
- [Phase 7 Acceptance](docs/ACCEPTANCE/PHASE_7_ACCEPTANCE.md)
- [V1.1 Duplicate Detection Acceptance](docs/ACCEPTANCE/V1_1_DUPLICATE_DETECTION_ACCEPTANCE.md)
- [V1.1 Workflow Enhancements Acceptance](docs/ACCEPTANCE/V1_1_WORKFLOW_ENHANCEMENTS_ACCEPTANCE.md)
- [V2 Import And Video Acceptance](docs/ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md)
- [V2.1 Playlist Management Acceptance](docs/ACCEPTANCE/V2_1_PLAYLISTS_ACCEPTANCE.md)
- [V2.1 Playback Queue Acceptance](docs/ACCEPTANCE/V2_1_PLAYBACK_QUEUE_ACCEPTANCE.md)
- [V2.2 Playback Queue Acceptance](docs/ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md)
- [V2 Recommendation Foundation Tasks](docs/TASKS/V2_RECOMMENDATION_FOUNDATION_TASKS.md)
- [V2 Recommendation Foundation Acceptance](docs/ACCEPTANCE/V2_RECOMMENDATION_FOUNDATION_ACCEPTANCE.md)
- [V2.5 AI Tag Suggestions V2 Tasks](docs/TASKS/V2_5_AI_TAG_SUGGESTIONS_V2_TASKS.md)
- [V2.5 AI Tag Suggestions V2 Acceptance](docs/ACCEPTANCE/V2_5_AI_TAG_SUGGESTIONS_V2_ACCEPTANCE.md)

## Implemented Areas

- Backend: FastAPI API, auth, tracks, tags, uploads, media streaming,
  playlists, playback events, feedback events, recommendation endpoints with
  V2 cooldown modes and playlist scoring signals, AI assistant endpoints,
  enhanced AI tag suggestions, health checks, structured logging, Alembic
  migrations, and worker media processing.
- Web: React/Vite management console with login, upload flow, library, track
  editor, tag editor, playlist management, queued Web playback, recommendation test
  panel, AI assistant/tag suggestion UI, import-directory review, and optional
  user-provided video-to-audio upload.
- Android: Kotlin/Jetpack Compose client with login, library, track detail,
  playlist browsing, Media3 queue playback service, background/notification controls,
  manual offline cache, cached playback, playback-event sync, and
  structured/natural-language recommendation flows.
- Deployment: development Docker Compose, production Docker Compose, Caddy
  HTTPS reverse proxy configuration, production environment template, host
  setup script, database backup script, and deployment guide.

## Current Status

Current documented progress:

- Phase 0 / Phase 1: accepted. Backend foundation, auth, track/tag/upload
  APIs, media processing, worker flow, streaming, and Docker development
  configuration are in place.
- Phase 2: accepted. Web management console automated checks and browser smoke
  flow are recorded as passed.
- Phase 3: accepted. Android online playback, Media3 background playback, and
  system controls are recorded as passed.
- Phase 4: accepted. Android manual offline cache and playback-event sync are
  recorded as passed.
- Phase 5: accepted. Rule-based recommendation and feedback flows are recorded
  as passed across backend, Web, and Android.
- Phase 6: accepted. AI Assistant V1 backend, Web, and Android flows are
  recorded as passed for core behavior, with destructive Android edge-state UI
  simulations noted as residual manual coverage.
- Phase 7: accepted by local static and automated verification. Production
  deployment artifacts exist, while the first real-server HTTPS smoke test is
  deferred to the operator's deployment.
- V1.1: duplicate detection is accepted. Workflow enhancements through Android
  launcher shortcuts are implemented with automated checks and manual
  acceptance recorded.
- V2 import/video slice: accepted for local closure. Automatic import tools
  and optional user-provided video-to-audio processing are implemented with
  automated checks and browser smoke recorded.
- V2.1 playlist management: implemented as ordinary owner-scoped user
  playlists across backend, Web management, and Android browse/play flows.
  Client-side playback queues now let Web and Android play a playlist in
  sequence, shuffled once per round, or reverse order.
- V2.2 playback queue: implemented as first-class local temporary queue state
  on Web and Android, including queue editing UI, upcoming reorder,
  playlist-only repeat, and same-client source playlist sync. Automated checks
  plus Web and Android manual smoke are recorded as accepted.
- V2 Recommendation Foundation: implemented. Recommendation cooldown now
  defaults to soft scoring instead of hard exclusion, strict/off modes are
  available, `not_today` remains a same-day hard exclusion, liked/dislike
  feedback affects scoring, and owner-scoped playlist membership plus playlist
  name/description relevance can boost tracks.
- V2.4 tag taxonomy simplification: implemented. Tag groups are now `scene`,
  `type`, and `feature`; old `scenario` and `state` categories migrate to
  `scene` and `feature`, while old `attribute` tags and their track-tag links
  are removed.
- V2.5 AI Tag Suggestions V2: implemented as quality improvements to the
  existing `POST /api/ai/tracks/{track_id}/suggest-tags` flow. The endpoint now
  gives stronger `scene`/`type`/`feature` guidance, supports richer existing-tag
  suggestion output with confidence and reasons, can optionally use
  suggest-tags-only Tavily title/snippet/URL search context, keeps legacy
  provider output compatibility, and documents DeepSeek as an OpenAI-compatible
  provider option.

## Next Work

Near-term work should stay focused on two tracks:

1. UI optimization: improve the existing Web and Android screens without
   changing backend contracts or adding new product features. Start from
   [docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md](docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md).
2. Ubuntu production deployment: run the first real server smoke test with a
   real domain and HTTPS certificate. Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
   and record results in
   [docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md).

See [docs/ROADMAP.md](docs/ROADMAP.md) and the per-phase acceptance documents
under `docs/` for the detailed historical record.
