# API Manual Testing

This document provides a repeatable local smoke test for the Phase 1 backend.
It verifies migrations, initial-user creation, login, upload validation, worker
processing, and authenticated audio streaming.

## Prerequisites

- Docker Desktop or a compatible Docker Compose environment.
- Python 3.12 or newer for local backend commands.
- Backend development dependencies installed in `backend/.venv`.
- `ffmpeg` and `ffprobe` available on `PATH` for real media processing.

Check local media tools:

```powershell
ffmpeg -version
ffprobe -version
```

From the repository root, start PostgreSQL:

```powershell
docker compose up -d postgres
```

From `backend/`, configure local command environment:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
$env:APP_SECRET_KEY = "development-secret-key-change-before-deploy"
```

Apply migrations:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create the initial user:

```powershell
$env:EASY_MUSIC_INITIAL_PASSWORD = "replace-with-a-local-password"
.\.venv\Scripts\python.exe -m app.auth.initial_user --username admin
```

If a user already exists, keep using that user instead of creating another one.

## Start The API

Run the API from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second PowerShell window, verify health:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/health"
```

## Login

```powershell
$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"replace-with-a-local-password"}'

$token = $login.access_token
$headers = @{ Authorization = "Bearer $token" }
```

Verify the current user:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/auth/me" `
  -Headers $headers
```

## Upload A Test Audio File

Create a tiny WAV file with FFmpeg:

```powershell
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" test-tone.wav
```

Upload it:

```powershell
$upload = curl.exe `
  -s `
  -X POST `
  -H "Authorization: Bearer $token" `
  -F "file=@test-tone.wav;type=audio/wav" `
  "http://127.0.0.1:8000/api/tracks/upload" | ConvertFrom-Json

$trackId = $upload.id
$upload
```

Expected result:

- HTTP response creates a track.
- `status` is `processing`.
- `processing_job_status` is `pending`.
- `processing_error_message` is `null`.
- `original_file_path` is under the configured media root.
- `playback_file_path` is `null`.
- A pending processing job exists in the database.

## Run The Worker

From `backend/`, process one pending job:

```powershell
.\.venv\Scripts\python.exe -m app.worker
```

Or process the uploaded track directly:

```powershell
.\.venv\Scripts\python.exe -m app.worker --track-id $trackId
```

Run the local worker continuously:

```powershell
.\.venv\Scripts\python.exe -m app.worker --loop --poll-interval 5
```

Verify the track is ready:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/$trackId" `
  -Headers $headers
```

Expected result:

- `status` is `ready`.
- `processing_job_status` is `succeeded`.
- `processing_error_message` is `null`.
- `duration_seconds`, `format`, or `bitrate` are populated when ffprobe can
  read them.
- `playback_file_path` points at a generated MP3 playback file.

## Review Duplicate Candidates

V1.1 adds a read-only duplicate-candidate endpoint. It is advisory only: it
does not delete, merge, overwrite, hide, or update tracks.

List all duplicate candidate groups for the authenticated user:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/duplicates" `
  -Headers $headers
```

Filter duplicate candidate groups for one uploaded or existing track:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/duplicates?track_id=$trackId" `
  -Headers $headers
```

Expected result:

- The response is an array of duplicate groups, or an empty array when no
  candidates are found.
- Each group includes `group_id`, `match_type`, `confidence`, `reason`,
  `candidate_track_ids`, and compact `candidates`.
- `match_type` is `exact_file` for matching file hashes or
  `metadata_duration` for conservative metadata/duration matches.
- Compact candidates include safe track metadata such as `id`, `title`,
  `artist`, `album`, `duration_seconds`, `content_type`, and `status`.
- Internal media paths are not included in the compact candidate payload.
- A missing token returns `401 Unauthorized`.
- A missing or unowned `track_id` filter returns `404 Not Found`.
- The endpoint never mutates track data.

For V1.1 duplicate-detection acceptance, pair this API check with the Web smoke
flow in `docs/DEVELOPMENT.md` and record results in
`docs/ACCEPTANCE/V1_1_DUPLICATE_DETECTION_ACCEPTANCE.md`. Duplicate detection
must not be marked accepted until the Web upload warning and Library duplicate
review have both been manually verified.

## Stream A Ready Track

Download the full stream:

```powershell
curl.exe `
  -L `
  -H "Authorization: Bearer $token" `
  "http://127.0.0.1:8000/api/tracks/$trackId/stream" `
  --output playback.mp3
