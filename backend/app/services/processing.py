from collections.abc import Callable
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media.ffmpeg import MediaProcessingError, SubprocessRunner, generate_mp3_playback
from app.media.metadata import MediaMetadata, extract_metadata
from app.media.paths import resolve_media_path
from app.media.storage import MediaStorage
from app.models.track import Track


MetadataExtractor = Callable[..., MediaMetadata]
PlaybackGenerator = Callable[..., None]


class TrackProcessingError(RuntimeError):
    pass


def process_track(
    db: Session,
    track_id: int,
    storage: MediaStorage,
    *,
    metadata_extractor: MetadataExtractor = extract_metadata,
    playback_generator: PlaybackGenerator = generate_mp3_playback,
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
        playback_generator(
            original_path,
            playback_path,
            settings=storage.settings,
            runner=runner,
        )

        _apply_metadata(track, metadata)
        track.playback_file_path = storage.relative_media_path(playback_path)
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
