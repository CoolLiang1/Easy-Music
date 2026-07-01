from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistReorder,
    PlaylistResponse,
    PlaylistSummaryResponse,
    PlaylistTrackAdd,
    PlaylistTracksAdd,
    PlaylistUpdate,
)
from app.services import playlists as playlist_service


router = APIRouter(prefix="/playlists", tags=["playlists"])


def playlist_not_found_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Playlist not found.",
    )


def track_not_found_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Track not found.",
    )


@router.get("", response_model=list[PlaylistSummaryResponse])
def list_playlists(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PlaylistSummaryResponse]:
    return playlist_service.list_playlists(db, current_user)


@router.post("", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
def create_playlist(
    payload: PlaylistCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.create_playlist(db, current_user, payload)
    return playlist_service.build_playlist_response(db, playlist)


@router.get("/{playlist_id}", response_model=PlaylistResponse)
def get_playlist(
    playlist_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    return playlist_service.build_playlist_response(db, playlist)


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
def update_playlist(
    playlist_id: int,
    payload: PlaylistUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    updated_playlist = playlist_service.update_playlist(db, playlist, payload)
    return playlist_service.build_playlist_response(db, updated_playlist)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(
    playlist_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    playlist_service.delete_playlist(db, playlist)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{playlist_id}/tracks", response_model=PlaylistResponse)
def add_track_to_playlist(
    playlist_id: int,
    payload: PlaylistTrackAdd,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    updated_playlist = playlist_service.add_track_to_playlist(
        db,
        current_user,
        playlist,
        payload,
    )
    if updated_playlist is None:
        raise track_not_found_error()

    return playlist_service.build_playlist_response(db, updated_playlist)


@router.post("/{playlist_id}/tracks/batch", response_model=PlaylistResponse)
def add_tracks_to_playlist(
    playlist_id: int,
    payload: PlaylistTracksAdd,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    try:
        updated_playlist = playlist_service.add_tracks_to_playlist(
            db,
            current_user,
            playlist,
            payload,
        )
    except playlist_service.PlaylistValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if updated_playlist is None:
        raise track_not_found_error()

    return playlist_service.build_playlist_response(db, updated_playlist)


@router.delete("/{playlist_id}/tracks/{track_id}", response_model=PlaylistResponse)
def remove_track_from_playlist(
    playlist_id: int,
    track_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    try:
        updated_playlist = playlist_service.remove_track_from_playlist(
            db,
            playlist,
            track_id,
        )
    except playlist_service.PlaylistValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return playlist_service.build_playlist_response(db, updated_playlist)


@router.put("/{playlist_id}/tracks/order", response_model=PlaylistResponse)
def reorder_playlist_tracks(
    playlist_id: int,
    payload: PlaylistReorder,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaylistResponse:
    playlist = playlist_service.get_playlist(db, current_user, playlist_id)
    if playlist is None:
        raise playlist_not_found_error()

    try:
        updated_playlist = playlist_service.reorder_playlist_tracks(
            db,
            playlist,
            payload,
        )
    except playlist_service.PlaylistValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return playlist_service.build_playlist_response(db, updated_playlist)
