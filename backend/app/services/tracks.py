import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.media.paths import UnsafeMediaPathError
from app.media.storage import MediaStorage
from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.playlist import PlaylistTrack
from app.models.processing_job import ProcessingJob
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.track import (
    TrackBatchDelete,
    TrackBatchDeleteResponse,
    TrackBatchDeleteResult,
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


class BatchDeleteValidationError(ValueError):
    pass


ALLOWED_COVER_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
COVER_CHUNK_SIZE = 1024 * 1024

TrackSortField = Literal[
    "created_at",
    "updated_at",
    "title",
    "artist",
    "album",
    "duration_seconds",
]
TrackSortOrder = Literal["asc", "desc"]


@dataclass(frozen=True)
class TrackQuery:
    search: str | None = None
    statuses: tuple[str, ...] = ()
    liked: bool | None = None
    content_types: tuple[str, ...] = ()
    tag_ids: tuple[int, ...] = ()
    sort: TrackSortField = "created_at"
    order: TrackSortOrder = "asc"
    limit: int | None = None
    offset: int = 0


@dataclass(frozen=True)
class TrackQueryResult:
    tracks: list[Track]
    total: int


def list_tracks(db: Session, user: User) -> list[Track]:
    return query_tracks(db, user, TrackQuery()).tracks


def query_tracks(
    db: Session,
    user: User,
    query: TrackQuery,
) -> TrackQueryResult:
    filters = _track_query_filters(user, query)
    total = db.scalar(
        select(func.count()).select_from(Track).where(*filters),
    ) or 0

    statement = (
        select(Track)
        .where(*filters)
        .order_by(*_track_query_order(query))
        .offset(query.offset)
    )
    if query.limit is not None:
        statement = statement.limit(query.limit)

    return TrackQueryResult(
        tracks=list(db.scalars(statement)),
        total=total,
    )


def _track_query_filters(user: User, query: TrackQuery) -> list[object]:
    filters: list[object] = [Track.user_id == user.id]
    search = (query.search or "").strip()
    if search:
        tag_name_match = (
            select(TrackTag.track_id)
            .join(Tag, Tag.id == TrackTag.tag_id)
            .where(
                TrackTag.track_id == Track.id,
                Tag.user_id == user.id,
                Tag.name.icontains(search, autoescape=True),
            )
            .exists()
        )
        filters.append(
            or_(
                Track.title.icontains(search, autoescape=True),
                Track.artist.icontains(search, autoescape=True),
                Track.album.icontains(search, autoescape=True),
                tag_name_match,
            ),
        )
    if query.statuses:
        filters.append(Track.status.in_(query.statuses))
    if query.liked is not None:
        filters.append(Track.liked == query.liked)
    if query.content_types:
        filters.append(Track.content_type.in_(query.content_types))
    for tag_id in dict.fromkeys(query.tag_ids):
        filters.append(
            select(TrackTag.track_id)
            .join(Tag, Tag.id == TrackTag.tag_id)
            .where(
                TrackTag.track_id == Track.id,
                TrackTag.tag_id == tag_id,
                Tag.user_id == user.id,
            )
            .exists(),
        )
    return filters


def _track_query_order(query: TrackQuery) -> tuple[object, ...]:
    sort_column = getattr(Track, query.sort)
    null_rank = case((sort_column.is_(None), 1), else_=0)
    normalized_column = (
        func.lower(sort_column)
        if query.sort in {"title", "artist", "album"}
        else sort_column
    )
    ordered_column = (
        normalized_column.desc() if query.order == "desc" else normalized_column.asc()
    )
    return null_rank.asc(), ordered_column, Track.id.asc()


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


def update_track_cover(
    db: Session,
    track: Track,
    file: UploadFile,
    storage: MediaStorage,
) -> Track:
    previous_cover_path = track.cover_path
    suffix = _validate_cover_upload(file)
    destination = storage.cover_image_path(track.user_id, track.id, suffix)
    max_bytes = storage.settings.max_cover_mb * 1024 * 1024

    try:
        _save_cover_upload(file, destination, max_bytes)
        _validate_saved_cover_signature(destination, file.content_type or "")
        next_cover_path = storage.relative_media_path(destination)
        track.cover_path = next_cover_path
        db.commit()
        db.refresh(track)
    except Exception:
        db.rollback()
        if destination.exists():
            destination.unlink()
        raise

    if previous_cover_path and previous_cover_path != next_cover_path:
        _delete_superseded_cover(previous_cover_path, storage, track.id)
    return track


def _delete_superseded_cover(
    relative_path: str,
    storage: MediaStorage,
    track_id: int,
) -> None:
    try:
        previous_cover = storage.stored_media_path(relative_path)
        previous_cover.unlink(missing_ok=True)
        _cleanup_empty_track_media_dirs([(previous_cover, relative_path)], track_id)
    except (OSError, UnsafeMediaPathError):
        logger.warning(
            "Unable to remove superseded cover for track %s; consistency report will retain it.",
            track_id,
            exc_info=True,
        )


def cover_media_type(track: Track) -> str:
    if not track.cover_path:
        return "application/octet-stream"

    suffix = Path(track.cover_path).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


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


def batch_delete_tracks(
    db: Session,
    user: User,
    payload: TrackBatchDelete,
    storage: MediaStorage,
) -> TrackBatchDeleteResponse:
    unique_track_ids = list(dict.fromkeys(payload.track_ids))

    if not unique_track_ids:
        raise BatchDeleteValidationError("Choose at least one track.")

    results: list[TrackBatchDeleteResult] = []
    deleted_count = 0

    for track_id in unique_track_ids:
        track = get_track(db, user, track_id)
        if track is None:
            results.append(
                TrackBatchDeleteResult(
                    track_id=track_id,
                    status="failed",
                    error="Track not found for current user.",
                ),
            )
            continue

        try:
            delete_track(db, track, storage)
        except TrackMediaDeletionError as exc:
            results.append(
                TrackBatchDeleteResult(
                    track_id=track_id,
                    status="failed",
                    error=str(exc),
                ),
            )
            continue

        deleted_count += 1
        results.append(TrackBatchDeleteResult(track_id=track_id, status="deleted"))

    return TrackBatchDeleteResponse(
        requested_track_count=len(unique_track_ids),
        deleted_count=deleted_count,
        results=results,
    )


def _validate_cover_upload(file: UploadFile) -> str:
    content_type = (file.content_type or "").lower()
    suffix = ALLOWED_COVER_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported cover image type.",
        )
    return suffix


