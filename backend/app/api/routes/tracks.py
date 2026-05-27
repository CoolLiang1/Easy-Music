from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.media.paths import UnsafeMediaPathError
from app.media.responses import stream_file_response
from app.media.storage import MediaStorage, get_media_storage
from app.models.user import User
from app.schemas.track import TrackResponse, TrackUpdate
from app.services import tracks as track_service


router = APIRouter(prefix="/tracks", tags=["tracks"])


def track_not_found_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Track not found.",
    )


@router.get("", response_model=list[TrackResponse])
def list_tracks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TrackResponse]:
    return [
        track_service.build_track_response(db, track)
        for track in track_service.list_tracks(db, current_user)
    ]


@router.get("/{track_id}", response_model=TrackResponse)
def get_track(
    track_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TrackResponse:
    track = track_service.get_track(db, current_user, track_id)
    if track is None:
        raise track_not_found_error()

    return track_service.build_track_response(db, track)


@router.get("/{track_id}/stream")
def stream_track(
    track_id: int,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
) -> StreamingResponse:
    track = track_service.get_track(db, current_user, track_id)
    if track is None:
        raise track_not_found_error()
    if track.status != "ready" or not track.playback_file_path:
        raise track_not_found_error()

    try:
        playback_path = storage.stored_media_path(track.playback_file_path)
    except UnsafeMediaPathError as exc:
        raise track_not_found_error() from exc

    return stream_file_response(
        playback_path,
        request.headers.get("range"),
        media_type="audio/mpeg",
    )


@router.patch("/{track_id}", response_model=TrackResponse)
def update_track(
    track_id: int,
    payload: TrackUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TrackResponse:
    track = track_service.get_track(db, current_user, track_id)
    if track is None:
        raise track_not_found_error()

    updated_track = track_service.update_track(db, current_user, track, payload)
    if updated_track is None:
        raise track_not_found_error()

    return track_service.build_track_response(db, updated_track)


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(
    track_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    track = track_service.get_track(db, current_user, track_id)
    if track is None:
        raise track_not_found_error()

    track_service.delete_track(db, track)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
