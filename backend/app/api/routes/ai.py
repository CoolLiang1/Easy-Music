"""Phase 6 AI Assistant V1 endpoints.

All endpoints are authenticated.  The LLM is only used for intent parsing,
tag suggestions, and short helper explanations — it never selects track ids
and never bypasses Phase 5 cooldown / recent-playback / feedback penalties.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai import (
    AiRecommendRequest,
    AiRecommendResponse,
    ParsedIntentResponse,
    ParseListeningIntentRequest,
    TagSuggestionRequest,
    TagSuggestionResponse,
)
from app.services import ai_intent, ai_tag_suggestions
from app.services.ai_provider import AiProviderService

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_ai_provider() -> AiProviderService:
    """Minimal dependency that constructs the AI provider service.

    When no real HTTP client is injected the provider returns a
    ``not_implemented`` error result — downstream services handle that
    gracefully.
    """
    return AiProviderService(get_settings())


@router.post(
    "/parse-listening-intent",
    response_model=ParsedIntentResponse,
)
def parse_listening_intent(
    payload: ParseListeningIntentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> ParsedIntentResponse:
    """Parse natural-language listening intent into structured Phase 5 tag ids.

    Only the authenticated user's existing tags are candidates.  The endpoint
    never creates, renames, deletes, or binds tags.
    """
    response = ai_intent.parse_listening_intent(
        db,
        current_user,
        ai_provider,
        payload.text,
        client=payload.client,
        fallback_to_empty=payload.fallback_to_empty,
    )

    if not payload.fallback_to_empty and not _is_ok(response.provider_status):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI provider unavailable: {response.provider_status.value}",
        )

    return response


@router.post(
    "/recommend",
    response_model=AiRecommendResponse,
)
def ai_recommend(
    payload: AiRecommendRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> AiRecommendResponse:
    """Parse natural-language intent and return Phase 5-ranked recommendations.

    The LLM only parses intent into structured tag ids — track selection,
    scoring, cooldown enforcement, and feedback penalties are all handled by
    the existing Phase 5 recommendation service.
    """
    response = ai_intent.recommend_via_ai(
        db,
        current_user,
        ai_provider,
        payload.text,
        limit=payload.limit,
        client=payload.client,
        fallback_to_empty=payload.fallback_to_empty,
    )

    if (
        not payload.fallback_to_empty
        and not _is_ok(response.parsed_intent.provider_status)
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI provider unavailable: "
                f"{response.parsed_intent.provider_status.value}"
            ),
        )

    return response


@router.post(
    "/tracks/{track_id}/suggest-tags",
    response_model=TagSuggestionResponse,
)
def suggest_track_tags(
    track_id: int,
    payload: TagSuggestionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> TagSuggestionResponse:
    """Suggest tags for one track using AI-assisted metadata analysis.

    Returns existing-tag suggestions grouped by tag group.  The endpoint never
    creates tags and never assigns them to the track.  Callers must explicitly
    apply selected suggestions through the existing track update flow.
    """
    return ai_tag_suggestions.suggest_tags_for_track(
        db,
        current_user,
        ai_provider,
        track_id,
        include_new_tag_suggestions=payload.include_new_tag_suggestions,
    )


def _is_ok(provider_status) -> bool:
    return str(provider_status.value) == "ok"
