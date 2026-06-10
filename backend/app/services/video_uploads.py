from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.media.storage import MediaStorage
from app.models.track import Track
from app.models.user import User
from app.services.jobs import VIDEO_EXTRACTION_JOB_TYPE, create_processing_job


ALLOWED_VIDEO_UPLOAD_TYPES = {
    ".mkv": {"video/x-matroska", "video/matroska"},
    ".mov": {"video/quicktime"},
    ".mp4": {"video/mp4"},
    ".webm": {"video/webm"},
}

VIDEO_UPLOAD_CHUNK_SIZE = 1024 * 1024


def unsupported_video_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Unsupported video upload type.",
    )


def video_too_large_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail="Video upload exceeds the configured size limit.",
    )


def validate_video_upload_file(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_UPLOAD_TYPES:
        raise unsupported_video_error()

    if file.content_type not in ALLOWED_VIDEO_UPLOAD_TYPES[suffix]:
        raise unsupported_video_error()

    return suffix.removeprefix(".")


def save_video_upload(source: BinaryIO, destination: Path, max_bytes: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    bytes_written = 0

    with destination.open("xb") as output:
        while chunk := source.read(VIDEO_UPLOAD_CHUNK_SIZE):
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                raise video_too_large_error()
            output.write(chunk)

    return bytes_written


def create_video_upload_track(
    db: Session,
    user: User,
    file: UploadFile,
    storage: MediaStorage,
) -> Track:
    upload_format = validate_video_upload_file(file)
    filename = file.filename or f"video.{upload_format}"
    title = Path(filename.replace("\\", "/")).name
    title = Path(title).stem or "Untitled Video"

    track = Track(
        user_id=user.id,
        title=title,
        content_type="song",
        status="uploading",
        format=upload_format,
    )
    db.add(track)
    db.flush()

    destination = storage.temporary_video_path(user.id, track.id, filename)
    max_bytes = storage.settings.max_video_upload_mb * 1024 * 1024

    try:
        save_video_upload(file.file, destination, max_bytes)
        validate_saved_video_signature(destination, upload_format)
    except Exception:
        db.rollback()
        if destination.exists():
            destination.unlink()
        raise

    track.status = "processing"
    create_processing_job(
        db,
        track,
        job_type=VIDEO_EXTRACTION_JOB_TYPE,
        source_path=storage.relative_media_path(destination),
    )
    db.commit()
    db.refresh(track)
    return track


def validate_saved_video_signature(path: Path, upload_format: str) -> None:
    header = path.read_bytes()[:16]
    if upload_format in {"mp4", "mov"}:
        is_valid = len(header) >= 12 and header[4:8] == b"ftyp"
    elif upload_format in {"mkv", "webm"}:
        is_valid = header.startswith(b"\x1a\x45\xdf\xa3")
    else:
        is_valid = False

    if not is_valid:
        raise unsupported_video_error()
