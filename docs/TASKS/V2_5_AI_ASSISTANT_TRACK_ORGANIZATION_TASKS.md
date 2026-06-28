# V2.5 AI Assistant Track Organization Tasks

Date: 2026-06-28

This document plans the first AI Assistant V2 slice for Easy Music:
single-track AI organization with configured web search, cached research,
cached analysis, tag suggestions, and playlist suggestions.

The feature is intentionally management-oriented. The first user-facing entry
belongs in Web Track Detail. Android must remain compatible but does not get
new UI in this slice.

## Product Goal

For one track at a time, let the owner ask Easy Music to research and organize
the track:

1. Use local track metadata.
2. Optionally search the web through a configured Search API.
3. Combine search snippets, the user's tag catalogue, and the user's playlist
   catalogue.
4. Suggest existing tags, new tags, and existing playlists.
5. Let the user manually choose what to apply.

The AI must assist organization. It must not automatically write tags, create
playlists, join playlists, or modify recommendation behavior without explicit
user confirmation.

## Current System To Reuse

- Backend AI provider abstraction and OpenAI-compatible completion client.
- Existing `POST /api/ai/tracks/{track_id}/suggest-tags` behavior as the
  narrower V1 metadata-only tag suggestion baseline.
- Backend track ownership checks and track detail loading.
- Backend tag model and the current simplified taxonomy:
  - `scene`: suitable listening scenario.
  - `type`: music or content type.
  - `feature`: musical quality, mood, energy, season, or atmosphere.
- Backend playlist model and owner-scoped playlist membership.
- Existing track update/tag assignment behavior.
- Existing playlist add-track behavior.
- Web Track Detail page and AI suggestion UI patterns.
- Existing provider fallback states: `disabled`, `unconfigured`, `error`, `ok`.

## Locked Product Decisions

- First version is single-track only.
- First version is Web-only for UI.
- Android UI is out of scope.
- Search must use an explicitly configured Search API.
- No keyless search, no HTML scraping, no crawling music sites.
- First provider implementation is `tavily-compatible` behind a search provider
  abstraction.
- Search results and AI analysis results are cached in the database.
- The user can force a new search or force a new analysis.
- Suggestions include existing tags, new tags, and existing playlist joins.
- Every apply action is manual.
- Each suggestion needs `reason` and `confidence`.
- Per-suggestion source references are not required.
- A whole-analysis search summary should still be visible in Web.
- New tag suggestions are allowed, but default UI should not auto-select them.
- New tags may only use `scene`, `type`, or `feature`.
- If a same-name same-group tag already exists, applying a new tag suggestion
  must reuse the existing tag instead of creating a duplicate.
- AI can suggest joining existing playlists only. It must not suggest creating
  new playlists.
- No lyrics acquisition or lyrics analysis in this slice.
- No apply-event audit table in this slice.
- No batch organization, background queue, full-library scan, retry scheduler,
  embedding system, ML ranking, or recommendation rewrite.

## Global Boundaries

- Do not commit real Search API keys or AI provider keys.
- Do not store API keys in database records.
- Do not store scraped page bodies; first version stores normalized search
  result title, snippet, URL, provider, query, timestamps, status, and error.
- Do not expose unrestricted internal paths.
- Do not let AI apply unowned tag IDs, unowned playlist IDs, or invalid tag
  groups.
- Do not let AI create or apply `attribute` or any legacy tag group.
- Do not change playback queue, playlist playback modes, recommendation
  scoring, upload, import, or track deletion behavior.
- Do not add broad UI redesign while implementing this feature.
- Keep provider behavior testable without live network calls.

## Proposed API Surface

### Organize One Track

`POST /api/ai/tracks/{track_id}/organize`

Request fields:

- `force_refresh_search`: when true, ignore usable search cache and run a new
  search before analysis.
- `force_reanalyze`: when true, keep current research when allowed but call the
  AI provider again.

Response fields should include:

- `track_id`
- `research_status`: `ok`, `disabled`, `unconfigured`, or `error`
- `analysis_status`: `ok`, `disabled`, `unconfigured`, or `error`
- `research`: latest usable research record or null
- `analysis`: latest usable analysis record or null
- clear user-facing error messages when search or AI is unavailable

