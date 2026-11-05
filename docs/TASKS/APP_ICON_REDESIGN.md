# App Icon Redesign

Status: Implemented
Last updated: 2026-11-05
Related: `docs/ROADMAP.md`

## Problem

The owner was not satisfied with the old app icon and wanted a cuter one in a
flat cut-paper anime style: an orange-haired girl with tiger ears, in orange,
cream, and dark brown.

## Scope

- In scope:
  - New artwork: a girl with tiger-striped cat ears, eyes closed, listening
    through headphones. She wears a daisy ornament with a striped ribbon, and
    music notes float around her.
  - Web: favicons, Apple touch icon, PWA icons (including the maskable one),
    and the 1254 px original. The sidebar, top bar, and login page already use
    `pwa-192x192.png` and pick up the new artwork without code changes.
  - Android: legacy, round, and adaptive launcher icons for every density, the
    1254 px original, and a new 256 px `easy_music_brand_mark.png` that
    `BrandMark` (top bar, login, startup screen) now draws instead of the old
    music-note glyph.
- Out of scope:
  - Retheming the Web or Android UI to the icon's palette. The UI keeps its
    ink and amber colours.

## Artwork And Export

- Source: the owner generated the artwork with an image model from prompts
  written in this task, and picked variant D.
- Clean-up:
  - The JPEG panel was upscaled 2x and blurred slightly.
  - Colours were snapped to `#F4E1C5` cream, `#DD733F` orange, and `#251914`
    brown. The headphone cup stays `#583426` and hair shading `#9A512F`; both
    only survive in solid areas, so edges carry no brown halo.
  - The artwork was re-centred with a 5% margin.
- Sizes:
  - The Web PWA icons, Apple touch icon, and Android legacy icon use the full
    artwork. The Android round icon scales it to 92% inside the circle.
  - Maskable PWA icon: 80% of the canvas, inside the safe zone.
  - Adaptive foreground: 62% of the 108 dp layer, so the ear tips stay inside
    the 66 dp safe circle. The background is `ic_launcher_background`, now
    `#F4E1C5`.
  - Favicons (32 and 48 px): a tighter crop of face, ears, and headphones.
- The manifest `background_color` is now `#f4e1c5`, so the PWA splash matches
  the icon.

## Verification

Automated:

- [x] `npm run typecheck` and `npm run build` in `web/`.
- [x] `gradlew test` and `assembleDebug` in `android/`.
- [x] Browser check on `vite preview`: the login page shows the new artwork,
  and the favicons, PWA icons, and manifest are served with the new files.
  The signed-in sidebar was not checked (no backend); it uses the same
  `pwa-192x192.png`.
- [ ] Not run: emulator or device check of the launcher icon and `BrandMark`.

Owner:

- [ ] Launcher icon on the real phone (round and squircle masks, ears not cut).
- [ ] Browser tab, installed PWA, and Android top bar look right in daily use.
