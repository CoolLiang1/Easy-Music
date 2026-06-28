from pathlib import Path
import hashlib

from app.models.track import Track
from app.services.duplicate_signals import (
    build_normalized_metadata_key,
    collect_file_duplicate_signal,
)


def test_track_model_has_duplicate_signal_fields() -> None:
    columns = Track.__table__.columns

    assert "original_file_size_bytes" in columns
    assert "original_file_sha256" in columns
    assert "playback_file_sha256" in columns
    assert "normalized_metadata_key" in columns


def test_collect_file_duplicate_signal_hashes_saved_file(tmp_path: Path) -> None:
    media_path = tmp_path / "original.mp3"
    media_path.write_bytes(b"audio bytes")

    signal = collect_file_duplicate_signal(media_path)

    assert signal is not None
    assert signal.size_bytes == len(b"audio bytes")
    assert signal.sha256 == hashlib.sha256(b"audio bytes").hexdigest()


def test_collect_file_duplicate_signal_returns_none_for_missing_file(tmp_path: Path) -> None:
    assert collect_file_duplicate_signal(tmp_path / "missing.mp3") is None


def test_build_normalized_metadata_key_uses_stable_metadata_parts() -> None:
    key = build_normalized_metadata_key(
        title="  My   Song ",
        artist="ARTIST",
        album=" Album ",
        duration_seconds=123,
    )

    assert key == "title=my song|artist=artist|album=album|duration=123"


def test_build_normalized_metadata_key_returns_none_without_enough_data() -> None:
    assert (
        build_normalized_metadata_key(
            title=None,
            artist=None,
            album="Album Only",
            duration_seconds=None,
        )
        is None
    )