### Apply Selected Suggestions

`POST /api/ai/tracks/{track_id}/organize/apply`

Request fields:

- `analysis_id`
- `existing_tag_ids`
- `new_tags`: list of `{name, group}`
- `playlist_ids`

Response fields should include:

- `track_id`
- `applied_existing_tag_ids`
- `created_tag_ids`
- `reused_tag_ids`
- `applied_playlist_ids`
- optional skipped/failed item details for invalid or stale selections

The apply endpoint executes only user-selected items. It must not infer extra
items from the analysis.

## Suggested Data Model

Use final names that match project style, but preserve these concepts.

### Track AI Research

Stores normalized configured-search results for one track.

Recommended fields:

- `id`
- `track_id`
- `user_id`
- `query`
- `provider`
- `status`
- `results_json`
- `error_message`
- `fetched_at`
- `expires_at`
- `created_at`

### Track AI Analysis

Stores the AI organization result for one track and research record.

Recommended fields:

- `id`
- `track_id`
- `user_id`
- `research_id`
- `provider`
- `model`
- `status`
- `summary`
- `confidence`
- `existing_tag_suggestions_json`
- `new_tag_suggestions_json`
- `playlist_suggestions_json`
- `error_message`
- `created_at`

Do not add an apply-event audit table in this slice.

## Search Configuration

Add development and production-safe environment settings:

- `AI_SEARCH_ENABLED`
- `AI_SEARCH_PROVIDER`
- `AI_SEARCH_API_KEY`
- `AI_SEARCH_BASE_URL`
- `AI_SEARCH_MAX_RESULTS`
- `AI_SEARCH_CACHE_DAYS`

Expected first provider:

- `AI_SEARCH_PROVIDER=tavily-compatible`

When search is disabled or unconfigured:

- The organize endpoint remains callable.
- Research status must clearly report `disabled` or `unconfigured`.
- Analysis may still run from local metadata only when the AI provider itself is
  available.
- Web must make it clear that the result did not use web search.

## AI Analysis Input Contract

The analysis prompt should include:

- Track metadata:
  - title
  - artist
  - album
  - content type
  - source URL when available
  - original filename when available
- Search summary:
  - query
  - provider
  - normalized result titles
  - normalized result snippets
  - normalized result URLs
- Current user's tag catalogue:
  - `tag_id`
  - name
  - group: `scene`, `type`, or `feature`
- Current user's playlist catalogue:
  - `playlist_id`
  - name
  - description
  - track count when available

## AI Analysis Output Contract

The AI must return structured JSON only.

Required output groups:

- `existing_tag_suggestions`
  - `tag_id`
  - `confidence`
  - `reason`
- `new_tag_suggestions`
  - `name`
  - `group`
  - `confidence`
  - `reason`
- `playlist_suggestions`
  - `playlist_id`
  - `confidence`
  - `reason`
- `summary`
- `confidence`

Validation rules:

- Existing tag IDs must belong to the current user.
- Existing tag IDs must be in the supplied catalogue.
- Existing tag groups must match the current taxonomy.
- New tag groups must be only `scene`, `type`, or `feature`.
- Playlist IDs must belong to the current user.
- Playlist IDs must be in the supplied catalogue.
- Invalid AI output must be rejected or filtered safely with a clear status.

## Recommended Implementation Order

1. Create backend schemas for search status, research result, organization
   analysis, suggestions, and apply request/response.
2. Add search settings and document them in environment docs in a later docs
   sync task.
3. Add search provider abstraction plus `tavily-compatible` implementation.
4. Add fake search provider support for tests.
5. Add database models and Alembic migration for research and analysis cache.
6. Implement single-track research service with cache expiry.
7. Implement single-track analysis service using existing AI provider patterns.
8. Implement `POST /api/ai/tracks/{track_id}/organize`.
9. Implement `POST /api/ai/tracks/{track_id}/organize/apply`.
10. Add Web API wrapper/types.
11. Add Web Track Detail "AI organization" panel.
12. Add backend tests, Web type/build checks, docs, and manual smoke record.

