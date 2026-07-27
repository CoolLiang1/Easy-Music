from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.playlist import Playlist, PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistReorder,
    PlaylistResponse,
    PlaylistSummaryResponse,
    PlaylistTrackAdd,
    PlaylistTrackResponse,
    PlaylistTracksAdd,
    PlaylistUpdate,
)
from app.services.tracks import build_track_response


class PlaylistValidationError(ValueError):
    pass


@dataclass(frozen=True)
class PlaylistTrackSignal:
    playlist_id: int
    track_id: int
    position: int
    playlist_name: str
    playlist_description: str | None = None


def list_playlists(db: Session, user: User) -> list[PlaylistSummaryResponse]:
    playlists = list(
        db.scalars(
            select(Playlist)
            .where(Playlist.user_id == user.id)
            .order_by(Playlist.created_at, Playlist.id),
        ),
    )
    if not playlists:
        return []

    playlist_ids = [playlist.id for playlist in playlists]
    counts = {
        playlist_id: track_count
        for playlist_id, track_count in db.execute(
            select(PlaylistTrack.playlist_id, func.count(PlaylistTrack.track_id))
            .where(PlaylistTrack.playlist_id.in_(playlist_ids))
            .group_by(PlaylistTrack.playlist_id),
        )
    }

    return [
        PlaylistSummaryResponse(
            id=playlist.id,
            name=playlist.name,
            description=playlist.description,
            track_count=counts.get(playlist.id, 0),
            created_at=playlist.created_at,
            updated_at=playlist.updated_at,
        )
        for playlist in playlists
    ]


def create_playlist(db: Session, user: User, payload: PlaylistCreate) -> Playlist:
    playlist = Playlist(
        user_id=user.id,
        name=payload.name,
        description=payload.description,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def get_playlist(db: Session, user: User, playlist_id: int) -> Playlist | None:
    return db.scalar(
        select(Playlist).where(Playlist.id == playlist_id, Playlist.user_id == user.id),
    )


def update_playlist(db: Session, playlist: Playlist, payload: PlaylistUpdate) -> Playlist:
    updates = payload.model_dump(exclude_unset=True)
    name = updates.get("name")
    if name is not None:
        playlist.name = name
    if "description" in updates:
        playlist.description = updates["description"]

    db.commit()
    db.refresh(playlist)
    return playlist


def delete_playlist(db: Session, playlist: Playlist) -> None:
    db.execute(delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id))
    db.delete(playlist)
    db.commit()


