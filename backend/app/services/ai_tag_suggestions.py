"""Track tag suggestion service.

Suggests existing tags (by id) and optional new tag names for a track using
track metadata and the current user's tag taxonomy.  The LLM is constrained
to select from the supplied tag catalogue — it never creates or assigns tags.
"""

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.track import Track
from app.models.user import User
from app.schemas.ai import (
    AiProviderStatus,
    AiTagSuggestionOutput,
    ExistingTagSuggestion,
    NewTagSuggestion,
    TagSuggestionResponse,
)
from app.services.ai_json import STRUCTURED_JSON_MAX_TOKENS, complete_and_parse_json
from app.services.ai_provider import AiProviderService

# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------

_VALID_GROUPS: frozenset = frozenset({"scene", "type", "feature"})


def suggest_tags_for_track(
    db: Session,
    user: User,
    provider: AiProviderService,
    track_id: int,
    *,
    include_new_tag_suggestions: bool = False,
) -> TagSuggestionResponse:
    """Suggest tags for one track using AI-assisted analysis of metadata.

    Returns a ``TagSuggestionResponse`` with existing-tag suggestions grouped
    by tag group.  When *include_new_tag_suggestions* is ``True`` the AI may
    also return new-tag name ideas, but those are never created automatically.
    """
    # 1. Load track & verify ownership
    track = db.scalar(
        select(Track).where(Track.id == track_id, Track.user_id == user.id),
    )
    if track is None:
        return _empty_fallback(
            track_id,
            AiProviderStatus.ERROR,
            explanation="Track not found for current user.",
        )

    # 2. Load all tags owned by this user
    tags = list(
        db.scalars(
            select(Tag)
            .where(Tag.user_id == user.id, Tag.group.in_(_VALID_GROUPS))
            .order_by(Tag.group, Tag.created_at, Tag.id),
        ),
    )
    tags_by_id: dict[int, Tag] = {tag.id: tag for tag in tags}

    # 3. Build prompt with track metadata and tag catalogue
    user_message = _build_tag_suggestion_prompt(
        track, tags, include_new=include_new_tag_suggestions,
    )

    # 4. Call AI
    ai_output, completion_result, parse_error = complete_and_parse_json(
        provider,
        user_message,
        AiTagSuggestionOutput,
        system_instruction=(
            "You improve a personal music library by suggesting tags for one "
            "track. Return strict JSON only. Use existing tag ids only from "
            "the supplied catalogue; never invent, guess, or hallucinate tag "
            "ids. New tag groups, when allowed, must be exactly scene, type, "
            "or feature. Do not suggest playlists, do not apply tags, do not "
            "use lyrics, and do not claim web-search knowledge unless it is "
            "present in the supplied metadata."
        ),
        max_tokens=STRUCTURED_JSON_MAX_TOKENS,
        temperature=0.2,
    )

    provider_status = completion_result.provider_status

    # 5. Provider unavailable
    if provider_status in (AiProviderStatus.DISABLED, AiProviderStatus.UNCONFIGURED):
        return _empty_fallback(track_id, provider_status)

    if ai_output is None:
        return _empty_fallback(
            track_id,
            AiProviderStatus.ERROR,
            explanation=(
                parse_error
                or completion_result.error_message
                or "AI tag suggestion failed."
            ),
        )

    # 6. Validate existing tag ids returned by AI
    valid_suggestions: list[ExistingTagSuggestion] = []
    seen_tag_ids: set[int] = set()
    for suggestion in _iter_existing_tag_outputs(ai_output):
        tag = tags_by_id.get(suggestion["tag_id"])
        if tag is None:
            # invented / unowned id — skip silently
            continue
        if tag.group not in _VALID_GROUPS or tag.id in seen_tag_ids:
            continue
        seen_tag_ids.add(tag.id)
        valid_suggestions.append(
            ExistingTagSuggestion(
                tag_id=tag.id,
                name=tag.name,
                group=tag.group,
                confidence=suggestion["confidence"],
                reason=suggestion["reason"]
                or f"AI matched '{tag.name}' to this track.",
            ),
        )

    # 7. Group by tag group
    grouped: dict[str, list[ExistingTagSuggestion]] = {}
    for suggestion in valid_suggestions:
        grouped.setdefault(suggestion.group, []).append(suggestion)

    # 8. Validate new tag suggestions
    clean_new: list[NewTagSuggestion] = []
    seen_new: set[tuple[str, str]] = set()
    if include_new_tag_suggestions:
        for suggestion in ai_output.new_tag_suggestions:
            if suggestion.group not in _VALID_GROUPS:
                continue
            name = suggestion.name.strip()
            if not name:
                continue
            key = (suggestion.group, name.casefold())
            if key in seen_new:
                continue
            seen_new.add(key)
            clean_new.append(
                NewTagSuggestion(
                    name=name,
                    group=suggestion.group,
                    confidence=suggestion.confidence,
                    reason=suggestion.reason,
                ),
            )

    return TagSuggestionResponse(
        track_id=track_id,
        existing_tag_suggestions=grouped,
        new_tag_suggestions=clean_new,
        explanation=ai_output.explanation,
        provider_status=AiProviderStatus.OK,
    )


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _build_tag_suggestion_prompt(
    track: Track,
    tags: list[Tag],
    *,
    include_new: bool = False,
) -> str:
    """Build the full user prompt with track metadata and tag catalogue."""
    lines: list[str] = []

    # Track metadata
    lines.append("Track metadata:")
    lines.append(f"  title: {track.title}")
    if track.artist:
        lines.append(f"  artist: {track.artist}")
    if track.album:
        lines.append(f"  album: {track.album}")
    lines.append(f"  content_type: {track.content_type}")
    if track.source_url:
        lines.append(f"  source_url: {track.source_url}")
    if track.original_file_path:
        basename = os.path.basename(track.original_file_path)
        if basename:
            lines.append(f"  original_filename: {basename}")

    # Tag catalogue
    lines.append("")
    if not tags:
        lines.append("Available tags: (none)")
    else:
        lines.append(
            "Available tags — use ONLY these tag ids for existing_tag_ids:"
        )
        for tag in tags:
            lines.append(f"  [{tag.group}] id:{tag.id} {tag.name}")

    # Instruction
    lines.append("")
    lines.append("Taxonomy guide:")
    lines.append(
        "  scene = when or where the owner would listen, such as focus, sleep, "
        "commute, workout, rainy day, late night."
    )
    lines.append(
        "  type = musical or content format, such as instrumental, vocal, OST, "
        "podcast, live, lo-fi, piano."
    )
    lines.append(
        "  feature = sound, mood, energy, texture, era, season, or atmosphere, "
        "such as calm, bright, heavy, warm, nostalgic."
    )
    lines.append("")
    lines.append(
        "Suggest the most appropriate existing tags from the catalogue above. "
        "Prefer precise tags over broad guesses. Return existing tags as "
        "existing_tag_suggestions items with tag_id, confidence, and a short "
        "reason. Use confidence 0.0-1.0 based only on the metadata supplied."
    )

    if include_new:
        lines.append(
            "You may also suggest new tag names in new_tag_suggestions "
            "(name, group, confidence, reason). Suggest new tags only when the "
            "existing catalogue is missing a useful scene/type/feature concept. "
            "Only use groups: scene, type, feature."
        )
    else:
        lines.append("Leave new_tag_suggestions empty.")

    lines.append(
        "Return JSON with keys: existing_tag_suggestions, existing_tag_ids, "
        "new_tag_suggestions, explanation. Keep existing_tag_ids empty unless "
        "you cannot return the richer existing_tag_suggestions shape. Do not "
        "include markdown or prose outside JSON."
    )

    return "\n".join(lines)


def _iter_existing_tag_outputs(
    ai_output: AiTagSuggestionOutput,
) -> list[dict[str, int | float | str]]:
    if ai_output.existing_tag_suggestions:
        return [
            {
                "tag_id": item.tag_id,
                "confidence": item.confidence,
                "reason": item.reason,
            }
            for item in ai_output.existing_tag_suggestions
        ]

    return [
        {
            "tag_id": tag_id,
            "confidence": 0.7,
            "reason": "",
        }
        for tag_id in ai_output.existing_tag_ids
    ]


def _empty_fallback(
    track_id: int,
    status: AiProviderStatus,
    *,
    explanation: str = "",
) -> TagSuggestionResponse:
    return TagSuggestionResponse(
        track_id=track_id,
        existing_tag_suggestions={},
        new_tag_suggestions=[],
        explanation=explanation or None,
        provider_status=status,
    )