## Task V2.5.1: Search Provider Configuration And Abstraction

### Goal

Introduce a configured Search API provider layer for AI organization without
doing scraping or relying on a live provider during tests.

### Files To Inspect

- `backend/app/core/config.py`
- `backend/app/services/ai_provider.py`
- `backend/app/services/ai_client.py`
- `backend/app/schemas/ai.py`
- `backend/tests/test_ai_client.py`
- `docs/ENVIRONMENT.md`
- `.env.example`
- `.env.production.example`

### Scope

- Add search settings.
- Add a normalized internal search result schema.
- Add search provider status values matching the existing AI provider style.
- Add `tavily-compatible` provider implementation.
- Add fake provider path for tests.
- Ensure provider errors are user-safe and do not leak secrets.

### Acceptance Criteria

- Disabled search returns a clear disabled status.
- Missing key/model/base configuration returns a clear unconfigured status.
- Provider HTTP errors map to safe error statuses.
- Provider network errors map to safe error statuses.
- Normal provider responses map to normalized title/snippet/URL results.
- Tests do not require real network access.

### Do Not

- Do not scrape search engine HTML.
- Do not crawl result URLs.
- Do not support multiple real providers in this task.
- Do not add Web UI in this task.

## Task V2.5.2: Research And Analysis Cache Models

### Goal

Persist normalized search research and AI organization analysis so one track
does not repeat paid or rate-limited work on every page load.

### Files To Inspect

- `backend/app/models/`
- `backend/app/db/`
- `backend/alembic/versions/`
- `backend/tests/`

### Scope

- Add research cache model.
- Add analysis cache model.
- Add Alembic migration.
- Store owner IDs for isolation and simpler ownership checks.
- Store JSON suggestion payloads in backend-controlled shapes.
- Add cache expiry for research.
- Keep latest analysis discoverable for a track.

### Acceptance Criteria

- Migration creates both cache tables.
- Research records are owner-scoped and track-scoped.
- Analysis records are owner-scoped and track-scoped.
- Research results store normalized snippets, not page bodies.
- Analysis stores suggestions, summary, confidence, provider/model, and status.
- Tests cover owner isolation and cache lookup behavior.

### Do Not

- Do not store API keys.
- Do not add an apply-event audit table.
- Do not add background jobs or batch processing.

## Task V2.5.3: Single-Track Organization Analysis Endpoint

### Goal

Expose `POST /api/ai/tracks/{track_id}/organize` for one-track research and AI
organization.

### Files To Inspect

- `backend/app/api/routes/ai.py`
- `backend/app/services/ai_tag_suggestions.py`
- `backend/app/services/ai_intent.py`
- `backend/app/services/playlists.py`
- `backend/app/services/tags.py`
- `backend/app/models/track.py`
- `backend/app/models/tag.py`
- `backend/app/models/playlist.py`
- `backend/tests/test_ai_tag_suggestions.py`
- `backend/tests/test_ai_intent.py`

### Scope

- Verify track ownership.
- Build a safe search query from title, artist, album, and filename.
- Use valid search cache unless forced refresh is requested.
- Support local-metadata fallback when search is disabled or unconfigured.
- Build AI prompt from metadata, search summary, tags, and playlists.
- Validate AI output against current-user tags and playlists.
- Store analysis result.
- Return latest research and analysis to Web.

### Acceptance Criteria

- Unknown or unowned tracks cannot be organized.
- Unconfigured search does not crash organization.
- Disabled AI provider returns a clear analysis status.
- Valid fake search plus valid fake AI returns cached research and analysis.
- `force_refresh_search` creates or replaces usable research.
- `force_reanalyze` creates a fresh analysis from current research.
- Invalid tag IDs from AI are rejected or filtered safely.
- Invalid playlist IDs from AI are rejected or filtered safely.
- Legacy groups such as `attribute` are rejected.
- Playlist suggestions are limited to current-user playlists.

### Do Not

- Do not apply any suggestion in this endpoint.
- Do not let AI create tags or playlists.
- Do not change recommendation scoring.
- Do not add Android UI.

## Task V2.5.4: Apply Selected Organization Suggestions

### Goal

