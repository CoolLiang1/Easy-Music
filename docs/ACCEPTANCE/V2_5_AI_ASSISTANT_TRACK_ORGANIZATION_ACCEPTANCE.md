# V2.5 AI Assistant Track Organization Acceptance

Date: 2026-06-28

This document defines the acceptance path for AI Assistant V2.1: single-track
AI organization with configured web search, cached research, cached analysis,
manual tag application, and manual playlist application.

Do not mark this feature accepted until the relevant automated checks and Web
manual smoke flows have actually completed. Local database files, provider
keys, media files, screenshots with private library data, and generated caches
must not be committed.

## Scope

In scope:

- Single-track AI organization from Web Track Detail.
- Configured Search API provider abstraction.
- First real provider implementation: `tavily-compatible`.
- Search disabled/unconfigured/error/ok states.
- Search result cache.
- AI organization analysis cache.
- Local metadata fallback when search is unavailable.
- Existing tag suggestions.
- New tag suggestions limited to `scene`, `type`, and `feature`.
- Existing playlist suggestions.
- Manual apply endpoint for selected tags and playlists.
- Web display of search summary, analysis summary, suggestion reasons, and
  confidence.

Out of scope:

- Full-library or batch organization.
- Background queue, retry scheduler, or all-library scan.
- Automatic tag application.
- Automatic playlist joins.
- Automatic playlist creation.
- Android UI.
- Keyless search, HTML scraping, music-site crawling, or page-body storage.
- Lyrics acquisition or lyrics analysis.
- Per-suggestion source references.
- Apply-event audit table.
- Recommendation algorithm changes.
- Embeddings, vector search, ML ranking, or model training.
- Broad Web UI redesign.

## Feature Acceptance Gates

### Gate 1: Search Configuration And Provider Safety

Required behavior:

- Search settings exist and are documented before deployment use:
  - `AI_SEARCH_ENABLED`
  - `AI_SEARCH_PROVIDER`
  - `AI_SEARCH_API_KEY`
  - `AI_SEARCH_BASE_URL`
  - `AI_SEARCH_MAX_RESULTS`
  - `AI_SEARCH_CACHE_DAYS`
- Search is off by default unless explicitly configured.
- Disabled search returns a clear disabled status.
- Missing provider configuration returns a clear unconfigured status.
- Provider HTTP/network errors return safe error messages.
- Real keys are never committed or logged.
- Tests use fake provider behavior and do not require live network access.

Acceptance checklist:

- [ ] Disabled search state tested.
- [ ] Unconfigured search state tested.
- [ ] Provider error state tested.
- [ ] Fake provider success state tested.
- [ ] Secrets are absent from committed files.

### Gate 2: Research And Analysis Cache

Required behavior:

- Research cache records are owner-scoped and track-scoped.
- Research cache stores normalized search result title, snippet, URL, provider,
  query, timestamps, status, and safe error message.
- Research cache does not store scraped page bodies.
- Analysis cache records are owner-scoped and track-scoped.
- Analysis cache stores suggestions, summary, confidence, provider/model,
  status, and safe error message.
- Cache lookup respects ownership.
- Research expiry is implemented through `AI_SEARCH_CACHE_DAYS`.

Acceptance checklist:

- [ ] Alembic migration creates research cache table.
- [ ] Alembic migration creates analysis cache table.
- [ ] Owner isolation is tested.
- [ ] Cache reuse is tested.
- [ ] Cache expiry or forced refresh is tested.
- [ ] No apply-event audit table is added.

### Gate 3: Organize Endpoint

Required behavior:

- `POST /api/ai/tracks/{track_id}/organize` exists.
- Unknown or unowned tracks cannot be organized.
- The endpoint can run with valid cached research.
- The endpoint can force a new search.
- The endpoint can force a new analysis.
- When search is disabled or unconfigured, the endpoint still returns a clear
  state and may analyze from local metadata if AI is available.
- When AI is disabled or unconfigured, the endpoint returns a clear analysis
  state without crashing.
- AI output is validated against the current user's tag and playlist
  catalogues.
- Illegal groups such as `attribute` are rejected.
- Playlist suggestions are limited to current-user playlists.

Acceptance checklist:

- [ ] Track ownership failure tested.
- [ ] Search-disabled fallback tested.
- [ ] AI-disabled/unconfigured state tested.
- [ ] Valid fake search plus valid fake AI tested.
- [ ] `force_refresh_search` tested.
- [ ] `force_reanalyze` tested.
- [ ] Invalid tag ID output tested.
- [ ] Invalid playlist ID output tested.
- [ ] Invalid tag group output tested.

### Gate 4: Apply Endpoint

Required behavior:

- `POST /api/ai/tracks/{track_id}/organize/apply` exists.
- The request references an analysis that belongs to the same user and track.
- The endpoint applies only user-selected existing tags.
- The endpoint creates or reuses only user-selected new tags.
- New tags are limited to `scene`, `type`, and `feature`.
- Same-name same-group new tags reuse existing tags.
- The endpoint applies only user-selected playlist joins.
- Playlist joins are owner-scoped and idempotent.
- The endpoint never creates playlists.
- The endpoint does not record apply-event audit rows.

