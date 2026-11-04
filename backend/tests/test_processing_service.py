from collections.abc import Generator
import hashlib
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.ffmpeg import FFmpegError, LoudnessMeasurement
from app.media.metadata import MediaMetadata
from app.media.storage import MediaStorage
from app.models.track import Track
from app.models.user import User
from app.services.processing import (
    LOUDNESS_VERSION,
    TrackProcessingError,
    list_tracks_needing_loudness_normalization,
    process_track,
    regenerate_track_playback,
)


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        yield session


def create_user(db_session: Session) -> User:
    user = User(username="owner", password_hash="hash")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def create_processing_track(db_session: Session, user: User, original_path: str) -> Track:
    track = Track(
        user_id=user.id,
        title="Uploaded Name",
        content_type="song",
        original_file_path=original_path,
        status="processing",
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_process_track_extracts_metadata_generates_playback_and_marks_ready(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = tmp_path / "originals" / "user-1" / "track-1" / "source.flac"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track = create_processing_track(
        db_session,
        user,
        original.relative_to(tmp_path).as_posix(),
    )
    storage = MediaStorage(Settings(media_root=str(tmp_path)))
    generated_paths: list[tuple[Path, Path]] = []

    def metadata_extractor(source_path: Path, **kwargs: object) -> MediaMetadata:
        assert source_path == original
        return MediaMetadata(
            duration_seconds=124,
            format="flac",
            bitrate=900000,
            title="Tagged Title",
            artist="Tagged Artist",
            album="Tagged Album",
        )

    def playback_generator(source_path: Path, destination_path: Path, **kwargs: object) -> None:
        generated_paths.append((source_path, destination_path))
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_path.write_bytes(b"mp3")

    processed = process_track(
        db_session,
        track.id,
        storage,
        metadata_extractor=metadata_extractor,
        playback_generator=playback_generator,
    )

    assert processed.status == "ready"
    assert processed.title == "Tagged Title"
    assert processed.artist == "Tagged Artist"
    assert processed.album == "Tagged Album"
    assert processed.duration_seconds == 124
    assert processed.format == "flac"
    assert processed.bitrate == 900000
    assert processed.playback_file_path == "playback/user-1/track-1/playback.mp3"
    assert processed.original_file_size_bytes == len(b"audio")
    assert processed.original_file_sha256 == hashlib.sha256(b"audio").hexdigest()
    assert processed.playback_file_sha256 == hashlib.sha256(b"mp3").hexdigest()
    assert (
        processed.normalized_metadata_key
        == "title=tagged title|artist=tagged artist|album=tagged album|duration=124"
    )
    assert generated_paths == [(original, tmp_path / processed.playback_file_path)]


def test_process_track_can_be_rerun_without_corrupting_track_state(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = tmp_path / "originals" / "user-1" / "track-1" / "source.mp3"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track = create_processing_track(
        db_session,
        user,
        original.relative_to(tmp_path).as_posix(),
    )
    storage = MediaStorage(Settings(media_root=str(tmp_path)))
    metadata = MediaMetadata(10, "mp3", 128000, None, None, None)

    for _ in range(2):
        processed = process_track(
            db_session,
            track.id,
            storage,
            metadata_extractor=lambda *args, **kwargs: metadata,
            playback_generator=lambda *args, **kwargs: None,
        )

    assert processed.status == "ready"
    assert processed.title == "Uploaded Name"
    assert processed.playback_file_path == "playback/user-1/track-1/playback.mp3"
    assert processed.playback_file_sha256 is None


def test_process_track_marks_failed_when_media_processing_fails(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = tmp_path / "originals" / "user-1" / "track-1" / "broken.wav"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track = create_processing_track(
        db_session,
        user,
        original.relative_to(tmp_path).as_posix(),
    )
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    def fail_playback(*args: object, **kwargs: object) -> None:
        raise FFmpegError("failed", executable="ffmpeg", args=["ffmpeg"])

    with pytest.raises(TrackProcessingError):
        process_track(
            db_session,
            track.id,
            storage,
            metadata_extractor=lambda *args, **kwargs: MediaMetadata(None, None, None, None, None, None),
            playback_generator=fail_playback,
        )

    db_session.refresh(track)
    assert track.status == "failed"
    assert track.playback_file_path is None


def test_process_track_raises_when_track_is_missing(
    db_session: Session,
    tmp_path: Path,
) -> None:
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    with pytest.raises(TrackProcessingError, match="was not found"):
        process_track(db_session, 999, storage)


def loud_measurer(*args: object, **kwargs: object) -> LoudnessMeasurement:
    return LoudnessMeasurement(integrated_lufs=-9.0, true_peak_dbtp=0.5)


def failing_measurer(*args: object, **kwargs: object) -> LoudnessMeasurement:
    raise FFmpegError("measure failed", executable="ffmpeg", args=["ffmpeg"])


def write_playback(gains: list[float | None]):
    def generator(source_path: Path, destination_path: Path, **kwargs: object) -> None:
        gain = kwargs.get("gain_db")
        gains.append(gain)  # type: ignore[arg-type]
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_path.write_bytes(f"mp3 gain={gain}".encode())

    return generator


def create_original(tmp_path: Path) -> Path:
    original = tmp_path / "originals" / "user-1" / "track-1" / "source.flac"
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(b"audio")
    return original


def flac_metadata(*args: object, **kwargs: object) -> MediaMetadata:
    return MediaMetadata(10, "flac", None, None, None, None)


def test_process_track_applies_loudness_gain_and_records_measurement(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_processing_track(db_session, user, original.relative_to(tmp_path).as_posix())
    storage = MediaStorage(Settings(media_root=str(tmp_path)))
    gains: list[float | None] = []

    processed = process_track(
        db_session,
        track.id,
        storage,
        metadata_extractor=flac_metadata,
        playback_generator=write_playback(gains),
        loudness_measurer=loud_measurer,
    )

    # -16 LUFS target needs -7 dB; the -1 dBTP ceiling would allow -1.5 dB,
    # so the stronger attenuation wins.
    assert gains == [-7.0]
    assert processed.status == "ready"
    assert processed.loudness_lufs == -9.0
    assert processed.true_peak_dbtp == 0.5
    assert processed.playback_gain_db == -7.0
    assert processed.loudness_version == LOUDNESS_VERSION
    assert processed.playback_file_sha256 == hashlib.sha256(b"mp3 gain=-7.0").hexdigest()


def test_process_track_falls_back_without_gain_when_measurement_fails(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_processing_track(db_session, user, original.relative_to(tmp_path).as_posix())
    storage = MediaStorage(Settings(media_root=str(tmp_path)))
    gains: list[float | None] = []

    processed = process_track(
        db_session,
        track.id,
        storage,
        metadata_extractor=flac_metadata,
        playback_generator=write_playback(gains),
        loudness_measurer=failing_measurer,
    )

    assert gains == [None]
    assert processed.status == "ready"
    assert processed.playback_gain_db is None
    assert processed.loudness_version is None


def test_process_track_skips_measurement_when_normalization_disabled(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_processing_track(db_session, user, original.relative_to(tmp_path).as_posix())
    storage = MediaStorage(
        Settings(media_root=str(tmp_path), playback_loudness_normalization=False)
    )
    gains: list[float | None] = []

    def must_not_measure(*args: object, **kwargs: object) -> LoudnessMeasurement:
        raise AssertionError("measurement should be skipped")

    processed = process_track(
        db_session,
        track.id,
        storage,
        metadata_extractor=flac_metadata,
        playback_generator=write_playback(gains),
        loudness_measurer=must_not_measure,
    )

    assert gains == [None]
    assert processed.loudness_version is None


def create_ready_track(db_session: Session, user: User, original_path: str) -> Track:
    track = Track(
        user_id=user.id,
        title="Owner Edited Title",
        artist="Owner Edited Artist",
        content_type="song",
        original_file_path=original_path,
        playback_file_path="playback/user-1/track-1/playback.mp3",
        status="ready",
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_regenerate_track_playback_preserves_metadata_and_updates_loudness(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_ready_track(db_session, user, original.relative_to(tmp_path).as_posix())
    storage = MediaStorage(Settings(media_root=str(tmp_path)))
    gains: list[float | None] = []

    regenerated = regenerate_track_playback(
        db_session,
        track.id,
        storage,
        playback_generator=write_playback(gains),
        loudness_measurer=loud_measurer,
    )

    assert gains == [-7.0]
    assert regenerated.status == "ready"
    assert regenerated.title == "Owner Edited Title"
    assert regenerated.artist == "Owner Edited Artist"
    assert regenerated.loudness_version == LOUDNESS_VERSION
    assert (tmp_path / "playback/user-1/track-1/playback.mp3").read_bytes() == b"mp3 gain=-7.0"
    assert list_tracks_needing_loudness_normalization(db_session) == []
    assert list_tracks_needing_loudness_normalization(db_session, include_current=True) == [
        track.id
    ]


def test_regenerate_track_playback_failure_keeps_track_ready(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_ready_track(db_session, user, original.relative_to(tmp_path).as_posix())
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    def fail_playback(*args: object, **kwargs: object) -> None:
        raise FFmpegError("failed", executable="ffmpeg", args=["ffmpeg"])

    with pytest.raises(TrackProcessingError, match="regeneration failed"):
        regenerate_track_playback(
            db_session,
            track.id,
            storage,
            playback_generator=fail_playback,
            loudness_measurer=loud_measurer,
        )

    db_session.refresh(track)
    assert track.status == "ready"
    assert track.loudness_version is None
    assert list_tracks_needing_loudness_normalization(db_session) == [track.id]


def test_regenerate_track_playback_rejects_tracks_that_are_not_ready(
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    original = create_original(tmp_path)
    track = create_processing_track(db_session, user, original.relative_to(tmp_path).as_posix())

    with pytest.raises(TrackProcessingError, match="not ready"):
        regenerate_track_playback(
            db_session,
            track.id,
            MediaStorage(Settings(media_root=str(tmp_path))),
        )

    assert list_tracks_needing_loudness_normalization(db_session) == []