```

Verify a range request:

```powershell
curl.exe `
  -i `
  -H "Authorization: Bearer $token" `
  -H "Range: bytes=0-99" `
  "http://127.0.0.1:8000/api/tracks/$trackId/stream"
```

Expected result:

- Full stream returns `200 OK`.
- Range stream returns `206 Partial Content`.
- Response includes `Accept-Ranges: bytes`.
- Invalid or missing auth returns `401 Unauthorized`.

## Delete One Track

Use a separate throwaway track for this smoke test so later playback checks can
keep using `$trackId`.

```powershell
$deleteUpload = curl.exe `
  -s `
  -X POST `
  -H "Authorization: Bearer $token" `
  -F "file=@test-tone.wav;type=audio/wav" `
  "http://127.0.0.1:8000/api/tracks/upload" | ConvertFrom-Json

$deleteTrackId = $deleteUpload.id

Invoke-RestMethod `
  -Method Delete `
  -Uri "http://127.0.0.1:8000/api/tracks/$deleteTrackId" `
  -Headers $headers
```

Expected result:

- The delete request returns `204 No Content`.
- `GET /api/tracks/$deleteTrackId` for the same user returns `404 Not Found`.
- Related track tags, playback events, feedback events, and processing jobs for
  the deleted track are removed.
- Stored media files referenced by that track are deleted one explicit file at
  a time after path validation; no directory or recursive cleanup is performed.
- If a stored media file cannot be deleted, the endpoint returns an error with
  a clear `detail` message instead of reporting a successful delete.
- A missing token returns `401 Unauthorized`.
- A track owned by another user returns `404 Not Found`.

## Sync Playback Events

Phase 4 adds one minimal authenticated endpoint for Android offline playback
event retry:

```powershell
$eventId = [guid]::NewGuid().ToString()

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $eventId
        track_id = $trackId
        event_type = "play"
        position_seconds = 0
        duration_seconds = 1
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Expected result:

- The response includes `accepted` and `failed` arrays.
- A valid event for a track owned by the authenticated user is returned with
  `status: accepted`.
- Retrying the same `client_event_id` is safe and returns `status: duplicate`.
- A missing token returns `401 Unauthorized`.
- A `track_id` not owned by the authenticated user is reported in `failed`
  without inserting that event.

Retry the same request to verify Android-safe idempotency:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $eventId
        track_id = $trackId
        event_type = "play"
        position_seconds = 0
        duration_seconds = 1
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Expected retry result:

- The response includes the same `client_event_id` in `accepted`.
- The event status is `duplicate`.
- No duplicate playback-event row is inserted.

Verify mixed accepted and failed events with a known invalid or unowned track
id:

```powershell
$mixedEventId = [guid]::NewGuid().ToString()
$invalidEventId = [guid]::NewGuid().ToString()

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/playback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $mixedEventId
        track_id = $trackId
        event_type = "pause"
        position_seconds = 0.5
        duration_seconds = 1
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      },
      @{
        client_event_id = $invalidEventId
        track_id = 999999999
        event_type = "play"
        position_seconds = 0
        duration_seconds = 1
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Expected mixed result:

- The owned-track event is returned in `accepted`.
- The invalid or unowned track event is returned in `failed`.
- The failed event does not block insertion of the valid event.

## Record Recommendation Feedback Events

Phase 5 Task 5.1 adds one minimal authenticated endpoint for Recommendation V1
feedback events:

```powershell
$feedbackEventId = [guid]::NewGuid().ToString()

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/feedback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $feedbackEventId
        track_id = $trackId
        feedback_type = "not_today"
        scenario_tag_ids = @()
        state_tag_ids = @()
        type_tag_ids = @()
        attribute_tag_ids = @()
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Supported `feedback_type` values are `like`, `tired`, `not_today`,
`not_suitable_for_context`, and `skip_recommendation`. Context tag arrays are
optional, but when present the tags must belong to the authenticated user and
match their structured groups: `scenario`, `state`, `type`, and `attribute`.

Expected result:

- The response includes `accepted` and `failed` arrays.
- A valid event for a track owned by the authenticated user is returned with
  `status: accepted`.
- Retrying the same `client_event_id` is safe and returns `status: duplicate`.
- A missing token returns `401 Unauthorized`.
- A `track_id` or context tag not owned by the authenticated user is reported in
  `failed` without inserting that event.
