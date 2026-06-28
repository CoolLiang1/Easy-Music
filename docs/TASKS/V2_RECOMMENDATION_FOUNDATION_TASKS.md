# V2 Recommendation Foundation Tasks

This slice updates the accepted Recommendation V1 rule engine without adding
embeddings, ML ranking, networked AI, automatic playlist generation, or tag
taxonomy migration.

## Scope

In scope:

- Keep `POST /api/recommendations` compatible with existing clients.
- Add optional `cooldown_mode`: `off`, `soft`, and `strict`.
- Make `soft` the default so active cooldown is a scoring penalty rather than
  a hard exclusion.
- Keep same-day `not_today` as a hard exclusion.
- Keep recent playback as a soft penalty.
- Keep `like` as a boost and add `dislike` as a strong feedback penalty.
- Use current-user playlist membership as a recommendation boost.
- Use current-user playlist name/description relevance to requested tags or
  optional `raw_text` as an extra boost.
- Return deterministic reason/explanation parts for tag matches, playlist
  boosts, liked/dislike feedback, recent playback, cooldown penalties, and
  hard exclusions.

Out of scope:

- Embeddings, vector search, ML ranking, audio analysis, or training systems.
- Networked AI or AI-selected tracks.
- Smart playlists, generated playlists, sharing, or collaboration.
- Tag taxonomy migration.
- Broad Web or Android UI redesign.

## Implementation Notes

- `cooldown_mode="soft"` is the default for old clients.
- `cooldown_mode="strict"` preserves the old active-cooldown hard exclusion
  behavior and reports it in `exclusions_considered`.
- `cooldown_mode="off"` ignores `tracks.cooldown_until`.
- `raw_text` is a scoring hint only. The structured recommendation endpoint
  does not parse it as natural language.
- Playlist scoring must stay owner-scoped. Another user's playlist must never
  affect the current user's recommendations.
- Playlist descriptions are optional and are stored on `playlists.description`.

## Acceptance Criteria

- Recently played tracks are not hard-excluded by default.
- Active cooldown tracks are not hard-excluded by default.
- Strict cooldown mode hard-excludes active cooldown tracks.
- Off cooldown mode ignores active cooldown.
- Same-day `not_today` hard-excludes the track.
- Liked tracks receive a modest boost.
- Disliked tracks receive a strong penalty.
- Playlist membership boosts the current user's tracks.
- Playlist name/description relevance boosts matching playlist tracks.
- Recommendation reasons and structured explanations name the major scoring
  sources.
- Backend tests cover cooldown `off`/`soft`/`strict`, playlist boosts,
  liked/dislike/not_today, and ownership isolation.
- Web and Android recommendation models remain compatible.
- Roadmap, architecture, development, API smoke, and acceptance docs are
  updated.
