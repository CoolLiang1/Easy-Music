import logging
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.media.paths import UnsafeMediaPathError
from app.media.storage import MediaStorage
from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.processing_job import ProcessingJob
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.track import (
    TrackBatchTagResult,
    TrackBatchTagUpdate,
    TrackBatchTagUpdateResponse,
    TrackResponse,
    TrackUpdate,
)


logger = logging.getLogger(__name__)


class TrackMediaDeletionError(RuntimeError):
    pass


class BatchTagValidationError(ValueError):
    pass


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
    processing_job = get_latest_processing_job(db, track)
    return TrackResponse.model_validate(
        {
            **track.__dict__,
            "processing_job_status": processing_job.status if processing_job else None,
            "processing_error_message": (
                processing_job.error_message if processing_job else None
            ),
            "tags": get_track_tags(db, track),
        },
    )


def get_latest_processing_job(db: Session, track: Track) -> ProcessingJob | None:
    return db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.track_id == track.id)
        .order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc())
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


def batch_update_track_tags(
    db: Session,
    user: User,
    payload: TrackBatchTagUpdate,
) -> TrackBatchTagUpdateResponse:
    unique_track_ids = list(dict.fromkeys(payload.track_ids))
    add_tag_ids = list(dict.fromkeys(payload.add_tag_ids))
    remove_tag_ids = list(dict.fromkeys(payload.remove_tag_ids))
    tag_ids = list(dict.fromkeys([*add_tag_ids, *remove_tag_ids]))

    if not unique_track_ids:
        raise BatchTagValidationError("Choose at least one track.")

    if not add_tag_ids and not remove_tag_ids:
        raise BatchTagValidationError("Choose at least one tag to add or remove.")

    if tag_ids:
        tags = list(
            db.scalars(select(Tag).where(Tag.user_id == user.id, Tag.id.in_(tag_ids))),
        )
        if len(tags) != len(tag_ids):
            raise BatchTagValidationError("Tag not found for current user.")

    tracks_by_id = {
        track.id: track
        for track in db.scalars(
            select(Track).where(Track.user_id == user.id, Track.id.in_(unique_track_ids)),
        )
    }

    results: list[TrackBatchTagResult] = []
    updated_tracks: list[Track] = []

    for track_id in unique_track_ids:
        track = tracks_by_id.get(track_id)
        if track is None:
            results.append(
                TrackBatchTagResult(
                    track_id=track_id,
                    status="failed",
                    error="Track not found for current user.",
                ),
            )
            continue

        current_tag_ids = set(
            db.scalars(select(TrackTag.tag_id).where(TrackTag.track_id == track.id)),
        )
        next_tag_ids = (current_tag_ids - set(remove_tag_ids)) | set(add_tag_ids)

        db.execute(delete(TrackTag).where(TrackTag.track_id == track.id))
        for tag_id in sorted(next_tag_ids):
            db.add(TrackTag(track_id=track.id, tag_id=tag_id))

        results.append(TrackBatchTagResult(track_id=track.id, status="updated"))
        updated_tracks.append(track)

    db.commit()
    for track in updated_tracks:
        db.refresh(track)

    return TrackBatchTagUpdateResponse(
        requested_track_count=len(unique_track_ids),
        updated_count=len(updated_tracks),
        results=results,
        tracks=[build_track_response(db, track) for track in updated_tracks],
    )


def delete_track(db: Session, track: Track, storage: MediaStorage | None = None) -> None:
    track_id = track.id
    media_paths = _track_media_paths(track, storage) if storage is not None else []
    failed_media_path = "unknown"

    try:
        db.execute(delete(FeedbackEvent).where(FeedbackEvent.track_id == track_id))
        db.execute(delete(PlaybackEvent).where(PlaybackEvent.track_id == track_id))
        db.execute(delete(ProcessingJob).where(ProcessingJob.track_id == track_id))
        db.execute(delete(TrackTag).where(TrackTag.track_id == track_id))
        db.delete(track)
        db.flush()

        for media_path, display_path in media_paths:
            failed_media_path = display_path
            media_path.unlink(missing_ok=True)

        db.commit()
    except OSError as exc:
        db.rollback()
        logger.warning(
            "Unable to delete media file for track %s.",
            track_id,
            exc_info=True,
        )
        raise TrackMediaDeletionError(
            (
                f"Unable to delete stored media file '{failed_media_path}'. "
                "Check backend media volume permissions and try again."
            )
        ) from exc


def _track_media_paths(track: Track, storage: MediaStorage) -> list[tuple[Path, str]]:
    paths: list[tuple[Path, str]] = []
    seen_paths: set[str] = set()

    for relative_path in (
        track.original_file_path,
        track.playback_file_path,
        track.cover_path,
    ):
        if not relative_path:
            continue

        try:
            media_path = storage.stored_media_path(relative_path)
        except UnsafeMediaPathError as exc:
            logger.warning(
                "Skipping unsafe media path while deleting track %s.",
                track.id,
            )
            raise TrackMediaDeletionError(
                "Track references an unsafe stored media path and was not deleted.",
            ) from exc

        path_key = media_path.as_posix()
        if path_key in seen_paths:
            continue

        seen_paths.add(path_key)
        paths.append((media_path, relative_path))

    return paths