- `feedback_type: "like"` sets the track's `liked` field to `true`.
- `feedback_type: "tired"` sets a default 14-day `cooldown_until` from
  `occurred_at`.

Retry the same request to verify idempotency:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/feedback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $feedbackEventId
        track_id = $trackId
        feedback_type = "not_today"
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "android"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Expected retry result:

- The response includes the same `client_event_id` in `accepted`.
- The event status is `duplicate`.
- No duplicate feedback-event row is inserted.

## Request Structured Recommendations

Phase 5 Task 5.3 adds one minimal authenticated endpoint for Recommendation V1
structured requests:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/recommendations" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    scenario_tag_ids = @($scenarioTagId)
    state_tag_ids = @($stateTagId)
    type_tag_ids = @($typeTagId)
    attribute_tag_ids = @($attributeTagId)
    exclude_attribute_tag_ids = @()
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

All tag arrays are optional. When tag ids are provided, they must belong to the
authenticated user and match their expected groups: `scenario`, `state`, `type`,
`attribute`, and excluded `attribute`. The request does not accept or parse a raw
natural-language prompt.

Expected result:

- The response includes `request_id` and `results`.
- `results` is ordered by the rule-based ranking service.
- Each result includes `rank`, `score`, deterministic `reason`, and a `track`
  payload compatible with `GET /api/tracks`.
- When there are no ready recommendation candidates, `results` is an empty
  array and the response is still `200 OK`.
- A missing token returns `401 Unauthorized`.
- An unowned tag id or tag id in the wrong group returns `400 Bad Request`.

## Phase 5 Structured Recommendation Closure

Before accepting Phase 5, verify the feedback and recommendation endpoints with
one local user and at least three `ready` tracks that have structured tags.
Create or reuse tags in each supported group:

- `scenario`
- `state`
- `type`
- `attribute`

Assign the tags to at least three ready tracks, then run the feedback and
recommendation requests above with real local ids:

```powershell
$recommendation = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/recommendations" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    scenario_tag_ids = @($scenarioTagId)
    state_tag_ids = @($stateTagId)
    type_tag_ids = @($typeTagId)
    attribute_tag_ids = @($attributeTagId)
    exclude_attribute_tag_ids = @()
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)

$recommendation.results | Format-Table rank, score, reason
```

Send feedback for one returned result using the same structured context:

```powershell
$feedbackEventId = [guid]::NewGuid().ToString()
$recommendedTrackId = $recommendation.results[0].track.id

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/feedback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    events = @(
      @{
        client_event_id = $feedbackEventId
        track_id = $recommendedTrackId
        feedback_type = "not_suitable_for_context"
        scenario_tag_ids = @($scenarioTagId)
        state_tag_ids = @($stateTagId)
        type_tag_ids = @($typeTagId)
        attribute_tag_ids = @($attributeTagId)
        occurred_at = (Get-Date).ToUniversalTime().ToString("o")
        client = "web"
      }
    )
  } | ConvertTo-Json -Depth 4)
```

Request recommendations again with the same structured context:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/recommendations" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    scenario_tag_ids = @($scenarioTagId)
    state_tag_ids = @($stateTagId)
    type_tag_ids = @($typeTagId)
    attribute_tag_ids = @($attributeTagId)
    exclude_attribute_tag_ids = @()
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

Expected closure result:

- The first request returns up to three ordered recommendation results.
- Results include deterministic rule-based reasons, not AI-generated text.
- Feedback for the recommended track is accepted.
- A repeated recommendation request can reflect feedback penalties such as
  `not_today`, `not_suitable_for_context`, `skip_recommendation`, or `tired`.
- No natural-language prompt, AI Assistant endpoint, social feature, or
  production ML service is involved.

## Phase 6 AI Listening Intent Parsing

Phase 6 Task 6.3 adds one authenticated AI endpoint for natural-language
listening-intent parsing. The endpoint maps free-text requests onto the existing
Phase 5 structured recommendation shape using only the authenticated user's tags.

The AI provider must be enabled and configured (see `docs/DEVELOPMENT.md` AI
Provider Configuration section). When the provider is disabled or unconfigured
the endpoint returns a documented fallback empty structured request.

### AI Parse Listening Intent Smoke Test

