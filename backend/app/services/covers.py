"""Automatic covers from artwork the media already carries.

Covers are optional. A track gets one automatically only when it has none:
embedded artwork from the original audio file, or a frame from an uploaded
video before the temporary video is deleted. An owner-uploaded cover is
never replaced, and original files are only read.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media.ffmpeg import SubprocessRunner, extract_cover_image
from app.media.storage import MediaStorage
from app.models.track import Track

logger = logging.getLogger(__name__)

CoverExtractor = Callable[..., bool]

# Grab a video frame from this share of the duration, capped, so intros and
# fade-ins are skipped.
VIDEO_FRAME_POSITION = 0.2
VIDEO_FRAME_MAX_SECONDS = 60.0


def attach_extracted_cover(
    track: Track,
    source_path: Path,
    storage: MediaStorage,
    *,
    extractor: CoverExtractor = extract_cover_image,
    seek_seconds: float | None = None,
    runner: SubprocessRunner | None = None,
) -> bool:
    """Give *track* a cover extracted from *source_path* if it has none.

    Sets ``track.cover_path`` without committing. Never raises: a missing or
    unreadable picture simply leaves the track without a cover.
    """
    if track.cover_path:
        return False
    destination = storage.cover_image_path(track.user_id, track.id, ".jpg")
    try:
        found = extractor(
            source_path,
            destination,
            settings=storage.settings,
            runner=runner,
            seek_seconds=seek_seconds,
        )
    except Exception:  # noqa: BLE001 - covers are a comfort feature
        logger.warning("Cover extraction failed for track %s.", track.id, exc_info=True)
        found = False
    if not found:
        destination.unlink(missing_ok=True)
        return False
    track.cover_path = storage.relative_media_path(destination)
    return True


def video_frame_seek_seconds(duration_seconds: float | None) -> float | None:
    """Where to grab a representative frame of a video of this length."""
    if not duration_seconds or duration_seconds <= 0:
        return None
    return min(duration_seconds * VIDEO_FRAME_POSITION, VIDEO_FRAME_MAX_SECONDS)


def list_tracks_without_cover(db: Session) -> list[int]:
    """Ready tracks with an original file and no cover, oldest first."""
    return list(
        db.scalars(
            select(Track.id)
            .where(
                Track.status == "ready",
                Track.cover_path.is_(None),
                Track.original_file_path.is_not(None),
            )
            .order_by(Track.id),
        ),
    )
