# API Manual Testing

Hand-run smoke flows against a local API at `http://127.0.0.1:8000`, in
PowerShell. Start the stack as in [DEVELOPMENT.md](DEVELOPMENT.md). Request and
response schemas for every endpoint are in the OpenAPI UI at
`http://127.0.0.1:8000/docs`; this file shows only the flows worth repeating.

## Session

```powershell
$api = "http://127.0.0.1:8000"
$login = Invoke-RestMethod -Method Post -Uri "$api/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"replace-with-a-local-password"}'
$token = $login.access_token
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "$api/api/auth/me" -Headers $headers
```

Refresh rotates the refresh token; keep the new pair:

```powershell
$login = Invoke-RestMethod -Method Post -Uri "$api/api/auth/refresh" `
  -ContentType "application/json" `
  -Body (@{ refresh_token = $login.refresh_token } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }
```

Expected: a new access token and a different refresh token. The previous
refresh token still works for 60 seconds, then returns `401`.

Logout revokes the refresh token and needs no access token. Run it last:

```powershell
Invoke-RestMethod -Method Post -Uri "$api/api/auth/logout" `
  -ContentType "application/json" `
  -Body (@{ refresh_token = $login.refresh_token } | ConvertTo-Json)
```

## Upload To Stream

The core path: upload, worker processing, authenticated streaming.

```powershell
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" test-tone.wav
$upload = curl.exe -s -X POST -H "Authorization: Bearer $($login.access_token)" `
  -F "file=@test-tone.wav;type=audio/wav" "$api/api/tracks/upload" | ConvertFrom-Json
$trackId = $upload.id
$upload.status          # processing
```

Run the worker (`docker compose run --rm worker`, or keep `worker-loop`
running), then:

```powershell
(Invoke-RestMethod -Uri "$api/api/tracks/$trackId" -Headers $headers).status   # ready

curl.exe -i -H "Authorization: Bearer $($login.access_token)" -H "Range: bytes=0-99" `
  "$api/api/tracks/$trackId/stream"

$stream = Invoke-RestMethod -Method Post -Uri "$api/api/tracks/$trackId/stream-url" -Headers $headers
curl.exe -i -H "Range: bytes=0-99" "$api$($stream.stream_url)"
```

Expected:

- The worker extracts metadata, measures loudness, writes the playback MP3,
  and marks the track `ready`; a failure sets `failed` with a message.
- Both stream requests return `206 Partial Content` with
  `Accept-Ranges: bytes`; without a `Range` header they return `200`.
- The `stream-url` link works without an `Authorization` header until it
  expires (two minutes). A bad token returns `401`.

Video upload follows the same path through `POST /api/tracks/upload-video`;
the worker first extracts the audio.

## Events And Feedback

Clients send batches with a client-generated id, so retries are safe:

```powershell
$event = @{
  client_event_id = [guid]::NewGuid().ToString()
  track_id = $trackId
  event_type = "play"
  position_seconds = 0
  duration_seconds = 1
  occurred_at = (Get-Date).ToUniversalTime().ToString("o")
  client = "android"
}
$body = @{ events = @($event) } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri "$api/api/playback-events" -Headers $headers `
  -ContentType "application/json" -Body $body
Invoke-RestMethod -Method Post -Uri "$api/api/playback-events" -Headers $headers `
  -ContentType "application/json" -Body $body
```

Expected: the first call reports the event `accepted`, the repeat reports it
`duplicate`. `POST /api/feedback-events` works the same way with
`feedback_type` (`like`, `dislike`, `tired`, `not_today`,
`not_suitable_for_context`, `skip_recommendation`) and optional
`scene_tag_ids`, `type_tag_ids`, `feature_tag_ids` context. `like` sets the
track's liked flag; `tired` sets a 14-day cooldown.

## Recommendations

Needs a few ready tracks tagged in the `scene`, `type`, and `feature` groups.

```powershell
Invoke-RestMethod -Method Post -Uri "$api/api/recommendations" -Headers $headers `
  -ContentType "application/json" -Body (@{
    scene_tag_ids = @($sceneTagId)
    feature_tag_ids = @($featureTagId)
    cooldown_mode = "soft"
  } | ConvertTo-Json)
```

Expected: up to three results, each with `rank`, `score`, `reason`, and a
structured explanation. A track with same-day `not_today` feedback never
appears; `strict` cooldown excludes cooled-down tracks, `soft` only lowers
them, and `off` ignores cooldown. `GET /api/recommendations/revived` lists
long-unplayed tracks.

## AI

```powershell
Invoke-RestMethod -Method Post -Uri "$api/api/ai/recommend" -Headers $headers `
  -ContentType "application/json" `
  -Body '{"text":"calm instrumental music for working"}'