```powershell
# Reuse the login flow and header setup from the Login section above.
# Ensure at least one tag exists in each group (scenario, state, type, attribute)
# for the authenticated user.

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/parse-listening-intent" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "I want calm focus instrumental piano music for working"
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

Expected result with a working provider:

- `provider_status` is `ok`.
- `structured_request` contains Phase 5-compatible `scenario_tag_ids`,
  `state_tag_ids`, `type_tag_ids`, `attribute_tag_ids`,
  `exclude_attribute_tag_ids`, `limit` (default 3), and `client`.
- `matched_tags` is a dict keyed by tag group (`scenario`, `state`, `type`,
  `attribute`), each value a list of `{id, name, group}` objects.
- `unmatched_terms` lists any words the AI could not map.
- `explanation` provides a short human-readable mapping summary when available.

Expected result with provider disabled or unconfigured (AI_ENABLED=false or
missing key/model):

- `provider_status` is `disabled` or `unconfigured`.
- `structured_request` returns empty tag arrays.
- `matched_tags` is an empty object.
- HTTP status is `200 OK` (fallback is the default).

Verify missing auth:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/parse-listening-intent" `
  -ContentType "application/json" `
  -Body '{"text": "any request"}'
```

Expected: `401 Unauthorized`.

### AI Parse Listening Intent Tag Validation

The endpoint re-validates every tag id the AI returns using the same Phase 5
ownership and group checks as `POST /api/recommendations`. Tags belonging to
another user, tags in the wrong group, or invented tag ids all cause the
endpoint to return a provider-status of `error` (still `200 OK` when
`fallback_to_empty` is `true`).

Set `fallback_to_empty = false` to receive a `503 Service Unavailable` response
when the provider is not available or the parse fails:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/parse-listening-intent" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "any request"
    fallback_to_empty = $false
  } | ConvertTo-Json -Depth 4)
```

### Notes

- The endpoint never creates, renames, deletes, or binds tags.
- The endpoint does not call `recommend_tracks` — it only parses intent.
- The endpoint does not return track ids or track payloads.
- The LLM is instructed never to invent tag ids and to use only tags from the
  catalogue supplied in the prompt.

## Phase 6 AI Recommendation Composition

Phase 6 Task 6.4 adds one authenticated AI endpoint that combines natural-language
intent parsing with the existing Phase 5 rule-based ranking. The LLM parses
natural language into structured tag ids; track selection and scoring are always
delegated to `POST /api/recommendations`.

### AI Recommend Smoke Test

```powershell
# Prerequisites: logged-in user, at least three ready tracks tagged with
# structured tags (scenario, state, type, attribute), and a working AI provider.

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/recommend" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "I want calm focus instrumental piano music for working"
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

Expected result with a working provider and matching tracks:

- `parsed_intent.provider_status` is `ok`.
- `parsed_intent.structured_request` contains the Phase 5-compatible tag id
  arrays that were parsed from the natural-language text.
- `parsed_intent.matched_tags` maps each tag group to its matched items.
- `parsed_intent.explanation` may provide an AI helper explanation (optional).
- `request_id` is a UUID string.
- `results` is ordered by the Phase 5 rule-based ranking service.
- Each result includes `rank`, `score`, deterministic Phase 5 `reason` text,
  and a `track` payload compatible with `GET /api/tracks`.
- Phase 5 reason text is **not** replaced by any AI explanation — the AI
  explanation lives in `parsed_intent.explanation`.

Expected result with provider disabled or unconfigured:

- `parsed_intent.provider_status` is `disabled` or `unconfigured`.
- `results` is an empty array.
- HTTP status is `200 OK` (fallback is the default).

### AI Recommend Ranking Integrity

The AI endpoint must never bypass Phase 5 ranking constraints. Verify:

1. A track with `cooldown_until` in the future must not appear in results
   (cooldown exclusion from `recommend_tracks`).
2. A track with a `not_today` feedback event for today must not appear in
   results.
3. A liked track that also matches tags should rank above an unliked but
   tag-matching track.

Send `like` or `not_today` feedback via `POST /api/feedback-events` before
calling the AI recommend endpoint to confirm the ranking adjusts accordingly.

```powershell
# First, send not_today for a track that would otherwise match
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/feedback-events" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body ((@{
    events = @(@{
      client_event_id = [guid]::NewGuid().ToString()
      track_id = $trackToExclude
      feedback_type = "not_today"
      occurred_at = (Get-Date).ToUniversalTime().ToString("o")
      client = "web"
    })
  }) | ConvertTo-Json -Depth 6)

# Then request AI recommendations — the not_today track must not appear
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/recommend" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "focus music"
    limit = 3
  } | ConvertTo-Json -Depth 4)
```