def _save_cover_upload(source: UploadFile, destination: Path, max_bytes: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    bytes_written = 0

    with destination.open("xb") as output:
        while chunk := source.file.read(COVER_CHUNK_SIZE):
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Cover image exceeds the configured size limit.",
                )
            output.write(chunk)


def _validate_saved_cover_signature(path: Path, content_type: str) -> None:
    header = path.read_bytes()[:16]
    is_valid = (
        (content_type == "image/jpeg" and header.startswith(b"\xff\xd8\xff"))
        or (content_type == "image/png" and header.startswith(b"\x89PNG\r\n\x1a\n"))
        or (content_type == "image/webp" and header.startswith(b"RIFF") and header[8:12] == b"WEBP")
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded cover image content does not match its type.",
        )


def delete_track(db: Session, track: Track, storage: MediaStorage | None = None) -> None:
    track_id = track.id
    media_paths = _track_media_paths(track, storage) if storage is not None else []
    staged_paths = _stage_track_media_paths(media_paths, track_id)

    try:
        db.execute(delete(FeedbackEvent).where(FeedbackEvent.track_id == track_id))
        db.execute(delete(PlaybackEvent).where(PlaybackEvent.track_id == track_id))
        db.execute(delete(PlaylistTrack).where(PlaylistTrack.track_id == track_id))
        db.execute(delete(ProcessingJob).where(ProcessingJob.track_id == track_id))
        db.execute(delete(TrackTag).where(TrackTag.track_id == track_id))
        db.delete(track)
        db.flush()

        db.commit()
    except Exception:
        db.rollback()
        _restore_staged_media_paths(staged_paths, track_id)
        raise

    _delete_staged_media_paths(staged_paths, track_id)


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


def _stage_track_media_paths(
    media_paths: list[tuple[Path, str]],
    track_id: int,
) -> list[tuple[Path, Path, str]]:
    staged: list[tuple[Path, Path, str]] = []
    for media_path, display_path in media_paths:
        if not media_path.exists():
            continue
        tombstone = media_path.with_name(
            f".{media_path.name}.deleting-{uuid4().hex}",
        )
        try:
            media_path.replace(tombstone)
        except OSError as exc:
            _restore_staged_media_paths(staged, track_id)
            logger.warning("Unable to stage media deletion for track %s.", track_id, exc_info=True)
            raise TrackMediaDeletionError(
                (
                    f"Unable to stage stored media file '{display_path}' for deletion. "
                    "Check backend media volume permissions and try again."
                ),
            ) from exc
        staged.append((media_path, tombstone, display_path))
    return staged


def _restore_staged_media_paths(
    staged_paths: list[tuple[Path, Path, str]],
    track_id: int,
) -> None:
    for original, tombstone, _ in reversed(staged_paths):
        if not tombstone.exists():
            continue
        try:
            tombstone.replace(original)
        except OSError:
            logger.critical(
                "Unable to restore staged media for track %s.",
                track_id,
                exc_info=True,
            )


def _delete_staged_media_paths(
    staged_paths: list[tuple[Path, Path, str]],
    track_id: int,
) -> None:
    for _, tombstone, _ in staged_paths:
        try:
            tombstone.unlink(missing_ok=True)
            _cleanup_empty_track_media_dirs(
                [(tombstone, tombstone.name)],
                track_id,
            )
        except OSError:
            logger.warning(
                "Unable to remove staged media for deleted track %s; consistency report will retain it.",
                track_id,
                exc_info=True,
            )


def _cleanup_empty_track_media_dirs(
    media_paths: list[tuple[Path, str]],
    track_id: int,
) -> None:
    expected_dir_name = f"track-{track_id}"
    cleaned_dirs: set[str] = set()

    for media_path, display_path in media_paths:
        parent = media_path.parent
        if parent.name != expected_dir_name:
            continue

        parent_key = parent.as_posix()
        if parent_key in cleaned_dirs:
            continue

        cleaned_dirs.add(parent_key)
        try:
            parent.rmdir()
        except FileNotFoundError:
            logger.info(
                "Skipped media directory cleanup for track %s at '%s': directory no longer exists.",
                track_id,
                parent,
            )
        except OSError as exc:
            reason = str(exc)
            try:
                if parent.exists() and any(parent.iterdir()):
                    reason = "directory is not empty"
            except OSError as inspect_exc:
                reason = str(inspect_exc)

            logger.info(
                "Skipped media directory cleanup for track %s at '%s' after deleting '%s': %s.",
                track_id,
                parent,
                display_path,
                reason,
            )