```

Expected with a configured provider: `provider_status` is `ok`, the parsed tag
ids belong to the owner's catalogue, and the results obey the same rules as
`/api/recommendations` (a `not_today` track still never appears). With AI off
or unconfigured: HTTP `200`, `provider_status` `disabled` or `unconfigured`,
and empty parsed tags.

`POST /api/ai/parse-listening-intent` returns only the parsed request.
`POST /api/ai/tracks/{track_id}/suggest-tags` returns suggestions and never
assigns tags.

On-demand auto-tagging, as used by the Web Library "AI 打标签" button:

```powershell
(Invoke-RestMethod -Uri "$api/api/ai/auto-tag/status" -Headers $headers).pending_count
Invoke-RestMethod -Method Post -Uri "$api/api/ai/auto-tag/next-batch" -Headers $headers
```

Expected: `pending_count` counts only ready tracks whose `ai_tags_version` is
missing or outdated. Each `next-batch` call tags up to 5 of them and returns
`tagged_count`, `applied_tag_count`, and `remaining_count`; repeat until
`remaining_count` is `0`. Applied tags come only from the owner's catalogue,
are stored with `source="ai"`, and never replace owner tags. With AI disabled,
unconfigured, or failing, the call returns `200` with that `provider_status`
(and `error` on failure) and changes nothing. To preview without writing, run
`python -m app.worker.autotag --dry-run --limit 5` from `backend/`.

Reviewed title and artist clean-up, as used by the Web page 标题与艺人:

```powershell
$status = Invoke-RestMethod -Uri "$api/api/ai/metadata-cleanup/status" -Headers $headers
$status.pending_count; $status.pending_tracks | Select-Object -First 5
$batch = Invoke-RestMethod -Method Post -Uri "$api/api/ai/metadata-cleanup/next-batch" `
  -Headers $headers -ContentType "application/json" -Body '{"after_id": null}'
$batch.suggestions | Format-Table track_id, current_title, suggested_title, suggested_artist, artist_confidence
```

Expected: `status` lists pending tracks oldest first in `pending_tracks`
(capped at 2000), with the total in `pending_count`. `next-batch` looks at up
to 5 pending tracks after `after_id` and
saves nothing. Pass `next_after_id` to continue. To save, send the accepted
values and every reviewed id:

```powershell
$body = @{
  changes = @(@{ track_id = $batch.suggestions[0].track_id; title = $batch.suggestions[0].suggested_title })
  reviewed_track_ids = $batch.reviewed_track_ids
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri "$api/api/ai/metadata-cleanup/apply" -Headers $headers `
  -ContentType "application/json" -Body $body
```

Expected: `updated_count` counts tracks whose title or artist changed and
`reviewed_count` counts the owner's reviewed tracks; they leave
`pending_count`. Other users' track ids are ignored. With AI disabled,
unconfigured, or failing, `next-batch` returns `200` with that
`provider_status` and no suggestions.

## Online Cover Search

Needs `COVER_SEARCH_ENABLED=true` and network access to `itunes.apple.com`.

```powershell
$status = Invoke-RestMethod -Uri "$api/api/covers/search/status" -Headers $headers
$status.enabled; $status.pending_count; $status.skipped_without_artist
$batch = Invoke-RestMethod -Method Post -Uri "$api/api/covers/search/next-batch" `
  -Headers $headers -ContentType "application/json" -Body '{"after_id": null}'
$batch.candidates | Format-Table track_id, confidence, selected, track_name, artist_name
```

Expected: `status` lists ready tracks that have an artist and no cover.
`next-batch` searches up to 3 of them (a few seconds per track because of the
iTunes rate limit) and saves nothing. To save, send the accepted candidates and
every reviewed id:

```powershell
$body = @{
  choices = @($batch.candidates | Where-Object selected | ForEach-Object { @{ track_id = $_.track_id; artwork_url = $_.artwork_url } })
  reviewed_track_ids = $batch.reviewed_track_ids
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri "$api/api/covers/search/apply" -Headers $headers `
  -ContentType "application/json" -Body $body
```

Expected: `updated_count` covers are downloaded and served by
`GET /api/tracks/{id}/cover`. A URL outside `https://*.mzstatic.com` or a
non-image download counts in `failed_count` and the track stays pending. With
the flag off, `status.enabled` is `false` and `next-batch` returns
`status: "disabled"`.

## Imports

Needs `IMPORT_ALLOWED_ROOTS` set (see [DEVELOPMENT.md](DEVELOPMENT.md#optional-features)).

```powershell
$config = Invoke-RestMethod -Uri "$api/api/imports/configuration" -Headers $headers
$rootId = $config.roots[0].id
$scan = Invoke-RestMethod -Method Post -Uri "$api/api/imports/scan" -Headers $headers `
  -ContentType "application/json" -Body (@{ root_id = $rootId } | ConvertTo-Json)
```

Expected: the scan lists supported files by relative path and changes nothing
on disk. Confirm a selection with `POST /api/imports` and a body of
`{ "root_id": ..., "files": [{ "relative_path": ... }] }`; the files are copied
into managed storage, sources stay untouched, and each new track is processed
by the worker. A path outside the root is rejected.
