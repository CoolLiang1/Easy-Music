# V1.1 Workflow Enhancements Acceptance

This document records verification status for V1.1 Tasks 7 through 13. These
tasks are small owner-facing workflow improvements built on the accepted MVP and
the accepted advisory duplicate-detection work.

## Scope

In scope for this acceptance record:

- Task V1.1.7: Better Upload Progress.
- Task V1.1.8: Batch Tag Editing.
- Task V1.1.9: Library Organization Reports.
- Task V1.1.10: Cover Editing.
- Task V1.1.11: Advanced Recommendation Explanations.
- Task V1.1.12: Recently Revived Tracks.
- Task V1.1.13: Android Home Screen Shortcuts.

Out of scope:

- Duplicate Detection Tasks V1.1.1 through V1.1.6, recorded separately in
  `docs/ACCEPTANCE/V1_1_DUPLICATE_DETECTION_ACCEPTANCE.md`.
- Merge/delete duplicate actions.
- New recommendation engines, embeddings, ML ranking, or AI track selection.
- Automatic playback, automatic caching, playback-event sync changes, or
  Android playback rewrites.
- Backend contract changes for Android launcher shortcuts.

## Implementation Record

Implemented changes:

- Upload progress: Web upload flow reports browser upload progress and refreshes
  backend processing status.
- Batch tag editing: authenticated backend batch tag endpoint and Web Library
  multi-select add/remove tag UI.
- Library reports: authenticated read-only organization reports and Web Reports
  page.
- Cover editing: authenticated cover upload/retrieval endpoints and Web Track
  Detail cover replacement flow.
- Advanced recommendation explanations: structured explanation details in
  recommendation responses and Web display.
- Recently revived tracks: authenticated read-only revived-tracks endpoint and
  Web Recommendations section.
- Android shortcuts: static launcher shortcuts for Library, Recommendations,
  Cached Tracks, and Now Playing.

Safety constraints preserved:

- Duplicate detection remains advisory only.
- Reports and revived tracks are read-only.
- Batch tag editing changes only explicitly selected track/tag associations.
- Cover editing updates only the track cover path and does not regenerate audio.
- Recommendation explanations do not change rule-based ranking order.
- Android shortcuts route through existing auth/session recovery and do not
  auto-start playback or create a new playback service.

## Automated Verification

Latest implementation-session checks recorded locally:

- V1.1.7 Better Upload Progress:
  - Focused backend track/upload tests were updated for processing status and
    error contract behavior.
  - Web `npm run typecheck` and `npm run build` were required for the changed
    upload UI.
- V1.1.8 Batch Tag Editing:
  - Backend track API tests cover auth, ownership, add, remove, invalid tag,
    invalid track, and partial failure behavior.
  - Web `npm run typecheck` and `npm run build` were required for the changed
    Library UI.
- V1.1.9 Library Organization Reports:
  - Backend report API tests cover read-only report sections and ownership
    isolation.
  - Web `npm run typecheck` and `npm run build` were required for the new
    Reports page.
- V1.1.10 Cover Editing:
  - `.\.venv\Scripts\python.exe -m pytest tests\test_tracks_api.py tests\test_media_storage.py`
    from `backend/`: passed, 41 tests on 2026-06-09.
  - `npm run typecheck` from `web/`: passed on 2026-06-09.
  - `npm run build` from `web/`: passed on 2026-06-09.
- V1.1.11 Advanced Recommendation Explanations:
  - `.\.venv\Scripts\python.exe -m pytest tests\test_recommendations_service.py tests\test_recommendations_api.py tests\test_ai_recommend.py`
    from `backend/`: passed, 31 tests on 2026-06-09.
  - `.\.venv\Scripts\python.exe -m pytest` from `backend/`: passed, 241 tests
    on 2026-06-09.
  - `npm run typecheck` from `web/`: passed on 2026-06-09.
  - `npm run build` from `web/`: passed on 2026-06-09.
  - `.\gradlew.bat test` from `android/`: passed on 2026-06-09.
  - `.\gradlew.bat build` from `android/`: passed on 2026-06-09.
- V1.1.12 Recently Revived Tracks:
  - `.\.venv\Scripts\python.exe -m pytest tests\test_revived_tracks_api.py tests\test_recommendations_api.py tests\test_library_reports_api.py`
    from `backend/`: passed, 14 tests on 2026-06-09.
  - `npm run typecheck` from `web/`: passed on 2026-06-09.
  - `npm run build` from `web/`: passed on 2026-06-09.
- V1.1.13 Android Home Screen Shortcuts:
  - `.\gradlew.bat :app:testDebugUnitTest --tests com.easymusic.app.ShortcutRoutesTest`
    from `android/`: passed on 2026-06-10.
  - `.\gradlew.bat test` from `android/`: passed on 2026-06-10.
  - `.\gradlew.bat build` from `android/`: passed on 2026-06-10.

## Manual Verification Record

Manual checks with recorded operator verification:

- V1.1.10 Cover Editing, 2026-06-09:
  - Cover upload from Web Track Detail: passed.
  - Selected replacement preview appears before upload: passed.
  - Updated current cover persists after refresh: passed.
  - Web playback still works after cover replacement: passed.
  - Original and playback media paths remain unchanged: passed.
  - Invalid file rejection: passed.
- V1.1.11 Advanced Recommendation Explanations, 2026-06-09:
  - Web structured Recommendation explanation display: passed.
  - Concise rule-based reason text preserved: passed.
  - Recommendation feedback actions still work: passed.
  - Web AI Assistant parsed-intent behavior preserved: passed.
  - AI explanations do not replace rule-based result reasons: passed.
  - Exclusion notice displays for cooldown or same-day `not_today`: passed.
- V1.1.13 Android Home Screen Shortcuts, 2026-06-10:
  - Emulator/device shortcut smoke was completed by the operator.
  - Shortcuts were checked for Library, Recommendations, Cached Tracks, and Now
    Playing.
  - Signed-out shortcut launch routes through the existing Login flow.
  - Signed-in shortcut launch opens the expected screen.
  - Now Playing shortcut does not auto-start playback.

Manual checks not yet explicitly recorded in an acceptance note:

- V1.1.7 browser smoke for upload progress and processing status refresh.
- V1.1.8 browser smoke for Library multi-select batch tag add/remove.
- V1.1.9 browser smoke for Library Reports sections and Track Detail links.
- V1.1.12 browser smoke for the Recently Revived section and Track Detail links.

These unrecorded manual checks should be performed and appended here before
marking the full V1.1 workflow enhancement set as manually accepted.

## Current Status

Status as of 2026-06-10:

- Tasks V1.1.7 through V1.1.13 are implemented.
- Automated checks recorded for the touched backend, Web, and Android surfaces
  passed during their implementation sessions.
- Manual acceptance is complete for Cover Editing, Advanced Recommendation
  Explanations, and Android Home Screen Shortcuts.
- Manual acceptance remains to be explicitly recorded for Better Upload
  Progress, Batch Tag Editing, Library Organization Reports, and Recently
  Revived Tracks.

## Android Impact

Android source changed only for V1.1.13. Static launcher shortcuts route through
`MainActivity` and reuse existing navigation, auth recovery, Media3 playback,
and cached playback behavior. No backend APIs or shared response models were
changed for shortcuts.

Other V1.1 workflow enhancements either target backend/Web management surfaces
or add optional backend response fields that Android ignores unless explicitly
implemented later.
