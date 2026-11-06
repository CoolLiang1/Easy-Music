"""Owner-reviewed online cover search (iTunes Search API)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.media.storage import MediaStorage, get_media_storage
from app.models.user import User
from app.schemas.covers import (
    CoverCandidateResponse,
    CoverSearchApplyRequest,
    CoverSearchApplyResponse,
    CoverSearchBatchRequest,
    CoverSearchBatchResponse,
    CoverlessTrack,
    CoverSearchStatusResponse,
)
from app.services import cover_search
from app.services.cover_search import MATCH, CoverSearchClient, ItunesCoverSearchClient

router = APIRouter(prefix="/covers/search", tags=["covers"])


def _get_cover_search_client() -> CoverSearchClient | None:
    """The iTunes client when the owner enabled online cover search, else None."""
    return ItunesCoverSearchClient() if get_settings().cover_search_enabled else None


@router.get("/status", response_model=CoverSearchStatusResponse)
def cover_search_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[CoverSearchClient | None, Depends(_get_cover_search_client)],
) -> CoverSearchStatusResponse:
    """List all of the owner's tracks that still have no cover."""
    tracks = cover_search.list_coverless_tracks(db, user_id=current_user.id)
    return CoverSearchStatusResponse(
        enabled=client is not None,
        coverless_count=cover_search.count_coverless_tracks(db, user_id=current_user.id),
        pending_count=cover_search.count_pending_tracks(db, user_id=current_user.id),
        tracks=[
            CoverlessTrack(
                track_id=track.id,
                title=track.title,
                artist=(track.artist or "").strip(),
                duration_seconds=track.duration_seconds,
                searched=cover_search.is_searched(track),
            )
            for track in tracks
        ],
        skipped_without_artist=cover_search.count_tracks_without_artist(db, user_id=current_user.id),
    )


@router.post("/next-batch", response_model=CoverSearchBatchResponse)
def cover_search_next_batch(
    payload: CoverSearchBatchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[CoverSearchClient | None, Depends(_get_cover_search_client)],
) -> CoverSearchBatchResponse:
    """Search covers for the owner's next few tracks, or the given ones. Saves nothing."""
    if payload.track_ids is not None:
        result = cover_search.search_tracks_by_id(db, client, user_id=current_user.id, track_ids=payload.track_ids)
        next_after_id, remaining = None, 0
    else:
        result, next_after_id, remaining = cover_search.search_next_batch(
            db,
            client,
            user_id=current_user.id,
            after_id=payload.after_id,
        )
    return CoverSearchBatchResponse(
        status=result.status,
        candidates=[
            CoverCandidateResponse(
                track_id=suggestion.track_id,
                artwork_url=suggestion.candidate.artwork_url,
                track_name=suggestion.candidate.track_name,
                artist_name=suggestion.candidate.artist_name,
                collection_name=suggestion.candidate.collection_name,
                confidence=suggestion.candidate.confidence,
                selected=suggestion.candidate.confidence == MATCH,
            )
            for suggestion in result.suggestions
        ],
        reviewed_track_ids=result.reviewed_track_ids,
        next_after_id=next_after_id,
        remaining_count=remaining,
        error=result.error,
    )


@router.post("/apply", response_model=CoverSearchApplyResponse)
def cover_search_apply(
    payload: CoverSearchApplyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
) -> CoverSearchApplyResponse:
    """Download the covers the owner accepted and mark reviewed tracks."""
    updated, failed, reviewed = cover_search.apply_cover_choices(
        db,
        storage,
        user_id=current_user.id,
        choices=[(choice.track_id, choice.artwork_url) for choice in payload.choices],
        reviewed_track_ids=payload.reviewed_track_ids,
    )
    return CoverSearchApplyResponse(updated_count=updated, failed_count=failed, reviewed_count=reviewed)
