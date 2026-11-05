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
    AutoTagBatchResponse,
    AutoTagStatusResponse,
    MetadataCleanupApplyRequest,
    MetadataCleanupApplyResponse,
    MetadataCleanupBatchRequest,
    MetadataCleanupBatchResponse,
    MetadataCleanupStatusResponse,
    ParsedIntentResponse,
    ParseListeningIntentRequest,
    TagSuggestionRequest,
    TagSuggestionResponse,
)
from app.services import ai_auto_tagging, ai_intent, ai_metadata_cleanup, ai_tag_suggestions
from app.services.ai_provider import AiProviderService
from app.services.ai_client import build_ai_provider
from app.services.ai_tag_search import AiTagSearchService
from app.services.ai_tag_search_client import TavilyTagSearchClient

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_ai_provider() -> AiProviderService:
    """Construct the AI provider service with a real HTTP client when
    configured, otherwise leave it without one so callers get a clear
    disabled / unconfigured / not-implemented result.
    """
    return build_ai_provider(get_settings())


def _get_ai_tag_search() -> AiTagSearchService:
    """Construct the optional search helper used only by suggest-tags."""
    settings = get_settings()
    client = None
    if (
        settings.ai_tag_search_enabled
        and settings.ai_tag_search_provider.strip().lower() == "tavily"
        and settings.ai_tag_search_api_key
        and settings.ai_tag_search_base_url
    ):
        client = TavilyTagSearchClient(settings)
    return AiTagSearchService(settings, client=client)


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
    ai_tag_search: Annotated[AiTagSearchService, Depends(_get_ai_tag_search)],
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
        search_service=ai_tag_search,
    )


@router.get(
    "/auto-tag/status",
    response_model=AutoTagStatusResponse,
)
def auto_tag_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> AutoTagStatusResponse:
    """Report how many of the owner's ready tracks wait for AI auto-tagging."""
    return AutoTagStatusResponse(
        provider_status=ai_provider.status,
        pending_count=ai_auto_tagging.count_tracks_needing_auto_tagging(
            db,
            user_id=current_user.id,
        ),
    )


@router.post(
    "/auto-tag/next-batch",
    response_model=AutoTagBatchResponse,
)
def auto_tag_next_batch(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> AutoTagBatchResponse:
    """Apply AI catalogue tags to the owner's next few untagged tracks.

    The AI only picks existing tag ids; applied rows are stored as AI-sourced
    and never replace owner-chosen tags. Clients call this repeatedly until
    ``remaining_count`` is 0. Provider failures return 200 with the status
    and ``error`` so the client can stop and explain.
    """
    result, remaining = ai_auto_tagging.auto_tag_next_owner_batch(
        db,
        ai_provider,
        user_id=current_user.id,
        min_confidence=get_settings().ai_auto_tagging_min_confidence,
    )
    return AutoTagBatchResponse(
        provider_status=result.provider_status,
        tagged_count=len(result.tagged_track_ids),
        applied_tag_count=result.applied_tag_count,
        remaining_count=remaining,
        error=result.error,
    )


@router.get(
    "/metadata-cleanup/status",
    response_model=MetadataCleanupStatusResponse,
)
def metadata_cleanup_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> MetadataCleanupStatusResponse:
    """Report how many of the owner's ready tracks wait for a metadata review."""
    return MetadataCleanupStatusResponse(
        provider_status=ai_provider.status,
        pending_count=ai_metadata_cleanup.count_pending_tracks(db, user_id=current_user.id),
    )


@router.post(
    "/metadata-cleanup/next-batch",
    response_model=MetadataCleanupBatchResponse,
)
def metadata_cleanup_next_batch(
    payload: MetadataCleanupBatchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    ai_provider: Annotated[AiProviderService, Depends(_get_ai_provider)],
) -> MetadataCleanupBatchResponse:
    """Propose clean titles and artists for the owner's next few tracks.

    Saves nothing; the client collects suggestions and sends the accepted
    ones to ``apply``. Provider failures return 200 with the status and
    ``error`` so the client can stop and explain.
    """
    result, next_after_id, remaining = ai_metadata_cleanup.suggest_next_batch(
        db,
        ai_provider,
        user_id=current_user.id,
        after_id=payload.after_id,
    )
    return MetadataCleanupBatchResponse(
        provider_status=result.provider_status,
        suggestions=result.suggestions,
        reviewed_track_ids=result.reviewed_track_ids,
        next_after_id=next_after_id,
        remaining_count=remaining,
        error=result.error,
    )


@router.post(
    "/metadata-cleanup/apply",
    response_model=MetadataCleanupApplyResponse,
)
def metadata_cleanup_apply(
    payload: MetadataCleanupApplyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MetadataCleanupApplyResponse:
    """Save the titles and artists the owner accepted and mark tracks reviewed."""
    updated, reviewed = ai_metadata_cleanup.apply_metadata_changes(
        db,
        user_id=current_user.id,
        changes=payload.changes,
        reviewed_track_ids=payload.reviewed_track_ids,
    )
    return MetadataCleanupApplyResponse(updated_count=updated, reviewed_count=reviewed)


def _is_ok(provider_status) -> bool:
    return str(provider_status.value) == "ok"
