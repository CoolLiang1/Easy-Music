from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.track import TrackResponse, TrackUpdate


def list_tracks(db: Session, user: User) -> list[Track]:
    return list(
        db.scalars(
            select(Track)
            .where(Track.user_id == user.id)
            .order_by(Track.created_at, Track.id),
        ),
    )


def get_track(db: Session, user: User, track_id: int) -> Track | None:
    return db.scalar(select(Track).where(Track.id == track_id, Track.user_id == user.id))


def get_track_tags(db: Session, track: Track) -> list[Tag]:
    return list(
        db.scalars(
            select(Tag)
            .join(TrackTag, TrackTag.tag_id == Tag.id)
            .where(TrackTag.track_id == track.id)
            .order_by(Tag.created_at, Tag.id),
        ),
    )


def build_track_response(db: Session, track: Track) -> TrackResponse:
    return TrackResponse.model_validate(
        {
            **track.__dict__,
            "tags": get_track_tags(db, track),
        },
    )


def update_track(db: Session, user: User, track: Track, payload: TrackUpdate) -> Track | None:
    updates = payload.model_dump(exclude_unset=True)
    tag_ids = updates.pop("tag_ids", None)

    unique_tag_ids: list[int] | None = None
    if tag_ids is not None:
        unique_tag_ids = list(dict.fromkeys(tag_ids))
        tags = list(
            db.scalars(
                select(Tag).where(Tag.user_id == user.id, Tag.id.in_(unique_tag_ids)),
            ),
        )
        if len(tags) != len(unique_tag_ids):
            return None

    for field, value in updates.items():
        setattr(track, field, value)

    if unique_tag_ids is not None:
        db.execute(delete(TrackTag).where(TrackTag.track_id == track.id))
        for tag_id in unique_tag_ids:
            db.add(TrackTag(track_id=track.id, tag_id=tag_id))

    db.commit()
    db.refresh(track)
    return track


def delete_track(db: Session, track: Track) -> None:
    db.execute(delete(TrackTag).where(TrackTag.track_id == track.id))
    db.delete(track)
    db.commit()
