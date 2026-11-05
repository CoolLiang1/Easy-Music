# AI Auto-Tagging Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/AI_AUTO_TAGGING_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/TASKS/V2_5_AI_TAG_SUGGESTIONS_V2_TASKS.md`
Pair: `docs/ACCEPTANCE/AI_AUTO_TAGGING_ACCEPTANCE.md`

## Goal

Owner-reported problem: recommendations depend on scene/type/feature tags, but
the owner does not want to tag every track by hand or confirm AI suggestions
one track at a time, so most tracks stay untagged and never get recommended.

Make tagging opt-out instead of opt-in: the AI applies catalogue tags to every
ready track in batches, those tags count less than owner tags in ranking, and
the owner only corrects what is wrong.

## Scope

In scope:

- Batch auto-tagging service: one provider call per batch of up to 10 tracks,
  existing catalogue tag ids only, confidence threshold, at most 8 AI tags per
  track.
- Store applied rows in `track_tags` with `source="ai"` and the AI confidence
  (columns already existed and were unused).
- `tracks.ai_tags_version` so each track is processed once per rule version;
  a tag the owner removes therefore stays removed.
- Worker: auto-tag one batch whenever the media queue is idle, behind
  `AI_AUTO_TAGGING_ENABLED`, with a 10-minute backoff after a failed batch.
- Backfill command `python -m app.worker.autotag` with `--dry-run`, `--limit`,
  `--track-id`, `--all`, `--batch-size`; it prints applied tags for review.
- Recommendation: AI tags score at tag weight × confidence × 0.8, with an
  explanation penalty line naming the AI-inferred tags.
- Manual tag edits keep the provenance of rows that stay; a tag the owner adds
  through batch editing is promoted to an owner tag.
- Web trigger (owner request, 2026-11-05): an "AI 打标签" button on the Library
  page backed by `GET /api/ai/auto-tag/status` and
  `POST /api/ai/auto-tag/next-batch` (5 tracks per call, looped by the page,
  stoppable). Works without the worker flag.

Out of scope (later slices, only if real use shows they are needed):

- Turning "not suitable for this scene" feedback into removal of AI tags.
- A Web view for reviewing AI tags by tag.
- Showing tag provenance in Web or Android.
- Search-context enrichment for batch calls (cost per track is too high).
- Audio analysis of any kind.

## Dependencies And Contracts

- The existing per-track suggest-tags endpoint and its Web flow are unchanged;
  its taxonomy guide text is now shared with the batch prompt.
- Two additive endpoints for the Web trigger; no existing request/response
  shape changes. Android is unaffected. Recommendation `reason` and
  `explanation.penalties` may contain one additional entry for AI-weighted
  tags, using the existing `RecommendationExplanationPart` shape.
- AI never creates tags, never selects tracks, and never touches owner rows.
  Ranking, cooldowns, feedback, and ownership checks remain rule-based.
- Migration `20261104_0015` adds nullable `tracks.ai_tags_version`.
- Production compose passes environment explicitly, so the two new variables
  are added to both `api` and `worker`.

## Implementation Tasks

- [x] `AI_AUTO_TAGGING_ENABLED` and `AI_AUTO_TAGGING_MIN_CONFIDENCE` settings,
  env templates, and production compose.
- [x] `Track.ai_tags_version` and Alembic migration `20261104_0015`.
- [x] `services/ai_auto_tagging.py` with batch schema in `schemas/ai.py`.
- [x] Shared `build_ai_provider` for routes and the worker.
- [x] Idle worker hook with failure backoff in `worker/main.py` and
  `auto_tag_next_batch` in `worker/jobs.py`.
- [x] `python -m app.worker.autotag`.
- [x] Confidence-weighted tag matching in `services/recommendations.py`.
- [x] Provenance-preserving tag sync in `services/tracks.py`.
- [x] Backend tests for the service, worker hook, CLI, ranking, and tag sync.
- [x] Architecture, environment, deployment, PRD, AGENTS, roadmap, and README
  updates.
- [x] Batch token budget raised to 8192 with split-and-retry on truncation.
- [x] Web trigger: auto-tag status and next-batch endpoints, Web API wrappers
  and types, Library page button with progress and stop.
- [ ] PostgreSQL migration check and a real-provider run on the owner library.

## Acceptance Criteria

- With a working provider, every ready track is processed once; confident
  catalogue tags are applied as AI rows and the track records the rule version.
- Invented, foreign, or out-of-batch ids and low-confidence tags are dropped.
- Owner tags are never changed; an owner-removed AI tag is not re-added unless
  a re-run is requested explicitly.
- Provider disabled, unconfigured, error, or bad JSON changes nothing, and the
  worker does not call a failing provider every poll.
- AI tags rank below the same owner tag but above no match.
- Migration upgrades and downgrades cleanly on PostgreSQL.
- On the owner's real library, the applied tags are good enough that the owner
  corrects only a minority of tracks and scene recommendations improve.

## Verification Plan

- Automated: focused backend tests, then the full backend suite.
- Manual: migration up/down/up; CLI `--help` and `--dry-run`.
- Environment requirements: a real provider run with
  `python -m app.worker.autotag --limit 20` on the owner library, owner review
  of the printed tags, then enabling the worker flag; PostgreSQL migration
  check when Docker is available.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [x] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [x] AGENTS.md stable rules

N/A reasons:

- Specification: no `docs/SPECS/` document covers tagging; the design is in
  `docs/ARCHITECTURE.md` sections 8.4, 9.2, and 10.2.
- `docs/DEVELOPMENT.md`: no setup or verification procedure change; the
  backfill command runs the same way against the local compose `worker` and is
  documented in `docs/DEPLOYMENT.md`.
- `docs/ENVIRONMENT.md` for the Web trigger: no new setting; it uses the
  existing AI provider settings and `AI_AUTO_TAGGING_MIN_CONFIDENCE`.

## Progress Notes

- 2026-11-04: Implemented on `feature/ai-auto-tagging` from `main` at
  `362f56b`. Version marking was chosen over a rejected-tags table: a track is
  processed once per rule version, so removing a wrong AI tag is enough to keep
  it removed. Idle-worker batching was chosen over a per-upload job so uploads
  of many files share provider calls and media processing is never delayed.
- 2026-11-05: First production run failed every batch with
  `output_truncated`: the configured reasoning model spent the 2048-token
  budget before writing JSON. Fixed on `fix/ai-auto-tagging-token-budget`:
  batch calls request 8192 tokens, and a batch that still truncates is split in
  half and retried down to single tracks.
- 2026-11-05: Owner asked for a Web entry point. Added the Library page
  button on the same branch (`feature/web-ai-auto-tagging`). The page calls
  one 5-track batch per request and loops, instead of one long request or a
  new job type, so progress is visible and each request stays short.
