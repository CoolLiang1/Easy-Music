from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.ffmpeg import FFmpegError
from app.media.metadata import MediaMetadata
from app.media.storage import MediaStorage
from app.models.track import Track
from app.models.user import User
from app.services.processing import TrackProcessingError, process_track


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
