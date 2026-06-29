# V2.5 AI Tag Suggestions V2 Tasks

Date: 2026-06-29

This slice keeps V2.5 on the existing AI tag suggestion flow. It improves
quality for `POST /api/ai/tracks/{track_id}/suggest-tags` by optionally adding
Tavily search snippets as internal prompt context, without adding a separate
organization module.

## Product Goal

Improve single-track AI tag suggestions so OpenAI-compatible providers,
especially DeepSeek-style providers, produce better `scene`, `type`, and
`feature` suggestions from local track metadata, optional Tavily search result
summaries, and the user's tag catalogue.

## Scope

- Keep using `POST /api/ai/tracks/{track_id}/suggest-tags`.
- Optionally generate a search query from title, artist, album, source URL, and
  original filename basename.
- Add narrow suggest-tags-only search settings:
  `AI_TAG_SEARCH_ENABLED`, `AI_TAG_SEARCH_PROVIDER`,
  `AI_TAG_SEARCH_API_KEY`, `AI_TAG_SEARCH_BASE_URL`,
  `AI_TAG_SEARCH_MAX_RESULTS`, and `AI_TAG_SEARCH_CACHE_DAYS`.
- Implement only the Tavily provider in this slice.
- Include only normalized search title/snippet/URL summaries in the prompt.
- Cache only query, status, timestamp, and normalized title/snippet/URL result
  summaries to reduce repeated search API usage.
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
- Document DeepSeek as an OpenAI-compatible provider option and Tavily as the
  external search source for this endpoint.

## Out Of Scope

- No AI organization module.
- No `/organize` or `/organize/apply` endpoint.
- No broad `AI_SEARCH_*` settings.
- No search provider abstraction outside AI tag suggestions.
- No keyless web search, scraping, crawling, or lyrics analysis.
- No playlist suggestions or playlist joins.
- No Android UI.
- No automatic tag application.
- No recommendation algorithm changes.

## DeepSeek And Search Boundary

DeepSeek can be configured through the existing OpenAI-compatible provider
contract by setting `AI_PROVIDER=openai-compatible`, a DeepSeek model id, and
DeepSeek's OpenAI-compatible `AI_BASE_URL`.

DeepSeek API usage is not treated as having a built-in web-search switch. V2.5
uses an explicit Tavily Search API call inside suggest-tags, then sends only the
normalized search summaries to DeepSeek/OpenAI-compatible completion. A future
tool/function-calling flow can replace this internal sequence, but it must stay
inside suggest-tags unless a later task changes scope.

## Implementation Tasks

1. Revert the independent V2.5 AI organization implementation.
2. Keep organization, `AI_SEARCH_*`, and apply docs removed.
3. Add `AI_TAG_SEARCH_*` settings and Tavily client for suggest-tags only.
4. Add a small search cache table for query/status/timestamp and normalized
   title/snippet/URL summaries.
5. Generate a search query from track metadata and original filename basename.
6. Fall back to metadata-only prompt when search is disabled, unconfigured,
   failed, or empty.
7. Update `AiTagSuggestionOutput` to prefer rich existing-tag suggestions with
   `tag_id`, `confidence`, and `reason`.
8. Preserve legacy `existing_tag_ids` parsing for compatibility.
9. Update `ai_tag_suggestions` prompt with search context, taxonomy guidance,
   and strict JSON instructions.
10. Filter prompt catalogue and responses to `scene`, `type`, and `feature`.
11. Add focused backend tests for V2 prompt/schema/search/cache behavior and
    safety.
12. Update development/API/manual docs with DeepSeek/OpenAI-compatible and
    Tavily guidance.
13. Run backend AI tests and Web checks if Web types change.
14. Record actual verification in the acceptance document.

## Acceptance Criteria

- The only single-track tag AI endpoint remains
  `POST /api/ai/tracks/{track_id}/suggest-tags`.
- No `/organize` or `/organize/apply` endpoint exists.
- No `AI_SEARCH_*` configuration exists.
- Tavily is scoped only to AI tag suggestions through `AI_TAG_SEARCH_*`.
- Search failures and empty results fall back to metadata-only suggestions.
- Search cache stores no page bodies or secrets.
- Suggest-tags output can preserve AI confidence/reason for existing tags.
- Legacy `existing_tag_ids` output still works.
- Legacy tag groups are filtered out.
- New tag suggestions are optional and limited to `scene`, `type`, `feature`.
- The endpoint never creates or assigns tags.
- Backend AI tests pass.
- Web typecheck/build pass.