### Notes

- The LLM only parses intent into tag ids — it never selects or returns track
  ids.
- All ranking, cooldown, recent playback, and feedback penalties are handled by
  the existing Phase 5 `recommend_tracks` service.
- The endpoint does not modify Android playback or cache behavior.

## Phase 6 Track Tag Suggestion

Phase 6 Task 6.5 adds one authenticated AI endpoint that suggests tags for a
single track using its metadata and the current user's tag taxonomy. The endpoint
never creates or assigns tags — callers must apply suggestions explicitly.

### AI Tag Suggestion Smoke Test

```powershell
# Prerequisites: logged-in user, at least one track, and a working AI provider.

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/tracks/$trackId/suggest-tags" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{}'
```

Expected result with a working provider:

- `track_id` matches the requested track.
- `provider_status` is `ok`.
- `existing_tag_suggestions` is a dict keyed by tag group (`scenario`,
  `state`, `type`, `attribute`), each value a list of objects with `tag_id`,
  `name`, `group`, `confidence`, and `reason`.
- `new_tag_suggestions` is an empty list when not requested.
- `explanation` provides a short human-readable summary when available.

Request new tag name suggestions:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/tracks/$trackId/suggest-tags" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"include_new_tag_suggestions": true}'
```

Expected result with `include_new_tag_suggestions: true`:

- `new_tag_suggestions` may contain suggested tag names, each with `name`,
  `group`, `confidence`, and `reason`.
- New tag suggestions are returned as suggestions only — no tags are created
  in the database and no tags are assigned to the track.

Expected result with provider disabled or unconfigured:

- `provider_status` is `disabled` or `unconfigured`.
- `existing_tag_suggestions` is an empty object.
- `new_tag_suggestions` is an empty list.
- HTTP status is `200 OK`.

Verify missing auth and unowned track:

```powershell
# Missing auth
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/tracks/1/suggest-tags" `
  -ContentType "application/json" `
  -Body '{}'
# Expected: 401 Unauthorized

# Unowned or nonexistent track returns provider_status: "error"
```

### Notes

- The endpoint never creates, renames, deletes, or binds tags.
- The endpoint never assigns tag suggestions to the track automatically.
- Callers must apply selected suggestions through `PATCH
  /api/tracks/{track_id}` with the chosen `tag_ids`.
- New tag name suggestions must be created explicitly via `POST /api/tags`
  before they can be assigned.
- The prompt includes track metadata (title, artist, album, content_type,
  source_url, original filename basename) and the full user tag catalogue.
- Internal storage paths are not exposed beyond the filename basename.

## Phase 6 AI Assistant V1 Closure

Before accepting Phase 6, verify the AI endpoints with one local user and at
least three `ready` tracks that have structured tags in the `scenario`, `state`,
`type`, and `attribute` groups.

Run the disabled or unconfigured provider check first, without committing any
real provider key:

```powershell
$env:AI_ENABLED = "false"

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/parse-listening-intent" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "calm focus music for writing"
    client = "web"
  } | ConvertTo-Json -Depth 4)
```

Expected disabled/unconfigured result:

- `provider_status` is `disabled` or `unconfigured`.
- `structured_request` contains empty tag arrays.
- No track ids are returned.

Then run the provider-ok flow using development-only local environment values:

```powershell
$aiRecommendation = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/recommend" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    text = "calm focus instrumental music for working"
    limit = 3
    client = "web"
  } | ConvertTo-Json -Depth 4)

$aiRecommendation.parsed_intent.structured_request
$aiRecommendation.results | Format-Table rank, score, reason
```

Expected AI recommendation closure result:

- The parsed intent is expressed as the existing Phase 5 structured
  recommendation request shape.
- Recommendation results are ordered by the Phase 5 rule-based ranking service.
- Cooldown, recent playback, liked state, and feedback penalties are still
  enforced.
- The LLM does not directly select tracks and does not replace Phase 5 reason
  text.

Verify tag suggestions remain advisory only:

```powershell
$beforeTags = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/$trackId" `
  -Headers $headers

$suggestions = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/ai/tracks/$trackId/suggest-tags" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"include_new_tag_suggestions": true}'

$afterTags = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8000/api/tracks/$trackId" `
  -Headers $headers