def add_track_to_playlist(
    db: Session,
    user: User,
    playlist: Playlist,
    payload: PlaylistTrackAdd,
) -> Playlist | None:
    track = db.scalar(
        select(Track).where(Track.id == payload.track_id, Track.user_id == user.id),
    )
    if track is None:
        return None

    existing = db.get(PlaylistTrack, (playlist.id, track.id))
    if existing is not None:
        return playlist

    next_position = _next_position(db, playlist)
    db.add(
        PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=next_position,
        ),
    )
    _touch_playlist(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def add_tracks_to_playlist(
    db: Session,
    user: User,
    playlist: Playlist,
    payload: PlaylistTracksAdd,
) -> Playlist | None:
    unique_track_ids = list(dict.fromkeys(payload.track_ids))
    if not unique_track_ids:
        raise PlaylistValidationError("Choose at least one track.")

    tracks = list(
        db.scalars(
            select(Track).where(Track.user_id == user.id, Track.id.in_(unique_track_ids)),
        ),
    )
    tracks_by_id = {track.id: track for track in tracks}
    if len(tracks_by_id) != len(unique_track_ids):
        return None

    existing_track_ids = set(
        db.scalars(
            select(PlaylistTrack.track_id).where(
                PlaylistTrack.playlist_id == playlist.id,
                PlaylistTrack.track_id.in_(unique_track_ids),
            ),
        ),
    )

    next_position = _next_position(db, playlist)
    added_count = 0
    for track_id in unique_track_ids:
        if track_id in existing_track_ids:
            continue

        db.add(
            PlaylistTrack(
                playlist_id=playlist.id,
                track_id=track_id,
                position=next_position + added_count,
            ),
        )
        added_count += 1

    if added_count > 0:
        _touch_playlist(playlist)
        db.commit()
        db.refresh(playlist)

    return playlist


def remove_track_from_playlist(
    db: Session,
    playlist: Playlist,
    track_id: int,
) -> Playlist:
    membership = db.get(PlaylistTrack, (playlist.id, track_id))
    if membership is None:
        raise PlaylistValidationError("Playlist track not found.")

    db.delete(membership)
    db.flush()
    _normalize_positions(db, playlist)
    _touch_playlist(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def reorder_playlist_tracks(
    db: Session,
    playlist: Playlist,
    payload: PlaylistReorder,
) -> Playlist:
    requested_track_ids = payload.track_ids
    unique_track_ids = list(dict.fromkeys(requested_track_ids))
    if len(unique_track_ids) != len(requested_track_ids):
        raise PlaylistValidationError("Playlist order cannot contain duplicate track ids.")

    memberships = _playlist_track_rows(db, playlist)
    current_track_ids = [membership.track_id for membership in memberships]
    if set(unique_track_ids) != set(current_track_ids):
        raise PlaylistValidationError(
            "Playlist order must contain exactly the current playlist tracks.",
        )

    memberships_by_track_id = {
        membership.track_id: membership for membership in memberships
    }
    for position, track_id in enumerate(unique_track_ids, start=1):
        memberships_by_track_id[track_id].position = position

    _touch_playlist(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


def build_playlist_response(db: Session, playlist: Playlist) -> PlaylistResponse:
    rows = db.execute(
        select(PlaylistTrack, Track)
        .join(Track, Track.id == PlaylistTrack.track_id)
        .where(PlaylistTrack.playlist_id == playlist.id)
        .order_by(PlaylistTrack.position, PlaylistTrack.created_at, PlaylistTrack.track_id),
    ).all()

    tracks = [
        PlaylistTrackResponse(
            position=playlist_track.position,
            added_at=playlist_track.created_at,
            track=build_track_response(db, track),
        )
        for playlist_track, track in rows
    ]
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description,
        track_count=len(tracks),
        tracks=tracks,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
    )


def list_playlist_track_signals(db: Session, user: User) -> list[PlaylistTrackSignal]:
    rows = db.execute(
        select(
            PlaylistTrack.playlist_id,
            PlaylistTrack.track_id,
            PlaylistTrack.position,
            Playlist.name,
            Playlist.description,
        )
        .join(Playlist, Playlist.id == PlaylistTrack.playlist_id)
        .join(Track, Track.id == PlaylistTrack.track_id)
        .where(Playlist.user_id == user.id, Track.user_id == user.id)
        .order_by(PlaylistTrack.playlist_id, PlaylistTrack.position),
    )
    return [
        PlaylistTrackSignal(
            playlist_id=playlist_id,
            track_id=track_id,
            position=position,
            playlist_name=playlist_name,
            playlist_description=playlist_description,
        )
        for playlist_id, track_id, position, playlist_name, playlist_description in rows
    ]


def _next_position(db: Session, playlist: Playlist) -> int:
    max_position = db.scalar(
        select(func.max(PlaylistTrack.position)).where(
            PlaylistTrack.playlist_id == playlist.id,
        ),
    )
    return (max_position or 0) + 1


def _playlist_track_rows(db: Session, playlist: Playlist) -> list[PlaylistTrack]:
    return list(
        db.scalars(
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == playlist.id)
            .order_by(PlaylistTrack.position, PlaylistTrack.created_at, PlaylistTrack.track_id),
        ),
    )


def _normalize_positions(db: Session, playlist: Playlist) -> None:
    for position, membership in enumerate(_playlist_track_rows(db, playlist), start=1):
        membership.position = position


def _touch_playlist(playlist: Playlist) -> None:
    playlist.updated_at = datetime.now(timezone.utc)
