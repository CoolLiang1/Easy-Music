from pathlib import Path
from uuid import uuid4

from app.core.config import Settings, get_settings
from app.media.paths import resolve_media_path, sanitize_filename


class MediaStorage:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def original_upload_path(self, user_id: int, track_id: int, filename: str) -> Path:
        safe_name = sanitize_filename(filename)
        stem = Path(safe_name).stem or "upload"
        suffix = Path(safe_name).suffix.lower()
        stored_name = f"{uuid4().hex}_{stem}{suffix}"
        return resolve_media_path(
            self.settings.media_root,
            self.settings.originals_dir,
            f"user-{user_id}",
            f"track-{track_id}",
            stored_name,
        )

    def playback_mp3_path(self, user_id: int, track_id: int) -> Path:
        return resolve_media_path(
            self.settings.media_root,
            self.settings.playback_dir,
            f"user-{user_id}",
            f"track-{track_id}",
            "playback.mp3",
        )

    def cover_image_path(self, user_id: int, track_id: int, suffix: str) -> Path:
        normalized_suffix = suffix if suffix.startswith(".") else f".{suffix}"
        stored_name = f"{uuid4().hex}_cover{normalized_suffix.lower()}"
        return resolve_media_path(
            self.settings.media_root,
            self.settings.covers_dir,
            f"user-{user_id}",
            f"track-{track_id}",
            stored_name,
        )

    def relative_media_path(self, path: Path) -> str:
        root = Path(self.settings.media_root).resolve(strict=False)
        return path.resolve(strict=False).relative_to(root).as_posix()

    def stored_media_path(self, relative_path: str) -> Path:
        return resolve_media_path(self.settings.media_root, relative_path)


def get_media_storage() -> MediaStorage:
    return MediaStorage()
