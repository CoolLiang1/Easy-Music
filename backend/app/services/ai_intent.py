"""Natural-language listening intent parsing.

Maps a free-text listening request onto the Phase 5 structured recommendation
shape using only the authenticated user's existing tags.  The LLM is
constrained to select tag ids from a catalogue we supply — it never creates
tags and never selects track ids.
"""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.user import User
from app.schemas.ai import (
    AiIntentOutput,
    AiProviderStatus,
    AiRecommendResponse,
    MatchedTagItem,
    ParsedIntentResponse,
)
from app.schemas.recommendation import RecommendationRequest
from app.services import recommendations as recommendation_service
from app.services.ai_json import complete_and_parse_json
from app.services.ai_provider import AiProviderService

# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------


def parse_listening_intent(
    db: Session,
    user: User,
    provider: AiProviderService,
    text: str,
    *,
    client: str | None = None,
    fallback_to_empty: bool = True,
) -> ParsedIntentResponse:
    """Parse a natural-language listening request into structured tag ids.

    Only the *user*'s existing tags are candidates.  Tag ownership and group
    are re-validated after the AI returns so that invented or cross-user tag
    ids are rejected unconditionally.
    """
    # 1. Load all tags owned by this user
    tags = list(
        db.scalars(
            select(Tag)
            .where(Tag.user_id == user.id)
            .order_by(Tag.group, Tag.created_at, Tag.id),
        ),
    )
    tags_by_id: dict[int, Tag] = {tag.id: tag for tag in tags}

    # 2. Build a user prompt that includes the tag catalogue
    user_message = _build_intent_user_message(text, tags)

    # 3. Ask the AI (via the injected provider abstraction)
    ai_output, completion_result, parse_error = complete_and_parse_json(
        provider,
        user_message,
        AiIntentOutput,
        system_instruction=(
            "Only use tag ids from the catalogue in the user message. "
            "Never invent, guess, or hallucinate tag ids."
        ),
        max_tokens=512,
        temperature=0.1,
    )

    provider_status = completion_result.provider_status

    # 4. Provider-unavailable path
    if provider_status in (AiProviderStatus.DISABLED, AiProviderStatus.UNCONFIGURED):
        return _empty_fallback(provider_status)

    # 5. Provider or parsing failure
    if ai_output is None:
        if fallback_to_empty:
            return _empty_fallback(
                AiProviderStatus.ERROR,
                explanation=parse_error or str(completion_result.error_message or ""),
            )
        return _empty_fallback(
            AiProviderStatus.ERROR,
            explanation=parse_error or "AI parsing failed.",
        )

    # 6. Build a RecommendationRequest for tag validation (reuses Phase 5 logic)
    structured_req = RecommendationRequest(
        scenario_tag_ids=ai_output.scenario_tag_ids,
        state_tag_ids=ai_output.state_tag_ids,
        type_tag_ids=ai_output.type_tag_ids,
        attribute_tag_ids=ai_output.attribute_tag_ids,
        exclude_attribute_tag_ids=ai_output.exclude_attribute_tag_ids,
        limit=3,
        client=client,
    )

    tag_error = recommendation_service.validate_recommendation_request_tags(
        db, user, structured_req,
    )
    if tag_error is not None:
        # AI returned an invented / unowned / wrong-group tag id
        if fallback_to_empty:
            return _empty_fallback(
                AiProviderStatus.ERROR,
                explanation=f"AI returned invalid tag: {tag_error}",
            )
        return _empty_fallback(
            AiProviderStatus.ERROR,
            explanation=f"Tag validation failed: {tag_error}",
        )

    # 7. Build matched_tags payload grouped by tag group
    matched_tags = _build_matched_tags(structured_req, tags_by_id)

    return ParsedIntentResponse(
        structured_request=structured_req,
        matched_tags=matched_tags,
        unmatched_terms=ai_output.unmatched_terms,
        explanation=ai_output.explanation,
        provider_status=AiProviderStatus.OK,
    )


def recommend_via_ai(
    db: Session,
    user: User,
    provider: AiProviderService,
    text: str,
    *,
    limit: int = 3,
    client: str | None = None,
    fallback_to_empty: bool = True,
) -> AiRecommendResponse:
    """Parse natural-language intent, then delegate ranking to Phase 5.

    The LLM *only* parses intent into structured tag ids.  Track selection,
    scoring, cooldown enforcement, and feedback penalties are all handled by
    ``recommendation_service.recommend_tracks`` — the LLM never sees track ids
    and cannot bypass ranking constraints.
    """
    # 1. Parse intent (same flow as parse_listening_intent)
    parsed = parse_listening_intent(
        db,
        user,
        provider,
        text,
        client=client,
        fallback_to_empty=fallback_to_empty,
    )

    # 2. Provider unavailable — return empty response preserving parsed status
    if parsed.provider_status != AiProviderStatus.OK:
        return AiRecommendResponse(
            parsed_intent=parsed,
            request_id=str(uuid4()),
            results=[],
        )

    # 3. Override the limit on the structured request (AI doesn't control it)
    structured_req = parsed.structured_request
    structured_req.limit = min(limit, 3)

    # 4. Delegate to Phase 5 rule-based ranking — LLM never selects tracks
    results = recommendation_service.recommend_tracks(db, user, structured_req)

    return AiRecommendResponse(
        parsed_intent=parsed,
        request_id=str(uuid4()),
        results=results,
    )


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

_TAG_GROUP_LABELS: dict[str, str] = {
    "scenario": "scenario",
    "state": "state",
    "type": "type",
    "attribute": "attribute",
}


def _build_intent_user_message(text: str, tags: list[Tag]) -> str:
    """Build a user message that includes the full tag catalogue."""

    if not tags:
        lines = ["(No tags exist yet — return empty arrays.)"]
    else:
        lines = ["Available tags (use ONLY these tag ids — never invent new ones):"]
        for tag in tags:
            group_label = _TAG_GROUP_LABELS.get(tag.group, tag.group)
            lines.append(f"[{group_label}] id:{tag.id} {tag.name}")

    lines.append("")
    lines.append(f'Listening intent: "{text}"')
    lines.append("")
    lines.append(
        "Map the listening intent to the most appropriate tag ids from "
        "the catalogue above.  Only use ids that appear in the catalogue."
    )

    return "\n".join(lines)


def _build_matched_tags(
    request: RecommendationRequest,
    tags_by_id: dict[int, Tag],
) -> dict[str, list[MatchedTagItem]]:
    """Build a dict of tag group → matched tag items for the response."""
    result: dict[str, list[MatchedTagItem]] = {}
    field_groups: list[tuple[str, str]] = [
        ("scenario_tag_ids", "scenario"),
        ("state_tag_ids", "state"),
        ("type_tag_ids", "type"),
        ("attribute_tag_ids", "attribute"),
    ]
    for field_name, group in field_groups:
        tag_ids = _unique_ids(getattr(request, field_name))
        items = [
            MatchedTagItem(id=tag_id, name=tags_by_id[tag_id].name, group=group)
            for tag_id in tag_ids
            if tag_id in tags_by_id
        ]
        if items:
            result[group] = items
    return result


def _empty_fallback(
    status: AiProviderStatus,
    *,
    explanation: str = "",
) -> ParsedIntentResponse:
    return ParsedIntentResponse(
        structured_request=RecommendationRequest(),
        matched_tags={},
        unmatched_terms=[],
        explanation=explanation or None,
        provider_status=status,
    )


def _unique_ids(tag_ids: list[int] | None) -> list[int]:
    if not tag_ids:
        return []
    return list(dict.fromkeys(tag_ids))