Acceptance checklist:

- [ ] Existing tag apply tested.
- [ ] Existing tag idempotency tested.
- [ ] New tag creation tested.
- [ ] Same-name same-group tag reuse tested.
- [ ] Illegal new tag group rejection tested.
- [ ] Playlist apply tested.
- [ ] Playlist idempotency tested.
- [ ] Unowned tag/playlist rejection tested.
- [ ] Stale or mismatched analysis rejection tested.

### Gate 5: Web Track Detail Flow

Required behavior:

- Web Track Detail exposes an AI organization panel.
- Primary action: AI organize.
- Secondary action: refresh search.
- Secondary action: reanalyze.
- Research status and search summary are visible.
- Analysis summary and confidence are visible.
- Existing tag suggestions can be selected and applied.
- New tag suggestions can be selected and applied.
- New tag suggestions are not all selected by default.
- Playlist suggestions can be selected and applied.
- Apply success refreshes visible track/tag/playlist state.
- Provider disabled/unconfigured/error states are visible and do not break
  Track Detail.

Acceptance checklist:

- [ ] Web typecheck passes.
- [ ] Web build passes.
- [ ] Manual Web smoke covers search-disabled fallback.
- [ ] Manual Web smoke covers fake or real search success.
- [ ] Manual Web smoke covers applying existing tags.
- [ ] Manual Web smoke covers applying a new tag.
- [ ] Manual Web smoke covers applying a playlist suggestion.
- [ ] Manual Web smoke covers refresh search.
- [ ] Manual Web smoke covers reanalysis.

### Gate 6: Documentation And Status

Required behavior:

- Task and acceptance docs are updated with actual implementation results.
- Environment docs explain search configuration after settings exist.
- Development docs explain local fake-provider and real-provider expectations.
- API/manual testing docs include organize and apply smoke flows after endpoints
  exist.
- Roadmap/current status is updated only after verification.
- Acceptance record distinguishes fake-provider tests from real-provider smoke.

Acceptance checklist:

- [ ] Environment docs updated after config implementation.
- [ ] Development docs updated after workflow implementation.
- [ ] API/manual testing docs updated after endpoint implementation.
- [ ] Roadmap updated only after verified implementation.
- [ ] This acceptance record contains dated verification results.

## Manual Web Smoke Flow

Record actual results here when the implementation exists.

### Smoke 1: Search Disabled Or Unconfigured

Goal:

- Confirm the feature is usable and understandable when Search API is not
  configured.

Expected:

- Track Detail loads.
- AI organization panel loads.
- Running AI organization does not crash.
- Research status explains disabled or unconfigured search.
- If AI provider is configured, local metadata analysis can still produce
  suggestions.
- If AI provider is also unavailable, the panel shows a clear AI unavailable
  state.

Result:

- [ ] Not run.

### Smoke 2: Search Success And Analysis Success

Goal:

- Confirm a configured fake or real provider can produce research and analysis.

Expected:

- Search summary shows query, provider, and normalized result rows.
- Analysis summary appears.
- Existing tag suggestions appear when relevant.
- New tag suggestions appear when relevant.
- Playlist suggestions appear when relevant.
- No suggestion is applied before user confirmation.

Result:

- [ ] Not run.

### Smoke 3: Apply Selected Suggestions

Goal:

- Confirm selected suggestions are applied safely.

Expected:

- Applying selected existing tags updates Track Detail.
- Applying a selected new tag creates or reuses the tag and applies it.
- Applying selected playlist suggestions adds the track to those playlists.
- Repeating the same apply action remains safe and idempotent.
- Unselected suggestions remain unapplied.

Result:

- [ ] Not run.

### Smoke 4: Refresh Search And Reanalyze

Goal:

- Confirm advanced actions behave predictably.

Expected:

- Refresh search gets fresh research or updates research timestamp/status.
- Reanalyze reuses current research and creates a fresh analysis.
- Errors remain contained to the AI organization panel.

Result:

- [ ] Not run.

## Automated Verification Record

Append dated results here during implementation.

### Backend

Required coverage:

- [ ] Search disabled/unconfigured/error/ok.
- [ ] AI disabled/unconfigured/error/ok.
- [ ] Research cache reuse and forced refresh.
- [ ] Analysis cache reuse and forced reanalysis.
- [ ] Track ownership.
- [ ] Tag ownership.
- [ ] Playlist ownership.
- [ ] Invalid AI tag IDs.
- [ ] Invalid AI playlist IDs.
- [ ] Invalid AI tag groups.
- [ ] Apply existing tags.
- [ ] Apply new tags with reuse.
- [ ] Apply playlist joins.

Result:

- [ ] Not run.

### Web

Required coverage:

- [ ] Typecheck.
- [ ] Build.
- [ ] Focused component or API tests if the project has suitable local
  patterns.

Result:

- [ ] Not run.

### Android

Android UI is out of scope. Run Android checks only if shared API models or
contracts change in a way that touches Android code.

Result:

- [ ] Not required yet.

## Current Status

Status as of 2026-06-28:

- Planning document created.
- Acceptance gates defined.
- Implementation not started in this acceptance record.
- No automated checks or manual smoke flows have been recorded for this slice.

