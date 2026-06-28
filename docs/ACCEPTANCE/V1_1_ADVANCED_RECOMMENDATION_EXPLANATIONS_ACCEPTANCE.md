# V1.1 Advanced Recommendation Explanations Acceptance

This document records the V1.1 advanced recommendation explanation verification
flow for Easy Music. Structured explanations expose why rule-based
recommendations ranked the way they did, while preserving the existing concise
`reason` text and score ordering.

## Scope

In scope for this acceptance pass:

- Backend recommendation results include structured explanation details:
  matched tags, boosts, penalties, feedback impact, and avoidance reasons.
- Backend recommendation responses include `exclusions_considered` for tracks
  filtered before ranking, such as strict-mode active cooldown or same-day
  `not_today`.
- Existing deterministic `reason` text remains available.
- Rule-based ranking order is preserved.
- Web structured Recommendation and AI Assistant result cards display
  structured explanations without hiding concise reasons.
- Android recommendation parsing remains compatible with the expanded response.

Out of scope for V1.1 advanced recommendation explanations:

- AI-driven track selection.
- Changes to scoring weights or feedback penalties.
- Embeddings, vector search, ML ranking, or audio-feature scoring.
- Recently revived tracks.

## Automated Verification

Latest local automated result, 2026-06-09:

- `.\.venv\Scripts\python.exe -m pytest tests\test_recommendations_service.py tests\test_recommendations_api.py tests\test_ai_recommend.py`
  from `backend/`: passed, 31 tests.
- `.\.venv\Scripts\python.exe -m pytest` from `backend`: passed, 241 tests.
- `npm run typecheck` from `web/`: passed.
- `npm run build` from `web/`: passed.
- `.\gradlew.bat test` from `android/`: passed.
- `.\gradlew.bat build` from `android/`: passed.

## Manual Web Smoke Flow

Run this flow in a browser against a local backend. Do not commit generated test
media or local database/media state.

1. Start PostgreSQL, apply migrations, start the API, and create or reuse a
   local user.
2. From `web/`, start Vite with the local API base URL:

   ```powershell
   $env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
   npm run dev
   ```

3. Open `/recommendations` after login.
4. Select structured tags and optionally excluded attributes.
5. Request recommendations.
6. Confirm each result still displays the concise deterministic `reason`.
7. Confirm structured explanation blocks display readable matched tags, boosts,
   penalties, feedback impact, and avoidance details when present.
8. Confirm empty explanation categories are not shown.
9. Confirm `Filtered before ranking` appears when cooldown or same-day
   `not_today` filters apply.
10. Confirm recommendation feedback actions still work.
11. Open `/ai-assistant`.
12. Submit a natural-language request with a configured AI provider, or verify
    provider fallback status if AI is disabled/unconfigured.
13. Confirm parsed intent behavior is unchanged.
14. Confirm AI result cards display Phase 5 deterministic reasons plus the same
    structured explanation details.
15. Confirm AI explanations do not replace rule-based result reasons.

## Manual Verification Record

- Local backend date: 2026-06-09.
- Web browser and URL: passed by manual operator verification against the local
  Web console.
- `/recommendations` structured explanation display: passed.
- `/recommendations` concise reason text preserved: passed.
- `/recommendations` feedback actions still work: passed.
- `/ai-assistant` parsed-intent behavior preserved: passed.
- `/ai-assistant` structured explanation display: passed.
- AI explanation does not replace rule-based result reason: passed.
- Exclusion notice displays when cooldown or same-day `not_today` filters
  apply: passed.

Current status, 2026-06-09:

- Automated backend, Web, and Android checks passed.
- Manual Web smoke passed by operator verification.
- V1.1 advanced recommendation explanations are accepted for the Web
  recommendation and AI Assistant workflows.

## Android Impact

No Android source changes were required. Android parses recommendation JSON
manually and reads only the known fields it uses; the new optional
`explanation` and `exclusions_considered` keys are ignored by the existing
client. Android `test` and `build` passed, so Android playback, cache,
Recommendation V1, and AI Assistant V1 flows remain compatible with the
expanded recommendation response.
