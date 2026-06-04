from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.track import Track
from app.models.user import User
from app.schemas.duplicate import (
    DuplicateCandidateGroup,
    DuplicateCandidateGroupResponse,
    DuplicateCandidateTrack,
)
from app.services import duplicates as duplicate_service
from app.services import tracks as track_service


router = APIRouter(prefix="/tracks", tags=["duplicates"])


def track_not_found_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Track not found.",
    )


@router.get("/duplicates", response_model=list[DuplicateCandidateGroupResponse])
def list_duplicate_candidates(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    track_id: Annotated[int | None, Query()] = None,
) -> list[DuplicateCandidateGroupResponse]:
    if track_id is not None:
        track = track_service.get_track(db, current_user, track_id)
        if track is None:
            raise track_not_found_error()

    groups = duplicate_service.find_duplicate_candidates(db, current_user)
    if track_id is not None:
        groups = [group for group in groups if track_id in group.candidate_track_ids]

    return _build_group_responses(db, current_user, groups)


def _build_group_responses(
    db: Session,
    user: User,
    groups: list[DuplicateCandidateGroup],
) -> list[DuplicateCandidateGroupResponse]:
    track_ids = sorted({track_id for group in groups for track_id in group.candidate_track_ids})
    tracks_by_id = _load_tracks_by_id(db, user, track_ids)

    responses: list[DuplicateCandidateGroupResponse] = []
    for group in groups:
        candidates = [
            _build_candidate_track(tracks_by_id[track_id])
            for track_id in group.candidate_track_ids
            if track_id in tracks_by_id
        ]
        responses.append(
            DuplicateCandidateGroupResponse(
                group_id=group.group_id,
                match_type=group.match_type,
                confidence=group.confidence,
                reason=group.reason,
                candidate_track_ids=group.candidate_track_ids,
                candidates=candidates,
            ),
        )

    return responses


def _load_tracks_by_id(db: Session, user: User, track_ids: list[int]) -> dict[int, Track]:
    if not track_ids:
        return {}

    tracks = db.scalars(
        select(Track).where(Track.user_id == user.id, Track.id.in_(track_ids)),
    )
    return {track.id: track for track in tracks}


def _build_candidate_track(track: Track) -> DuplicateCandidateTrack:
    return DuplicateCandidateTrack(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        content_type=track.content_type,
        status=track.status,
    )
