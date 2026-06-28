# V2.4 Tag Taxonomy Simplification Tasks

Date: 2026-06-28

## Goal

Simplify Easy Music tag categories to three user-facing groups:

- `scene`: listening scenarios such as coding, commute, study, work, relaxing.
- `type`: music or content type such as white noise, ambient, instrumental,
  Japanese, anime songs, electronic.
- `feature`: musical quality, mood, energy, season, or atmosphere such as
  healing, focused, calm, airy, refreshing, spring, summer, happy, nostalgic.

## Migration Rules

- Old `scenario` tags migrate to `scene`.
- Old `type` tags remain `type`.
- Old `state` tags migrate to `feature`.
- Old `attribute` tags are removed, and only their `track_tags` links are
  removed with them.
- No new top-level tag category is introduced.

## Implementation Scope

- [x] Backend tag schema validation accepts only `scene`, `type`, and
  `feature`.
- [x] Alembic migration maps old categories and deletes old `attribute` tags
  plus their track-tag links.
- [x] Recommendation request, feedback context, and scoring use only
  `scene_tag_ids`, `type_tag_ids`, and `feature_tag_ids`.
- [x] AI intent parsing and tag suggestions prompt, parse, and validate only
  the three supported groups.
- [x] Web tag management, track detail, upload/AI suggestions, recommendation,
  and AI assistant surfaces show only 场景 / 类型 / 特点.
- [x] Android recommendation models, Track Detail/tag display inputs, and
  recommendation UI use only 场景 / 类型 / 特点.
- [x] Backend, Web, and Android tests were updated for the new contract.
- [x] Current architecture, development, API manual testing, roadmap, and
  acceptance documentation were updated.

## Out Of Scope

- Recommendation algorithm rewrite.
- New tag categories.
- Playback queue, playlist behavior, upload flow, track deletion, or unrelated
  media processing changes.
- Any cleanup beyond old `attribute` tags and their `track_tags` links.