Expose `POST /api/ai/tracks/{track_id}/organize/apply` so the user can apply
selected suggestions in one safe request.

### Files To Inspect

- `backend/app/api/routes/ai.py`
- `backend/app/services/tags.py`
- `backend/app/services/tracks.py`
- `backend/app/services/playlists.py`
- `backend/app/api/routes/tracks.py`
- `backend/app/api/routes/playlists.py`
- `backend/tests/test_tracks_api.py`
- `backend/tests/test_playlists_api.py`

### Scope

- Require an analysis ID that belongs to the same user and track.
- Apply selected existing tag IDs.
- Create or reuse selected new tags.
- Add the track to selected playlists.
- Keep operations idempotent where possible.
- Return explicit created/reused/applied results.
- Return safe errors or skipped details for stale selections.

### Acceptance Criteria

- Applying existing tags is idempotent.
- Existing tag IDs must belong to the current user.
- Existing tag IDs must be present in the referenced analysis or otherwise pass
  a documented strict validation rule.
- New tags use only `scene`, `type`, or `feature`.
- Same-name same-group new tags reuse existing tags.
- Playlist IDs must belong to the current user.
- Playlist add operations are idempotent.
- The endpoint never applies unselected suggestions.
- The endpoint does not create playlists.

### Do Not

- Do not record apply-event audit rows.
- Do not automatically apply high-confidence suggestions.
- Do not create tags from AI output unless the user selected them.

## Task V2.5.5: Web Track Detail AI Organization Panel

### Goal

Add the first user-facing AI V2 management entry to Web Track Detail.

### Files To Inspect

- `web/src/pages/TrackDetailPage.tsx`
- `web/src/api/ai.ts`
- `web/src/types/ai.ts`
- `web/src/api/tags.ts`
- `web/src/api/playlists.ts`
- Existing Web AI tag suggestion UI

### Scope

- Add a Track Detail panel for AI organization.
- Add primary action: AI organize.
- Add secondary actions: refresh search and reanalyze.
- Display research status and search summary.
- Display analysis summary and confidence.
- Display existing tag suggestions with checkboxes.
- Display new tag suggestions with checkboxes, default unselected.
- Display playlist suggestions with checkboxes.
- Apply selected suggestions through the new apply endpoint.
- Refresh track/tags/playlists after successful apply.
- Display disabled, unconfigured, error, and loading states clearly.

### Acceptance Criteria

- User can run AI organization from Track Detail.
- User can see whether web search was used.
- User can re-run search and re-run analysis.
- User can select existing tag suggestions and apply them.
- User can select new tag suggestions and apply them.
- User can select playlist suggestions and apply them.
- New tag suggestions are not all auto-selected by default.
- Applying suggestions updates the Track Detail state without a full app reset.
- Provider errors do not break the rest of Track Detail.
- Web typecheck and build pass.

### Do Not

- Do not add Android UI.
- Do not add batch organization UI.
- Do not redesign the whole Track Detail page.

## Task V2.5.6: Verification And Documentation Sync

### Goal

Close the slice with focused automated checks, Web smoke, and documentation
updates.

### Scope

- Backend tests for search provider states, cache, analysis validation, and
  apply endpoint.
- Web typecheck/build.
- Manual Web smoke for the Track Detail organization flow.
- Update environment/development/API docs where search config and smoke flows
  become real.
- Update roadmap/current status only after implementation and verification.
- Update acceptance record only with checks actually run.

### Acceptance Criteria

- Backend tests cover disabled/unconfigured/error/ok search states.
- Backend tests cover disabled/unconfigured/error/ok AI states.
- Backend tests cover cache reuse, force refresh, and force reanalysis.
- Backend tests cover unowned track/tag/playlist rejection.
- Backend tests cover illegal tag group rejection.
- Backend tests cover idempotent apply behavior.
- Web typecheck/build pass.
- Manual Web smoke is recorded.
- Documentation does not claim live-provider success unless it was actually
  tested with a configured provider.

### Do Not

- Do not mark the feature accepted from automated tests alone if Web smoke was
  not run.
- Do not claim real Tavily provider verification if only a fake provider was
  used.

