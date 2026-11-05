# AI Auto-Tagging Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/AI_AUTO_TAGGING_TASKS.md`, `docs/ROADMAP.md`
Pair: `docs/TASKS/AI_AUTO_TAGGING_TASKS.md`
Decision: Implemented

## Accepted Scope

- Batch AI auto-tagging service, idle worker hook, and backfill command
  `python -m app.worker.autotag`.
- `tracks.ai_tags_version` and migration `20261104_0015`.
- Confidence-weighted AI tag matching in recommendations.
- Provenance-preserving manual tag edits.

## Environment

- Branch/commit: `feature/ai-auto-tagging` (uncommitted working tree at
  verification time, based on `362f56b`).
- Date and timezone: 2026-11-04, local Windows 11 machine.
- Runtime, device, browser, or OS versions: backend `.venv` Python with SQLite
  tests; Docker was not running, so no PostgreSQL container was available.
- Relevant configuration with secrets redacted: tests use a fake AI client and
  in-memory SQLite; no real provider key was used.

## Automated Evidence

- [x] Command: `.\.venv\Scripts\python.exe -m pytest tests/test_ai_auto_tagging.py tests/test_recommendations_service.py tests/test_tracks_api.py tests/test_worker_jobs.py tests/test_ai_tag_suggestions.py`
  - Result: 118 passed.
- [x] Command: `.\.venv\Scripts\python.exe -m pytest` (backend)
  - Result: 421 passed, 2 skipped.
- [x] Command: `alembic upgrade head`, `alembic downgrade -1`,
  `alembic upgrade head` against a temporary SQLite database
  - Result: `20261104_0015` applied, reverted, and re-applied;
    `tracks.ai_tags_version` present.
- [ ] Command: the same migration check against PostgreSQL 16
  - Result: not run; Docker was not running on the verification machine.

## Manual Evidence

- [x] Flow: `python -m app.worker.autotag --help` and `--dry-run` against the
  migrated SQLite database.
  - Expected: command loads, shows its options, and reports nothing to do.
  - Observed: as expected; dry-run printed `No tracks need AI auto-tagging.`
- [ ] Flow: real provider run, `python -m app.worker.autotag --limit 20`, on
  the owner library, followed by owner review of the printed tags.
  - Expected: mostly correct type tags; scene/feature tags plausible; failures
    listed for retry.
  - Observed: not run.
- [ ] Flow: enable `AI_AUTO_TAGGING_ENABLED=true`, let the worker tag the rest
  of the library, then use scene recommendations for daily listening.
  - Expected: recommendations draw from the whole library and the owner only
    corrects a minority of tracks.
  - Observed: not run.

## Known Gaps

- PostgreSQL migration and a real-provider run are not yet recorded.
- Tag provenance is not visible in Web or Android; the owner sees AI tags as
  ordinary tags and can remove them as usual.
- The idle worker runs one provider call at a time; an upload that arrives
  during a slow call (up to about a minute) waits for it to finish.
- Tag quality depends on metadata only (title, artist, album, filename,
  duration, source URL); scene and feature tags are expected to be coarser
  than type tags.

## Acceptance Decision

Current decision: `Implemented`.

Promote to `Accepted` only when every required criterion is satisfied and the
evidence above is recorded. Otherwise use `Implemented`, `Deferred`, or another
allowed status that matches the evidence.
