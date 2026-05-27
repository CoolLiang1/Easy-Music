from pathlib import Path

import pytest

from app.core.config import Settings
from app.media.paths import UnsafeMediaPathError, resolve_media_path, sanitize_filename
from app.media.storage import MediaStorage


def test_sanitize_filename_removes_path_segments_and_unsafe_characters() -> None:
    assert sanitize_filename("../AC/DC: Live?.mp3") == "DC_Live.mp3"


def test_original_upload_path_uses_user_and_track_layout(tmp_path: Path) -> None:
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    path = storage.original_upload_path(
        user_id=7,
        track_id=42,
        filename="../My Song?.FLAC",
    )

    assert path.is_relative_to(tmp_path)
    assert path.parent == tmp_path / "originals" / "user-7" / "track-42"
    assert path.suffix == ".flac"
    assert "My_Song" in path.name
    assert path.name != "My_Song.flac"
    assert ".." not in path.parts


def test_playback_mp3_path_uses_user_and_track_layout(tmp_path: Path) -> None:
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    path = storage.playback_mp3_path(user_id=7, track_id=42)

    assert path == tmp_path / "playback" / "user-7" / "track-42" / "playback.mp3"


def test_config_rejects_media_directories_that_escape_media_root(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        Settings(media_root=str(tmp_path), originals_dir="../outside")


def test_resolved_paths_cannot_escape_media_root(tmp_path: Path) -> None:
    with pytest.raises(UnsafeMediaPathError):
        resolve_media_path(tmp_path, "..", "outside.mp3")