$beforeTags.tags
$suggestions.existing_tag_suggestions
$suggestions.new_tag_suggestions
$afterTags.tags
```

Expected tag suggestion closure result:

- Existing tag suggestions reference only tags owned by the authenticated user.
- New tag suggestions are names only.
- The track's assigned tags are unchanged until a caller explicitly applies
  selected tags through `PATCH /api/tracks/{track_id}`.
- No tags are created by the suggestion endpoint.

Record the backend, Web, and Android manual verification results in
`docs/ACCEPTANCE/PHASE_6_ACCEPTANCE.md`. Phase 6 is not accepted until the Web AI
Assistant and Android natural-language recommendation flows have both been
manually verified.

## Docker Compose API Flow

Start the Compose API stack from the repository root:

```powershell
docker compose up -d postgres api
```

Check FFmpeg and ffprobe inside Docker:

```powershell
docker compose exec api sh -c "ffmpeg -version && ffprobe -version"
```

Run migrations inside the API container:

```powershell
docker compose exec api alembic upgrade head
```

Alternatively, run migrations from the host against the Compose PostgreSQL port:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Create the initial user from the host as shown above, then use the same login,
upload, and stream commands against `http://127.0.0.1:8000`.

Return to the repository root and process one pending job through Compose:

```powershell
cd ..
docker compose run --rm worker
```

Or run a continuously polling Compose worker:

```powershell
docker compose up -d worker-loop
```

## Full Upload To Stream Closure

1. Start PostgreSQL and API with `docker compose up -d postgres api`.
2. Run `docker compose exec api alembic upgrade head`.
3. Create or reuse the initial user.
4. Generate `test-tone.wav` with FFmpeg.
5. Log in and upload `test-tone.wav` to `POST /api/tracks/upload`.
6. Confirm the upload response has `status: processing`.
7. Run `docker compose run --rm worker`, or keep `worker-loop` running.
8. Fetch `GET /api/tracks/$trackId` until `status` is `ready`.
9. Call `GET /api/tracks/$trackId/stream` with the bearer token.

Expected result:

- Upload creates a pending processing job.
- Worker extracts metadata with ffprobe and writes playback MP3 with FFmpeg.
- Track becomes `ready`.
- Stream endpoint returns `200 OK` for full playback and `206 Partial Content`
  for Range requests.

## Phase 2 Web Browser Smoke Test

This browser flow verifies the completed Phase 2 Web management console against
the Phase 1 backend API. Android, Recommendation, AI Assistant, playback
history, feedback events, offline cache behavior, and production deployment
hardening are outside this smoke test.

From the repository root, start the services required by the Web console:

```powershell
docker compose up -d postgres api
docker compose exec api alembic upgrade head
```

Create or reuse the initial user. If a user already exists, keep using that
account.

From `web/`, start the development server:

```powershell
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open the Vite URL in a browser, usually `http://localhost:5173/`, then verify:

1. Log in with the local initial user.
2. Open `Library` and confirm the track list loads, including empty, processing,
   failed, or ready states depending on local data.
3. Open `Upload`, select an MP3, FLAC, M4A, WAV, or OGG file, and confirm the
   page shows the created track and initial processing status.
4. Run `docker compose run --rm worker` once, or run
   `docker compose up -d worker-loop`, to process pending tracks.
5. Return to `Library` or the uploaded track detail page and confirm the status
   becomes `ready` after refresh or polling.
6. Open the track detail page, edit metadata, save it, refresh, and confirm the
   saved values are still shown.
7. Open `Tags`, create a tag using only `scenario`, `state`, `type`, or
   `attribute`, rename it, change its group, and delete one explicit tag.
8. On the track detail page, assign and remove existing tags, save, refresh, and
   confirm the associations persist.
9. On a ready track, use the browser playback control from the library or detail
   page and confirm audio plays through the authenticated stream endpoint.

Expected Web result:

- Protected pages redirect unauthenticated users to login.
- Refreshing the browser preserves a valid session.
- Upload, processing refresh, metadata edits, tag CRUD, track tag assignment,
  and ready-track playback all work without adding any backend endpoints.
- Non-ready tracks remain visible but cannot be played.

## Automated Regression Check

Run the backend test suite from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Expected result for the current Phase 1 backend suite:

- All tests pass.
- Coverage includes Auth, Tags, Tracks, upload validation, storage path safety,
  FFmpeg wrappers, worker processing behavior, and streaming.
