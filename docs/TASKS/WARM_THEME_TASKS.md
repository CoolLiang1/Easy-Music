# Warm Theme From The App Icon

Status: Implemented
Last updated: 2026-11-05
Related: `docs/ROADMAP.md`, `docs/TASKS/APP_ICON_REDESIGN.md`

## Problem

After the new app icon, the Web and Android UI still used the old teal ink
and amber palette, so the app and its icon did not look like one product. The
dark player bar at the bottom also pulled the eye down and felt tiring.

## Scope

- In scope:
  - One palette for Web and Android light mode, taken from the icon (owner
    picked option A from palette previews):
    - Warm paper `#FBF7F0` and brown ink `#3B2619` / text `#2B1D16`.
    - The icon's orange `#DD733F` marks what is playing.
    - Tag hues are softened to fit: scene `#2E6E78`, type `#8A4C70`, feature
      `#506B28`.
  - A light-orange player deck (owner picked A3): Web deck and Android mini
    player use `#FBEADD` with dark text. The play button is orange and the
    progress bar is orange on a light track.
  - Web row play buttons are light by default; the current track's button is
    orange. The large detail-page button stays dark.
  - Android dark mode (option D): dark brown surfaces, cream text, orange
    accents. The mini player is one step lighter than the page, not darker.
  - Placeholder cover gradients on both clients use the new palette.
  - Browser `theme-color` and manifest `theme_color` follow the paper colour.
- Out of scope:
  - A Web dark mode (the Web has none).
  - Layout or component changes beyond colours.

## Contrast

Body text, secondary text, buttons, deck text, tag chips, and the "now
playing" text are at least 4.5:1 on their backgrounds. The play-button icons
(white on orange) are 3.2:1, above the 3:1 needed for non-text UI.

## Verification

Automated:

- [x] `npm run typecheck` and `npm run build` in `web/`.
- [x] `gradlew test` and `assembleDebug` in `android/`.
- [x] Web browser check against a local SQLite API with seeded demo tracks:
  - Desktop library with the light-orange deck while a track plays.
  - Recommendations page.
  - Mobile library with the softened row play buttons.
- [x] Android emulator: the login screen in light and dark mode.
- [ ] Not checked: signed-in Android screens and the mini player. The emulator
  had no network (interfaces stayed down after two cold boots), so the app
  stayed offline and could not sign in.

Owner:

- [ ] Web in daily use, including the deck while playing.
- [ ] Android on the real phone, light and dark mode, mini player.
