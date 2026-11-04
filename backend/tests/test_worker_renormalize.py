from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.storage import MediaStorage
from app.models.track import Track
from app.models.user import User
from app.services.processing import LOUDNESS_VERSION, TrackProcessingError
from app.worker.renormalize import run


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with sessionmaker(bind=engine)() as session:
        yield session


def seed(db_session: Session) -> list[Track]:
    user = User(username="owner", password_hash="hash")
    db_session.add(user)
    db_session.flush()
    tracks = [
        Track(user_id=user.id, title="old", original_file_path="o/1", status="ready"),
        Track(
            user_id=user.id,
            title="current",
            original_file_path="o/2",
            status="ready",
            loudness_version=LOUDNESS_VERSION,
        ),
        Track(user_id=user.id, title="failed upload", original_file_path="o/3", status="failed"),
        Track(user_id=user.id, title="old too", original_file_path="o/4", status="ready"),
    ]
    db_session.add_all(tracks)
    db_session.commit()
    return tracks


def test_run_regenerates_only_outdated_ready_tracks_and_reports_failures(
    db_session: Session,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    tracks = seed(db_session)
    seen: list[int] = []

    def fake_regenerate(db: Session, track_id: int, storage: MediaStorage) -> Track:
        seen.append(track_id)
        if track_id == tracks[3].id:
            raise TrackProcessingError("boom")
        track = db.get(Track, track_id)
        assert track is not None
        track.loudness_lufs = -12.0
        track.playback_gain_db = -4.0
        return track

    exit_code = run(
        db_session,
        MediaStorage(Settings(media_root=str(tmp_path))),
        regenerate=fake_regenerate,
    )

    assert seen == [tracks[0].id, tracks[3].id]
    assert exit_code == 1
    output = capsys.readouterr().out
    assert "-12.0 LUFS, gain -4.0 dB" in output
    assert f"Failed track ids: {tracks[3].id}" in output


def test_run_dry_run_lists_tracks_without_regenerating(
    db_session: Session,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    tracks = seed(db_session)

    def must_not_run(*args: object, **kwargs: object) -> Track:
        raise AssertionError("dry run must not regenerate")

    exit_code = run(
        db_session,
        MediaStorage(Settings(media_root=str(tmp_path))),
        include_current=True,
        dry_run=True,
        regenerate=must_not_run,
    )

    assert exit_code == 0
    assert (
        f"3 track(s) would be regenerated: {tracks[0].id}, {tracks[1].id}, {tracks[3].id}"
        in capsys.readouterr().out
    )
