# Playback Loudness Normalization Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/PLAYBACK_LOUDNESS_NORMALIZATION_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`
Pair: `docs/ACCEPTANCE/PLAYBACK_LOUDNESS_NORMALIZATION_ACCEPTANCE.md`

## Goal

Owner-reported problem: tracks from different sources (video extractions, OST
rips, white noise) play at very different loudness, and a loud next track can
be startling. Make consecutive tracks play at a similar loudness on Web and
Android, including offline-cached tracks, without changing the music's
dynamics.

## Scope

In scope:

- Measure integrated loudness and true peak of each original with ffmpeg
  `loudnorm=print_format=json` during processing.
- Bake one static gain into the playback MP3, targeting `-16 LUFS`, reduced to
  keep the measured true peak under `-1 dBTP`, capped at +20 dB.
- Store the measurement, the applied gain, and a normalization rule version on
  `tracks`.
- Write playback MP3s to a partial file and replace atomically.
- A backfill command, `python -m app.worker.renormalize`, that regenerates
  playback files for existing ready tracks without touching metadata.
- Configuration through environment variables with documented defaults.

Out of scope:

- Client-side gain or ReplayGain tags; no Web or Android code change.
- Compression, limiting, or per-album normalization.
- Automatic Android detection of outdated offline copies (re-cache manually;
  revisit only if the owner finds it painful).
- Exposing loudness fields in the public API.

## Dependencies And Contracts

- All audio entry points (upload, import, video extraction) already converge
  on `process_track` → `generate_mp3_playback`, so new tracks need no other
  change.
- `process_track` re-applies file metadata, so the backfill must use a separate
  `regenerate_track_playback` path that keeps owner edits.
- No API, Web, or Android contract change. `playback_file_sha256` changes after
  regeneration, which is already an exposed, client-ignored field.
- Migration `20261104_0014` adds four nullable columns to `tracks`.
- Production compose passes environment explicitly, so the new variables are
  added to both `api` and `worker`.

## Implementation Tasks

- [x] `measure_loudness`, `compute_playback_gain_db`, gain-aware and atomic
  `generate_mp3_playback` in `backend/app/media/ffmpeg.py`.
- [x] Loudness fields on `Track` and Alembic migration `20261104_0014`.
- [x] `PLAYBACK_LOUDNESS_NORMALIZATION`, `PLAYBACK_TARGET_LUFS`,
  `PLAYBACK_MAX_TRUE_PEAK_DBTP` settings, env templates, and production compose.
- [x] Normalization step in `process_track` with fallback to no gain when
  measurement fails.
- [x] `regenerate_track_playback` and
  `list_tracks_needing_loudness_normalization` in `services/processing.py`.
- [x] `python -m app.worker.renormalize` with `--dry-run`, `--track-id`, `--all`.
- [x] Backend tests for parsing, gain rules, atomic replace, processing,
  regeneration, and the backfill command.
- [x] Architecture, environment, deployment, roadmap, and README updates.
- [ ] Run the backfill on the real deployment and re-cache Android offline
  tracks.

## Acceptance Criteria

- New tracks are encoded with a gain that brings them close to `-16 LUFS`
  without exceeding the true-peak ceiling.
- Silent or unmeasurable tracks still process successfully without gain.
- The backfill rewrites only playback files, keeps owner-edited metadata, keeps
  the previous file when a track fails, and can be rerun to retry failures.
- Migration upgrades and downgrades cleanly on PostgreSQL.
- Owner listening on the real library no longer has startling jumps between
  consecutive tracks.

## Verification Plan

- Automated: backend focused tests, then full backend suite.
- Manual: real ffmpeg run in the backend Docker image with synthetic loud,
  quiet, hot-peak, and silent sources; PostgreSQL migration up/down/up in a
  throwaway container.
- Environment/device requirements: owner listening on Web and Android against
  the production library after backfill.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [x] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [x] AGENTS.md stable rules

N/A reasons:

- PRD: no product scope or non-goal change; this is a playback-quality fix
  inside the existing "MP3 playback generation" scope.
- Specification: no `docs/SPECS/` document covers media processing; the design
  is recorded in `docs/ARCHITECTURE.md` section 9.3.
- `docs/DEVELOPMENT.md`: no local setup or command change; the backfill is an
  operational command documented in `docs/DEPLOYMENT.md` and can be run the
  same way against the local compose `worker`.
- `docs/API_MANUAL_TESTING.md`: no API request or response change.

## Progress Notes

- 2026-11-04: Implemented on `fix/playback-loudness-normalization`. Static gain
  was chosen over single-pass `loudnorm` so long mixes and OSTs keep their
  dynamics, and over client-side gain so no Web/Android change is needed and
  offline copies inherit the result.
