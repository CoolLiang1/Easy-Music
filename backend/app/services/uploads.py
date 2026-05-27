from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.media.storage import MediaStorage
from app.models.track import Track
from app.models.user import User


ALLOWED_UPLOAD_TYPES = {
    ".flac": {"audio/flac", "audio/x-flac"},
    ".m4a": {"audio/mp4", "audio/m4a", "audio/x-m4a"},
    ".mp3": {"audio/mpeg", "audio/mp3"},
    ".ogg": {"audio/ogg", "application/ogg"},
    ".wav": {"audio/wav", "audio/x-wav", "audio/wave"},
}

UPLOAD_CHUNK_SIZE = 1024 * 1024


def unsupported_file_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Unsupported audio upload type.",
    )


def upload_too_large_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail="Upload exceeds the configured size limit.",
    )


def validate_upload_file(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_TYPES:
        raise unsupported_file_error()

    if file.content_type not in ALLOWED_UPLOAD_TYPES[suffix]:
        raise unsupported_file_error()

    return suffix.removeprefix(".")


def save_upload_file(source: BinaryIO, destination: Path, max_bytes: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    bytes_written = 0

    with destination.open("xb") as output:
        while chunk := source.read(UPLOAD_CHUNK_SIZE):
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                raise upload_too_large_error()
            output.write(chunk)


def create_uploaded_track(
    db: Session,
    user: User,
    file: UploadFile,
    storage: MediaStorage,
) -> Track:
    upload_format = validate_upload_file(file)
    filename = file.filename or f"upload.{upload_format}"
    title = Path(filename.replace("\\", "/")).name
    title = Path(title).stem or "Untitled Upload"

    track = Track(
        user_id=user.id,
        title=title,
        content_type="song",
        status="uploading",
        format=upload_format,
    )
    db.add(track)
    db.flush()

    destination = storage.original_upload_path(user.id, track.id, filename)
    max_bytes = storage.settings.max_upload_mb * 1024 * 1024

    try:
        save_upload_file(file.file, destination, max_bytes)
    except Exception:
        db.rollback()
        if destination.exists():
            destination.unlink()
        raise

    track.original_file_path = storage.relative_media_path(destination)
    track.status = "processing"
    db.commit()
    db.refresh(track)
    return track
