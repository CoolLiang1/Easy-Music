# V2.5 AI Tag Suggestions V2 Tasks

Date: 2026-06-29

This slice corrects the V2.5 direction back to the existing AI tag suggestion
flow. It improves quality for `POST /api/ai/tracks/{track_id}/suggest-tags`
without adding a separate organization module.

## Product Goal

Improve single-track AI tag suggestions so OpenAI-compatible providers,
especially DeepSeek-style providers, produce better `scene`, `type`, and
`feature` suggestions from local track metadata and the user's tag catalogue.

## Scope

- Keep using `POST /api/ai/tracks/{track_id}/suggest-tags`.
- Improve the prompt around the current taxonomy:
  - `scene`: listening situation or context.
  - `type`: music/content format or genre-like type.
  - `feature`: sound, mood, energy, texture, season, or atmosphere.
- Improve the AI output contract for existing tags so suggestions can include
  `tag_id`, `confidence`, and `reason`.
- Keep legacy `existing_tag_ids` output accepted as a fallback.
- Filter existing and new suggestions to `scene`, `type`, and `feature`.
- Keep all AI suggestions advisory; users must still manually save tags through
  existing track/tag flows.
- Document DeepSeek as an OpenAI-compatible provider option.

## Out Of Scope

- No AI organization module.
- No `/organize` or `/organize/apply` endpoint.
- No Tavily integration.
- No `AI_SEARCH_*` settings.
- No search provider abstraction.
- No keyless web search, scraping, crawling, or lyrics analysis.
- No playlist suggestions or playlist joins.
- No Android UI.
- No automatic tag application.
- No recommendation algorithm changes.

## DeepSeek And Search Boundary

DeepSeek can be configured through the existing OpenAI-compatible provider
contract by setting `AI_PROVIDER=openai-compatible`, a DeepSeek model id, and
DeepSeek's OpenAI-compatible `AI_BASE_URL`.

If DeepSeek API usage does not expose a built-in web-search switch for this
endpoint, Easy Music must not pretend search is implemented. Networked search
would require an explicit external Search API plus tool/function-calling flow;
that is intentionally deferred.

## Implementation Tasks

1. Revert the independent V2.5 AI organization implementation.
2. Remove organization, Tavily, `AI_SEARCH_*`, cache, and apply docs.
3. Update `AiTagSuggestionOutput` to prefer rich existing-tag suggestions with
   `tag_id`, `confidence`, and `reason`.
4. Preserve legacy `existing_tag_ids` parsing for compatibility.
5. Update `ai_tag_suggestions` prompt with taxonomy guidance and strict JSON
   instructions.
6. Filter prompt catalogue and responses to `scene`, `type`, and `feature`.
7. Add focused backend tests for V2 prompt/schema behavior and safety.
8. Update development/API/manual docs with DeepSeek/OpenAI-compatible guidance.
9. Run backend AI tests and Web typecheck/build.
10. Record actual verification in the acceptance document.

## Acceptance Criteria

- The only single-track tag AI endpoint remains
  `POST /api/ai/tracks/{track_id}/suggest-tags`.
- No `/organize` or `/organize/apply` endpoint exists.
- No `AI_SEARCH_*` configuration exists.
- No Tavily/search provider service or tests remain.
- Suggest-tags output can preserve AI confidence/reason for existing tags.
- Legacy `existing_tag_ids` output still works.
- Legacy tag groups are filtered out.
- New tag suggestions are optional and limited to `scene`, `type`, `feature`.
- The endpoint never creates or assigns tags.
- Backend AI tests pass.
- Web typecheck/build pass.
