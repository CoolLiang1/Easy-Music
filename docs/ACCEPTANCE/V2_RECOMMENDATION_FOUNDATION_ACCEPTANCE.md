# V2 Recommendation Foundation Acceptance

This document records the Recommendation V2 foundation slice. It changes the
rule-based scoring foundation while preserving the existing recommendation API
shape for Web, Android, and AI-assisted recommendation flows.

## Scope

Accepted implementation scope:

- `POST /api/recommendations` accepts optional `cooldown_mode` values `off`,
  `soft`, and `strict`.
- Default cooldown behavior is `soft`; active cooldown applies a penalty and
  appears in result reasons/explanations instead of being filtered out.
- `strict` cooldown mode preserves the old active-cooldown hard exclusion.
- Same-day `not_today` remains a hard exclusion.
- Recent playback remains a soft penalty.
- `like` boosts scoring and `dislike` applies a strong feedback penalty.
- Owner-scoped playlist membership boosts tracks.
- Playlist name/description relevance to requested tag names or optional
  `raw_text` gives additional boosts.
- Recommendation reasons and structured explanations identify tag matches,
  playlist boosts, liked/dislike feedback, recent playback, cooldown penalties,
  and hard exclusions.
- Playlist descriptions are optional and do not create smart/generated
  playlists.

Out of scope:

- Embeddings, vector search, ML ranking, audio analysis, or training systems.
- Networked AI or AI-selected tracks.
- Automatic playlist generation.
- Tag taxonomy migration.
- Broad Web or Android UI redesign.

## Automated Verification

Implementation-pass checks run on 2026-06-28:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_revived_tracks_api.py tests\test_recommendations_service.py tests\test_recommendations_api.py tests\test_feedback_events_api.py tests\test_playlists_api.py tests\test_ai_recommend.py
```

Result:

- Passed: 67 tests.

```powershell
cd web
npm run typecheck
npm run build
```

Result:

- Typecheck passed.
- Build passed.

```powershell
cd android
.\gradlew.bat testDebugUnitTest --tests "com.easymusic.app.recommendation.*" --tests "com.easymusic.app.playlist.*"
```

Result:

- Passed.

Broader regression checks run on 2026-06-28:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m alembic heads
```

Results:

- Full backend test suite: 329 passed, 2 skipped.
- Alembic head: `20260628_0010 (head)`.

```powershell
cd android
.\gradlew.bat build
```

Result:

- Build successful.
- Gradle reported existing deprecation warnings for future Gradle 9
  compatibility.

## Current Status

- Backend focused tests cover cooldown `off`/`soft`/`strict`, playlist
  membership and name/description boosts, liked/dislike/not_today behavior,
  owner-scoped playlist isolation, and AI recommendation delegation.
- Web types compile with the expanded recommendation and playlist contracts.
- Android recommendation and playlist model/repository tests compile with the
  expanded contracts.
- Manual Web and Android smoke were not rerun in this implementation pass.
