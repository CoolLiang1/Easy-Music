from pathlib import Path

from sqlalchemy.orm import Session

from app.media.ffmpeg import FFmpegError, extract_audio_from_video
from app.media.paths import UnsafeMediaPathError, resolve_media_path, sanitize_filename
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.services.jobs import (
    AUDIO_PROCESSING_JOB_TYPE,
    VIDEO_EXTRACTION_JOB_TYPE,
    claim_next_pending_job,
    mark_job_failed,
    mark_job_succeeded,
)
from app.services.processing import TrackProcessingError, process_track


class VideoExtractionError(RuntimeError):
    pass


def process_one_track(
    db: Session,
    track_id: int,
    storage: MediaStorage | None = None,
) -> Track:
    return process_track(db, track_id, storage or MediaStorage())


def process_next_job(
    db: Session,
    storage: MediaStorage | None = None,
) -> ProcessingJob | None:
    job = claim_next_pending_job(db)
    if job is None:
        return None

    storage = storage or MediaStorage()
    job_id = job.id
    try:
        if job.job_type == VIDEO_EXTRACTION_JOB_TYPE:
            _process_video_extraction_job(db, job, storage)
        else:
            process_track(db, job.track_id, storage)
    except Exception as exc:
        return mark_job_failed(db, job_id, str(exc) or exc.__class__.__name__)

    return mark_job_succeeded(db, job_id)


def _process_video_extraction_job(
    db: Session,
    job: ProcessingJob,
    storage: MediaStorage,
) -> None:
    track_id = job.track_id

    # Reject missing source_path.
    if not job.source_path:
        _fail_track(db, track_id)
        raise VideoExtractionError("Video extraction job is missing a source path.")

    # Resolve and validate temp video path inside MEDIA_ROOT.
    try:
        temp_video_path = storage.stored_media_path(job.source_path)
    except UnsafeMediaPathError:
        _fail_track(db, track_id)
        raise VideoExtractionError("Video source path is invalid.")
    if not _is_temporary_video_path(temp_video_path, storage):
        _fail_track(db, track_id)
        raise VideoExtractionError("Video source path is not temporary video storage.")

    if not temp_video_path.is_file():
        _fail_track(db, track_id)
        raise VideoExtractionError("Temporary video file is missing.")

    # Fetch the target Track.
    track = db.get(Track, track_id)
    if track is None:
        raise VideoExtractionError(f"Track {track_id} was not found.")

    # If the track already has a usable extracted original, skip extraction.
    existing_original = _existing_original_path(track, storage)
    if existing_original is not None:
        process_track(db, track.id, storage)
        return

    # Generate a safe destination audio filename.
    audio_filename = _extracted_audio_filename(track.title)
    destination = storage.original_upload_path(track.user_id, track.id, audio_filename)

    # Extract audio from the temporary video.
    try:
        extract_audio_from_video(
            temp_video_path,
            destination,
            settings=storage.settings,
        )
    except FFmpegError:
        _fail_track(db, track_id)
        # Keep temp file on failure for retry/debug.
        raise VideoExtractionError("Video audio extraction failed.")

    # Record the extracted audio as the track original.
    track.original_file_path = storage.relative_media_path(destination)
    track.status = "processing"
    db.commit()

    # Temp video lifecycle: delete the exact temp file after successful extraction.
    # On failure the file is kept for retry/debug; on success it is no longer needed.
    try:
        temp_video_path.unlink()
    except OSError:
        pass

    # Run standard audio processing (metadata, playback MP3, duplicate signals).
    # process_track handles its own failure and marks the track failed internally.
    process_track(db, track.id, storage)


def _existing_original_path(track: Track, storage: MediaStorage) -> Path | None:
    """Return the resolved original path if it exists on disk, else None."""
    if not track.original_file_path:
        return None
    try:
        path = storage.stored_media_path(track.original_file_path)
    except UnsafeMediaPathError:
        return None
    return path if path.is_file() else None


def _extracted_audio_filename(track_title: str) -> str:
    safe = sanitize_filename(track_title, fallback="extracted_audio")
    stem = Path(safe).stem or "extracted_audio"
    return f"{stem}.mp3"


def _is_temporary_video_path(path: Path, storage: MediaStorage) -> bool:
    try:
        temp_root = resolve_media_path(
            storage.settings.media_root,
            storage.settings.temp_videos_dir,
        )
    except UnsafeMediaPathError:
        return False
    return path.resolve(strict=False).is_relative_to(temp_root)


def _fail_track(db: Session, track_id: int) -> None:
    track = db.get(Track, track_id)
    if track is not None:
        track.status = "failed"
        db.commit()
