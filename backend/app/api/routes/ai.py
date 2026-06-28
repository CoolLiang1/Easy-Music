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
    TrackOrganizationApplyRequest,
    TrackOrganizationApplyResponse,
    TrackOrganizationRequest,
    TrackOrganizationResponse,
)
from app.services import ai_intent, ai_tag_suggestions, ai_track_organization
from app.services.ai_provider import AiProviderService
from app.services.ai_client import OpenAiCompatibleClient
from app.services.ai_search_client import TavilyCompatibleSearchClient
from app.services.ai_search_provider import (
    SUPPORTED_SEARCH_PROVIDER,
    AiSearchProviderService,
)

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_ai_provider() -> AiProviderService:
    """Construct the AI provider service with a real HTTP client when
    configured, otherwise leave it without one so callers get a clear
    disabled / unconfigured / not-implemented result.
    """
    settings = get_settings()
    client = None
    if settings.ai_enabled and settings.ai_api_key and settings.ai_model:
        client = OpenAiCompatibleClient(settings)
    return AiProviderService(settings, client=client)


def _get_ai_search_provider() -> AiSearchProviderService:
    settings = get_settings()
    client = None
    if (
        settings.ai_search_enabled
        and settings.ai_search_provider == SUPPORTED_SEARCH_PROVIDER
        and settings.ai_search_api_key
        and settings.ai_search_base_url
    ):
        client = TavilyCompatibleSearchClient(settings)
    return AiSearchProviderService(settings, client=client)


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


@router.post(
    "/tracks/{track_id}/organize",
    response_model=TrackOrganizationResponse,
)
def organize_track(
    track_id: int,
    payload: TrackOrganizationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
    search_provider: Annotated[
        AiSearchProviderService,
        Depends(_get_ai_search_provider),
    ],
) -> TrackOrganizationResponse:
    """Research and analyze one owned track for manual organization suggestions.

    The endpoint stores cached research and analysis, but never applies tags,
    creates tags, joins playlists, or changes recommendation behavior.
    """
    settings = get_settings()
    try:
        return ai_track_organization.organize_track(
            db,
            current_user,
            ai_provider,
            search_provider,
            track_id,
            force_refresh_search=payload.force_refresh_search,
            force_reanalyze=payload.force_reanalyze,
            search_cache_days=settings.ai_search_cache_days,
        )
    except ai_track_organization.TrackOrganizationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tracks/{track_id}/organize/apply",
    response_model=TrackOrganizationApplyResponse,
)
def apply_track_organization(
    track_id: int,
    payload: TrackOrganizationApplyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TrackOrganizationApplyResponse:
    """Apply only the user's selected organization suggestions.

    The referenced analysis must belong to the current user and track. The
    endpoint never applies unselected suggestions and never creates playlists.
    """
    try:
        return ai_track_organization.apply_organization_suggestions(
            db,
            current_user,
            track_id,
            payload,
        )
    except ai_track_organization.TrackOrganizationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ai_track_organization.TrackOrganizationApplyValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


def _is_ok(provider_status) -> bool:
    return str(provider_status.value) == "ok"
