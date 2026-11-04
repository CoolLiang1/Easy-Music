from collections.abc import Callable
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media.ffmpeg import (
    LoudnessMeasurement,
    MediaProcessingError,
    SubprocessRunner,
    compute_playback_gain_db,
    generate_mp3_playback,
    measure_loudness,
)
from app.media.metadata import MediaMetadata, extract_metadata
from app.media.paths import resolve_media_path
from app.media.storage import MediaStorage
from app.models.track import Track
from app.services.duplicate_signals import (
    build_normalized_metadata_key,
    collect_file_duplicate_signal,
)


MetadataExtractor = Callable[..., MediaMetadata]
PlaybackGenerator = Callable[..., None]
LoudnessMeasurer = Callable[..., LoudnessMeasurement]

# Bump when the normalization rule changes so old playback files can be
# regenerated with `python -m app.worker.renormalize`.
LOUDNESS_VERSION = 1

logger = logging.getLogger(__name__)


class TrackProcessingError(RuntimeError):
    pass


def process_track(
    db: Session,
    track_id: int,
    storage: MediaStorage,
    *,
    metadata_extractor: MetadataExtractor = extract_metadata,
    playback_generator: PlaybackGenerator = generate_mp3_playback,
    loudness_measurer: LoudnessMeasurer = measure_loudness,
    runner: SubprocessRunner | None = None,
) -> Track:
    track = db.scalar(select(Track).where(Track.id == track_id))
    if track is None:
        raise TrackProcessingError(f"Track {track_id} was not found.")

    if not track.original_file_path:
        track.status = "failed"
        db.commit()
        db.refresh(track)
        raise TrackProcessingError(f"Track {track_id} has no original file path.")

    original_path = resolve_media_path(storage.settings.media_root, track.original_file_path)
    playback_path = storage.playback_mp3_path(track.user_id, track.id)

    try:
        track.status = "processing"
        db.flush()

        metadata = metadata_extractor(
            original_path,
            settings=storage.settings,
            runner=runner,
        )
        _generate_playback(
            track,
            original_path,
            playback_path,
            storage,
            playback_generator=playback_generator,
            loudness_measurer=loudness_measurer,
            runner=runner,
        )

        _apply_metadata(track, metadata)
        track.normalized_metadata_key = build_normalized_metadata_key(
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration_seconds=track.duration_seconds,
        )
        original_signal = collect_file_duplicate_signal(original_path)
        if original_signal is not None:
            track.original_file_size_bytes = original_signal.size_bytes
            track.original_file_sha256 = original_signal.sha256
        track.status = "ready"
        db.commit()
        db.refresh(track)
        return track
    except (MediaProcessingError, OSError, ValueError) as exc:
        db.rollback()
        failed_track = db.scalar(select(Track).where(Track.id == track_id))
        if failed_track is None:
            raise
        failed_track.status = "failed"
        db.commit()
        db.refresh(failed_track)
        raise TrackProcessingError(f"Track {track_id} processing failed.") from exc


def regenerate_track_playback(
    db: Session,
    track_id: int,
    storage: MediaStorage,
    *,
    playback_generator: PlaybackGenerator = generate_mp3_playback,
    loudness_measurer: LoudnessMeasurer = measure_loudness,
    runner: SubprocessRunner | None = None,
) -> Track:
    """Rebuild only the playback MP3 of a ready track from its original file.

    Unlike `process_track`, this never re-applies file metadata, so owner edits
    to title, artist, album, tags, and cover are preserved. A failure leaves
    the existing playback file and track status untouched.
    """
    track = db.scalar(select(Track).where(Track.id == track_id))
    if track is None:
        raise TrackProcessingError(f"Track {track_id} was not found.")
    if track.status != "ready" or not track.original_file_path:
        raise TrackProcessingError(f"Track {track_id} is not ready for playback regeneration.")

    original_path = resolve_media_path(storage.settings.media_root, track.original_file_path)
    playback_path = storage.playback_mp3_path(track.user_id, track.id)
    try:
        _generate_playback(
            track,
            original_path,
            playback_path,
            storage,
            playback_generator=playback_generator,
            loudness_measurer=loudness_measurer,
            runner=runner,
        )
        db.commit()
    except (MediaProcessingError, OSError, ValueError) as exc:
        db.rollback()
        raise TrackProcessingError(f"Track {track_id} playback regeneration failed.") from exc

    db.refresh(track)
    return track


def _generate_playback(
    track: Track,
    original_path: Path,
    playback_path: Path,
    storage: MediaStorage,
    *,
    playback_generator: PlaybackGenerator,
    loudness_measurer: LoudnessMeasurer,
    runner: SubprocessRunner | None,
) -> None:
    settings = storage.settings
    measurement: LoudnessMeasurement | None = None
    gain_db: float | None = None

    if settings.playback_loudness_normalization:
        try:
            measurement = loudness_measurer(original_path, settings=settings, runner=runner)
        except MediaProcessingError:
            # Normalization is a comfort feature; never block a track on it.
            logger.warning(
                "Loudness measurement failed for track %s; generating playback without gain.",
                track.id,
                exc_info=True,
            )
        else:
            gain_db = compute_playback_gain_db(
                measurement,
                target_lufs=settings.playback_target_lufs,
                max_true_peak_dbtp=settings.playback_max_true_peak_dbtp,
            )

    playback_generator(
        original_path,
        playback_path,
        settings=settings,
        runner=runner,
        gain_db=gain_db,
    )

    track.playback_file_path = storage.relative_media_path(playback_path)
    track.loudness_lufs = measurement.integrated_lufs if measurement else None
    track.true_peak_dbtp = measurement.true_peak_dbtp if measurement else None
    track.playback_gain_db = gain_db
    track.loudness_version = LOUDNESS_VERSION if measurement else None
    playback_signal = collect_file_duplicate_signal(playback_path)
    if playback_signal is not None:
        track.playback_file_sha256 = playback_signal.sha256


def _apply_metadata(track: Track, metadata: MediaMetadata) -> None:
    if metadata.title:
        track.title = metadata.title
    if metadata.artist:
        track.artist = metadata.artist
    if metadata.album:
        track.album = metadata.album

    track.duration_seconds = metadata.duration_seconds
    track.format = metadata.format
    track.bitrate = metadata.bitrate


def list_tracks_needing_loudness_normalization(
    db: Session,
    *,
    include_current: bool = False,
) -> list[int]:
    """Return ready track ids whose playback file predates LOUDNESS_VERSION."""
    query = select(Track.id).where(
        Track.status == "ready",
        Track.original_file_path.is_not(None),
    )
    if not include_current:
        query = query.where(
            (Track.loudness_version.is_(None)) | (Track.loudness_version < LOUDNESS_VERSION)
        )
    return list(db.scalars(query.order_by(Track.id)))
