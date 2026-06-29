# Next UI Optimization Tasks

Date: 2026-06-29

This document defines the next UI-focused work after the initial Easy Music
product has reached local functional closure.

## Current Baseline

- Backend, Web, Android, and deployment artifacts are implemented through the
  accepted MVP and current V2 slices.
- Web is functional for login, upload, import/video, library, track detail,
  tags, playlists, playback queue, recommendations, AI assistant, and AI tag
  suggestions.
- Android is functional for login, library/detail, playlists, playback queue,
  Media3 playback, cache, recommendations, and AI-assisted recommendations.
- Current user-facing language is primarily Chinese where recent UI work has
  touched the app.
- The UI is usable but not yet polished as a cohesive product experience.

## Product Goal

Make the existing Web and Android interfaces easier to scan, operate, and trust
without changing the product feature set.

## Scope

In scope:

- Improve visual hierarchy, spacing, density, and consistency on existing Web
  screens.
- Improve Android Compose screen layout, labels, empty states, loading states,
  and control grouping.
- Keep terminology aligned with the current taxonomy: `scene`, `type`, and
  `feature` as 场景 / 类型 / 特点 in user-facing Chinese UI.
- Make common flows feel clear:
  - login
  - upload and processing status
  - library browsing
  - track detail editing
  - tag assignment
  - playlist browsing and playback
  - playback queue management
  - recommendation requests and feedback
  - AI tag suggestions
  - import/video status
- Improve mobile and desktop responsive behavior for the Web app.
- Preserve existing backend API contracts unless a task explicitly asks for a
  contract change.

Out of scope:

- New recommendation algorithms.
- New AI agent modules.
- New backend entities.
- Cross-device queue sync.
- Smart playlists.
- New deployment architecture.
- Large frontend framework or navigation rewrites.
- Adding features that are not directly required to polish existing flows.

## Development Rules

- Start by reading `README.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT.md`, and this task document.
- Work screen by screen or flow by flow. Do not redesign the whole product in
  one broad pass.
- Keep the existing information architecture unless the specific task requires
  a navigation change.
- Prefer shared UI patterns already present in each client before adding new
  component styles.
- Do not change backend request or response shapes for visual-only work.
- If an API contract must change, update backend schemas, Web types, Android
  models, tests, and docs together.
- Do not hide error, empty, disabled, loading, or processing states during
  visual cleanup.
- Do not commit screenshots, local media, build output, cache files, `.env`
  files, or machine-local Android configuration.

## Suggested Work Order

1. Web layout consistency pass:
   - App shell/sidebar/navigation.
   - Page headings and action placement.
   - Table/list readability.
   - Player and queue affordances.
2. Web flow polish:
   - Library and Track Detail.
   - Playlists and playback queue.
   - Upload/import/video status.
   - Recommendations and AI tag suggestions.
3. Android layout consistency pass:
   - Navigation and common screen structure.
   - Library/detail/playlist/now playing surfaces.
   - Recommendation and cache surfaces.
4. State and copy pass:
   - Empty states.
   - Loading states.
   - Error states.
   - Disabled controls.
   - Chinese terminology consistency.
5. Regression verification:
   - Web typecheck/build.
   - Android relevant tests/build.
   - Manual smoke for changed flows where practical.

## Acceptance Criteria

- Existing core flows still work after UI changes.
- User-facing terminology consistently uses 场景 / 类型 / 特点 for the current
  tag taxonomy.
- Web desktop and mobile layouts have no obvious overlapping text, clipped
  controls, or broken primary actions.
- Android key screens remain usable on a typical phone viewport.
- Playback controls and queue controls remain discoverable and do not regress
  Media3/Web playback behavior.
- Upload, processing, import, and video extraction states remain visible.
- Recommendation and AI provider fallback/error states remain understandable.
- Relevant automated checks pass.
- Manual smoke results are recorded in a relevant acceptance document or in the
  task completion notes.
