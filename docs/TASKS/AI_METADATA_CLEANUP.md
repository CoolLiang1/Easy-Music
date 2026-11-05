# AI Metadata Clean-Up

Status: Implemented
Last updated: 2026-11-05
Related: `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/API_MANUAL_TESTING.md`

## Problem

Titles come from upload file names, which are messy ("【4K】… 完整版 高音质",
"Artist - Title (Official Video)"). Artist and album are empty for almost every
track because video-site rips carry no tags. The owner will not type artists by
hand, often does not know the album, and only cares that the artist is shown.
The list showed "未填写艺人/专辑" under nearly every track.

## Scope

- In scope:
  - Conservative rule clean-up of new upload, video upload, and import titles:
    quality marks, platform noise, video ids, track numbers, underscores.
    Bracketed text without noise (source work, version) is kept.
  - Owner-reviewed AI clean-up of title and artist for existing tracks: the AI
    proposes, the Web page previews, nothing is saved until the owner applies.
  - Album is no longer shown in Web or Android track subtitles, the Web no
    longer shows "未填写艺人/专辑" placeholders in lists, and library reports
    no longer count a missing album as a problem.
  - Owner follow-up (2026-11-05): the Web track form no longer edits album,
    content type, or cooldown, the detail header no longer shows type or
    album, and the library table drops the always-"歌曲" 类型 column. The data
    and API fields stay; saving the form leaves them unchanged.
  - Owner follow-up (2026-11-05): the review page lists the pending tracks
    before analysis (`status` now returns `pending_tracks`), and suggestions
    fill into the same rows with per-row status and filters.
- Out of scope:
  - Web search for artists. A live evaluation showed search made the model
    confidently pick the most popular song with the same name.
  - Audio fingerprinting (AcoustID/MusicBrainz), album lookup, automatic
    application without review, an Android review screen.

## Changes

- API (additive; Android unaffected): `GET /api/ai/metadata-cleanup/status`,
  `POST /api/ai/metadata-cleanup/next-batch` (5 tracks per call, cursor
  `after_id`, saves nothing), `POST /api/ai/metadata-cleanup/apply`.
- Data model: `tracks.ai_metadata_version` (migration `20261104_0016`). Applying
  marks every reviewed track, including rejected and unchanged ones, so it is
  not offered again.
- Rules: an AI artist below 0.5 confidence is dropped; only artists at 0.8 or
  above for tracks without an artist are pre-selected; replacing an existing
  artist is never pre-selected. Applying recomputes the normalized metadata key.
- Web: new page "标题与艺人" (`/metadata`) under 整理 in the navigation.
- One-time owner step: after deploying (migrations run in `deploy/update.sh`),
  open 标题与艺人, press 开始分析, review, and press 应用选中.

## Verification

Automated:

- [x] `pytest tests/test_ai_metadata_cleanup.py`: 34 passed (title rules,
  confidence gates, cursor batching, truncation split, provider failures,
  owner scoping, apply, endpoints).
- [x] Full backend suite: 464 passed, 2 skipped.
- [x] `alembic upgrade head` on a fresh SQLite database, through `20261104_0016`.
- [x] `npm run typecheck` and `npm run build` passed.
- [x] Android `gradlew test` passed.
- [x] Live model evaluation (owner's provider, `DeepSeek-V4.1-Flash`), 35 wild
  file names including the owner's real titles, 5 per batch, two runs: 35/35
  titles clean, 29-30 artists correct, 5-6 left empty, 0 wrong artists.
  Search-assisted runs were worse (one confident wrong guess) and slower.
- [x] Local Web smoke with the real provider on 36 seeded tracks: analysis,
  default selections, inline edit, unchecking, apply, and the library view.
- [x] Form follow-up: typecheck and build passed; local Web check that the
  form shows only 标题/艺人/来源链接, saving an artist leaves a seeded album,
  content type, and cooldown unchanged, and the library table has no 类型
  column.

Owner checks:

- [ ] Run 标题与艺人 on the production library and check the suggestions.
- [ ] After applying, the library shows clean titles and artists, and tracks
  without a known artist show nothing under the title.

## Documentation Impact

- Updated: ROADMAP (open row), ARCHITECTURE (clean-up rules, data model, API
  surface), PRD (upload flow), API_MANUAL_TESTING (endpoints), DEPLOYMENT
  (owner step), README and README.zh-CN (feature list), AGENTS (AI invariant).
- N/A: ENVIRONMENT, `.env.example`, `.env.production.example` (no new
  variable; it uses the existing AI provider settings). DEVELOPMENT (no new
  command or check). SPECS and DEBUGGING (no subsystem spec or incident).

## Notes

- 2026-11-04: The owner chose preview-then-apply over automatic writes and
  asked for a live test with their own model before implementation.
