# Online Cover Search

Status: Implemented
Last updated: 2026-11-06
Related: `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`

## Problem

None of the owner's tracks carry embedded artwork, so automatic extraction
finds nothing and every track shows generated artwork. The owner will not
search and upload a cover per track, and asked for an online lookup.

## Scope

- In scope:
  - Owner-reviewed lookup through the public iTunes Search API on a new Web
    page 查找封面 (`/covers`): list, search, preview, apply.
  - The page lists every track without a cover, so the owner sees what is
    still missing: never searched, searched but not found, or missing an
    artist. Each row can be searched again or given an uploaded cover.
  - Only tracks with an artist are searched. Owner covers are never replaced.
  - Matching tuned on the owner's titles: exact title plus artist, original
    releases preferred over Live/remix/cover/ensemble variants; everything
    else is shown as 待确认 and left unchecked.
  - Safe download from Apple's artwork CDN only.
  - An explicit, documented exception to "nothing downloads from external
    sites" in AGENTS.md and PRD.md, agreed by the owner on 2026-11-06.
- Out of scope:
  - Tracks without an artist, other services (MusicBrainz, NetEase,
    Bilibili), automatic application without review, Android UI.

## Changes

- Environment: `COVER_SEARCH_ENABLED` (default `false`) in both env examples,
  passed to the API service in `docker-compose.prod.yml` (checked with
  `docker compose config --quiet` against `.env.production.example`).
- Data model: `tracks.cover_search_version` (migration `20261106_0017`).
- API (additive; Android unaffected): `GET /api/covers/search/status`
  (every coverless track with `searched`), `POST /api/covers/search/next-batch`
  (3 tracks per call, cursor `after_id` over never-searched tracks, or
  `track_ids` to search again; saves nothing), `POST /api/covers/search/apply`.
- Web: page 查找封面 under 整理, with filters 全部 / 找到封面 / 待查找 /
  未找到 / 缺艺人 and per-row 再查 and 上传封面 (the existing cover upload).
- One-time owner step: set `COVER_SEARCH_ENABLED=true` on the server, recreate
  the API, open 查找封面, search, review, apply.

## Verification

Automated:

- [x] `pytest tests/test_cover_search.py`: 20 passed (matching cases from the
  live test, rate limit, cursor batching, partial failure, disabled state,
  ownership, owner covers kept, CDN allowlist, image signature, endpoints).
  Full backend suite passed.
- [x] `alembic upgrade head`, `downgrade -1`, `upgrade head` on SQLite.
- [x] Web `npm run typecheck` and `npm run build`.
- [x] Live run against iTunes on 29 of the owner's titles with artists: 27
  candidates, 19 pre-selected matches that all looked right (including
  secret base 10 years after Ver. and Imaginaerum), wrong or doubtful ones
  shown unchecked. A later tweak drops short titles inside long ones
  ("Infinity" for "To the Infinity Castle"). Apply downloaded 20 covers
  (600×600 JPEG, ~95 KB) and the library showed them.
- PostgreSQL migration not run (single nullable column).
- [x] After the owner's first look (searched tracks vanished from the page):
  browser check on a local test library. After apply and reload, a searched
  track without a cover stays listed as 未找到; 再查 searches it again; an
  uploaded cover removes the row; tracks without an artist are listed as
  缺艺人.

Owner checks:

- [ ] Enable the flag on the server and run 查找封面 on the real library.
- [ ] Spot-check the 待确认 rows and the applied covers on Web and the phone.

## Notes

- 2026-11-06: An earlier hit-rate test (31 titles) found about 20 right
  covers; tracks without an artist only produced guesses, so they are not
  searched. Chinese artists written in traditional script or romanised
  (陳奕迅, Jay Chou) show as 待确认.
- 2026-11-06: The owner asked for every coverless track to stay listed, not
  only unsearched ones, to know which still need a cover. Searching again
  with an unchanged title and artist usually returns the same result; it
  helps after the title or artist was corrected.
