# Automatic Covers

Status: Implemented
Last updated: 2026-11-06
Related: `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`

## Problem

Every track was expected to have a cover, but covers could only be uploaded
one track at a time. The owner will not find and upload an image per track,
and many tracks have no matching image at all. Tracks without a cover showed
a gradient tile with the title's first character (often `【`), and library
reports flagged every one of them as "缺少封面". The documented "extract an
embedded cover" processing step did not exist in the code.

## Scope

- In scope:
  - Embedded artwork (ID3, MP4, FLAC pictures) becomes the cover during
    processing when the track has none.
  - Video uploads: a frame 20% in (at most 60 s) becomes the cover before the
    temporary video is deleted.
  - `python -m app.worker.covers` extracts embedded artwork for existing
    tracks without a cover.
  - Generated artwork for the rest on Web and Android: colour from the artist
    (so one artist's tracks match), the first letter or digit of the title,
    and a seeded record-groove pattern.
  - Library reports no longer count a missing cover as a problem.
- Out of scope:
  - Batch cover upload for a group of tracks (later, if the owner wants it).
  - Online cover lookup (crosses the no-external-download rule).

## Changes

- No API or data model change. Owner-uploaded covers are never replaced;
  extraction only reads originals and writes JPEGs up to 800 px under
  `COVERS_DIR`.
- One-time owner step after deploying: run the backfill (see
  [DEPLOYMENT.md](../DEPLOYMENT.md#automatic-covers)). Earlier video uploads
  cannot get a frame because their temporary video was already deleted.

## Verification

Automated:

- [x] `pytest tests/test_covers.py`: 16 passed (FFmpeg arguments, no-picture
  and missing-ffmpeg cases, owner covers kept, processing, video job frame
  before deletion, backfill and dry run). Full backend suite passed.
- [x] Real FFmpeg in the local `easy-music-api` image: MP3 and M4A with
  embedded art produce 800×800 JPEGs, an MP3 without art returns no cover, a
  10 s video gives an 800×450 frame at 2 s, no partial files remain. FLAC was
  not tried.
- [x] Web `npm run typecheck` and `npm run build`; Android `gradlew test` and
  `assembleDebug` (with a glyph and hash-parity test).
- [x] Local Web check: glyphs skip `【`, the detail page shows the groove
  artwork.

Owner checks:

- [ ] Run the cover backfill on the server and note how many tracks got one.
- [ ] Look at the library on Web and the phone: generated covers look
  intentional, and one artist's tracks share a colour.

## Notes

- 2026-11-06: The owner chose extraction plus generated covers; batch upload
  and online lookup stay candidates.
