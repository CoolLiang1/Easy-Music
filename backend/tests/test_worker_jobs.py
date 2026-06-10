from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User
from app.services.jobs import create_processing_job
from app.worker import jobs as worker_jobs


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


def create_track_with_job(
    db_session: Session,
    user: User,
    original_path: str,
) -> tuple[Track, ProcessingJob]:
    track = Track(
        user_id=user.id,
        title="Uploaded Name",
        content_type="song",
        original_file_path=original_path,
        status="processing",
    )
    db_session.add(track)
    db_session.flush()
    job = create_processing_job(db_session, track)
    db_session.commit()
    db_session.refresh(track)
    db_session.refresh(job)
    return track, job


def test_process_next_job_marks_job_succeeded(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = create_user(db_session)
    original = tmp_path / "originals" / "user-1" / "track-1" / "source.mp3"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track, job = create_track_with_job(
        db_session,
        user,
        original.relative_to(tmp_path).as_posix(),
    )
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    def process_track_stub(db: Session, track_id: int, storage: MediaStorage) -> Track:
        processed_track = db.get(Track, track_id)
        assert processed_track is not None
        processed_track.status = "ready"
        db.commit()
        db.refresh(processed_track)
        return processed_track

    monkeypatch.setattr(worker_jobs, "process_track", process_track_stub)

    processed_job = worker_jobs.process_next_job(db_session, storage)

    assert processed_job is not None
    assert processed_job.id == job.id
    assert processed_job.status == "succeeded"
    assert processed_job.error_message is None
    assert processed_job.started_at is not None
    assert processed_job.finished_at is not None
    db_session.refresh(track)
    assert track.status == "ready"


def test_process_next_job_marks_job_failed_with_error_message(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = create_user(db_session)
    track, job = create_track_with_job(db_session, user, "originals/missing.mp3")
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    def process_track_stub(db: Session, track_id: int, storage: MediaStorage) -> Track:
        failed_track = db.get(Track, track_id)
        assert failed_track is not None
        failed_track.status = "failed"
        db.commit()
        raise RuntimeError("ffmpeg failed")

    monkeypatch.setattr(worker_jobs, "process_track", process_track_stub)

    processed_job = worker_jobs.process_next_job(db_session, storage)

    assert processed_job is not None
    assert processed_job.id == job.id
    assert processed_job.status == "failed"
    assert processed_job.error_message == "ffmpeg failed"
    assert processed_job.started_at is not None
    assert processed_job.finished_at is not None
    db_session.refresh(track)
    assert track.status == "failed"


def test_process_next_job_returns_none_when_no_pending_jobs(db_session: Session) -> None:
    assert worker_jobs.process_next_job(db_session, MediaStorage()) is None


def test_process_next_job_ignores_video_extraction_jobs(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = create_user(db_session)
    track = Track(
        user_id=user.id,
        title="Video",
        content_type="song",
        status="processing",
    )
    db_session.add(track)
    db_session.flush()
    job = ProcessingJob(
        track_id=track.id,
        status="pending",
        job_type="video_extraction",
        source_path="temp-videos/user-1/track-1/source.mp4",
    )
    db_session.add(job)
    db_session.commit()

    def process_track_stub(*args, **kwargs) -> Track:
        raise AssertionError("video extraction jobs should wait for V2.7 worker support")

    monkeypatch.setattr(worker_jobs, "process_track", process_track_stub)

    processed_job = worker_jobs.process_next_job(
        db_session,
        MediaStorage(Settings(media_root=str(tmp_path))),
    )

    assert processed_job is None
    db_session.refresh(job)
    db_session.refresh(track)
    assert job.status == "pending"
    assert track.status == "processing"
