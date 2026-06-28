# V2.4 Tag Taxonomy Simplification Acceptance

Date: 2026-06-28

## Accepted Scope

- Backend tag categories are now limited to `scene`, `type`, and `feature`.
- The migration maps old `scenario` tags to `scene`, old `state` tags to
  `feature`, keeps `type`, and deletes old `attribute` tags plus their
  `track_tags` links.
- Recommendation and feedback context payloads use only `scene_tag_ids`,
  `type_tag_ids`, and `feature_tag_ids`.
- AI listening intent parsing and AI tag suggestions only ask for and validate
  `scene`, `type`, and `feature`.
- Web and Android user-facing tag groups are 场景 / 类型 / 特点.
- Recommendation behavior remains rule-based and adapted to the simplified tag
  categories.

## Verification Checklist

- [x] Backend tests pass:
  `backend/.venv/Scripts/python.exe -m pytest`
  (`334 passed, 2 skipped`).
- [x] Web typecheck/build pass:
  `web/npm run typecheck` and `web/npm run build`.
- [x] Android tests/build pass:
  `android/gradlew.bat test` and `android/gradlew.bat build`.
- [x] Backend rejects `attribute` as a tag group or request context field.
- [x] Web no longer renders state/attribute recommendation controls.
- [x] Android recommendation UI no longer renders state/attribute controls.
- [x] AI prompts and response models are constrained to the three supported
  groups.

## Notes

Historical Phase 5 and Phase 6 acceptance records mention the old
`scenario`/`state`/`type`/`attribute` taxonomy because they record earlier
milestone behavior. This V2.4 record supersedes those category names for
current development and testing.
