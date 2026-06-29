# V2.5 AI Tag Suggestions V2 Acceptance

Date: 2026-06-29

This document records acceptance for the corrected V2.5 direction: quality
improvements to the existing AI tag suggestion endpoint.

## Scope

In scope:

- Existing endpoint: `POST /api/ai/tracks/{track_id}/suggest-tags`.
- OpenAI-compatible provider usage, including DeepSeek-compatible settings.
- Better prompt guidance for `scene`, `type`, and `feature`.
- Rich existing-tag suggestion output with confidence and reason.
- Optional new-tag suggestions limited to current taxonomy groups.
- Disabled, unconfigured, error, and fake-provider success states.
- Backend tests and Web type/build checks.

Out of scope:

- AI organization module.
- `/organize` or `/organize/apply` endpoints.
- Tavily, `AI_SEARCH_*`, search provider abstraction, or web scraping.
- Lyrics analysis.
- Playlist suggestions.
- Android UI.
- Automatic tag application.
- Recommendation algorithm changes.

## Acceptance Gates

### Gate 1: Direction Revert

Required behavior:

- The three implementation commits for AI organization are reverted through git
  revert commits.
- User-local uncommitted changes are preserved.
- Organization code paths are removed.

Checklist:

- [x] Reverted `335d114 feat: add AI organization panel to track detail`.
- [x] Reverted `843cf5b feat: apply AI organization suggestions`.
- [x] Reverted `4739d2e feat: add AI track organization analysis foundation`.
- [x] Existing Android local change was left untouched.

### Gate 2: Endpoint And Configuration Boundaries

Required behavior:

- `POST /api/ai/tracks/{track_id}/suggest-tags` remains available.
- No `POST /api/ai/tracks/{track_id}/organize` endpoint exists.
- No `POST /api/ai/tracks/{track_id}/organize/apply` endpoint exists.
- No `AI_SEARCH_*` settings are introduced.
- No Tavily/search provider service is present.

Checklist:

- [x] Suggest-tags endpoint retained.
- [x] Organization endpoints removed by revert.
- [x] `AI_SEARCH_*` code/config removed by revert.
- [x] Search provider files/tests removed by revert.

### Gate 3: Suggest-Tags V2 Quality

Required behavior:

- Prompt includes taxonomy guidance for `scene`, `type`, and `feature`.
- Existing tag suggestions can carry `tag_id`, `confidence`, and `reason`.
- Legacy `existing_tag_ids` output still works.
- Existing tag suggestions are owner-scoped and group-filtered.
- New tag suggestions are optional, trimmed, deduplicated, and group-filtered.
- The endpoint never creates tags or assigns tags to tracks.

Checklist:

- [x] Rich existing-tag suggestion schema implemented.
- [x] Legacy `existing_tag_ids` compatibility retained.
- [x] Prompt taxonomy guidance implemented.
- [x] Legacy groups filtered from prompt catalogue and responses.
- [x] New-tag cleanup and dedupe implemented.
- [x] No automatic tag creation or assignment.

### Gate 4: DeepSeek Documentation Boundary

Required behavior:

- DeepSeek is documented as an OpenAI-compatible provider option.
- Documentation does not claim DeepSeek API web search is implemented.
- Documentation states that networked search would require an explicit external
  Search API plus tool/function-calling flow and is not part of V2.5.

Checklist:

- [x] Development docs updated.
- [x] API/manual testing docs updated.
- [x] Roadmap/current status updated.

## Verification Record

### Backend

Required checks:

- Focused AI tag suggestion tests.
- Existing AI intent/recommend/provider/json regression tests.

Result:

- [x] Passed on 2026-06-29:
  `backend/.venv/Scripts/python.exe -m pytest tests/test_ai_tag_suggestions.py tests/test_ai_intent.py tests/test_ai_recommend.py tests/test_ai_json.py tests/test_ai_provider.py`
  from `backend/` (`97 passed`).

### Web

Required checks:

- Typecheck.
- Build.

Result:

- [x] Passed on 2026-06-29: `npm run typecheck` from `web/`.
- [x] Passed on 2026-06-29: `npm run build` from `web/`.

### Android

Android UI is out of scope.

Result:

- [x] Not required.

## Current Status

Status as of 2026-06-29:

- Direction corrected away from independent AI organization.
- V2.5 is now AI Tag Suggestions V2.
- Backend AI tests and Web type/build checks passed locally.
