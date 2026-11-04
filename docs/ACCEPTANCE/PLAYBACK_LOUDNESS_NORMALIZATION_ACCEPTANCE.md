# Playback Loudness Normalization Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/PLAYBACK_LOUDNESS_NORMALIZATION_TASKS.md`, `docs/ROADMAP.md`
Pair: `docs/TASKS/PLAYBACK_LOUDNESS_NORMALIZATION_TASKS.md`
Decision: Implemented

## Accepted Scope

- Server-side loudness measurement and static playback gain for new tracks.
- Loudness fields and migration `20261104_0014`.
- Backfill command `python -m app.worker.renormalize`.

## Environment

- Branch/commit: `fix/playback-loudness-normalization` (uncommitted working
  tree at verification time, based on `a3c4b49`).
- Date and timezone: 2026-11-04, local Windows 11 machine.
- Runtime, device, browser, or OS versions: backend `.venv` Python 3.12 with
  SQLite tests; existing local `easy-music-api` Docker image (Debian ffmpeg)
  with the working-tree `app/` mounted read-only; throwaway
  `postgres:16-alpine` container for the migration.
- Relevant configuration with secrets redacted: defaults
  (`PLAYBACK_TARGET_LUFS=-16`, `PLAYBACK_MAX_TRUE_PEAK_DBTP=-1`); the real-ffmpeg
  check used a temporary media directory and an in-memory SQLite database, not
  the local or production library.

## Automated Evidence

- [x] Command: `.\.venv\Scripts\python.exe -m pytest tests/test_media_ffmpeg.py tests/test_processing_service.py tests/test_worker_renormalize.py tests/test_worker_jobs.py tests/test_video_processing.py`
  - Result: 49 passed.
- [x] Command: `.\.venv\Scripts\python.exe -m pytest` (backend)
  - Result: 393 passed, 2 skipped.
- [x] Command: `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head`
  against a throwaway PostgreSQL 16 container
  - Result: `20261104_0014` applied, reverted, and re-applied; the four
    nullable columns are present on `tracks`.

## Manual Evidence

- [x] Flow: real ffmpeg processing of synthetic sources through `process_track`,
  then re-measuring the produced playback MP3.
  - Expected: loud source attenuated to about -16 LUFS; quiet sources boosted
    within the peak ceiling and +20 dB cap; silence processed without gain.
  - Observed:

    | Source | In LUFS | In dBTP | Gain dB | Out LUFS | Out dBTP |
    | --- | --- | --- | --- | --- | --- |
    | loud pink noise | -9.6 | 1.2 | -6.4 | -16.1 | -5.3 |
    | very quiet tone | -49.8 | -46.0 | +20.0 (cap) | -29.8 | -26.1 |
    | quiet tone with hot transient | -48.8 | -18.3 | +17.3 (peak) | -31.5 | -1.0 |
    | digital silence | n/a | n/a | 0.0 | n/a | n/a |

    All tracks ended `ready` with `loudness_version=1`.
- [x] Flow: `regenerate_track_playback` on a track with an owner-edited title.
  - Expected: playback file rewritten, title preserved, no partial file left.
  - Observed: file rewritten, title kept as edited, version set to 1, no
    `.partial.mp3` left behind.
- [x] Flow: `python -m app.worker.renormalize --help` in the backend image.
  - Expected: command loads and shows `--track-id`, `--all`, `--dry-run`.
  - Observed: as expected.
- [ ] Flow: production `alembic upgrade head`, `renormalize --dry-run`, then
  `renormalize`.
  - Expected: every ready track regenerated, or failures listed for retry.
  - Observed: not run (production access is the owner's).
- [ ] Flow: owner listening across consecutive tracks on Web and Android after
  backfill and Android re-cache.
  - Expected: no startling loudness jumps.
  - Observed: not run.

## Known Gaps

- Production backfill and owner listening review are not yet recorded.
- Android offline copies cached before the backfill keep the old audio until
  re-cached; there is no automatic stale-cache detection in this slice.
- The real-ffmpeg check used synthetic sources rather than real music.

## Acceptance Decision

Current decision: `Implemented`.

Promote to `Accepted` only when every required criterion is satisfied and the
evidence above is recorded. Otherwise use `Implemented`, `Deferred`, or another
allowed status that matches the evidence.
