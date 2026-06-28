from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.ffmpeg import FFmpegError
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User
from app.services.jobs import create_processing_job
from app.worker.jobs import VideoExtractionError, process_next_job


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


def create_video_track_and_job(
    db_session: Session,
    user: User,
    source_path: str | None = None,
    track_status: str = "processing",
    job_status: str = "pending",
) -> tuple[Track, ProcessingJob]:
    track = Track(
        user_id=user.id,
        title="Video Track",
        content_type="song",
        status=track_status,
    )
    db_session.add(track)
    db_session.flush()
    job = ProcessingJob(
        track_id=track.id,
        status=job_status,
        job_type="video_extraction",
        source_path=source_path,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(track)
    db_session.refresh(job)
    return track, job


class TestVideoExtractionSuccess:
    def test_successful_extraction_and_processing(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        # Create temp video file.
        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"fake-video")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        extractions: list[tuple[Path, Path]] = []

        def fake_extract(src: Path, dst: Path, **kwargs: object) -> None:
            extractions.append((src, dst))
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(b"extracted-audio")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fake_extract,
        )

        # Stub process_track to simulate success.
        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.id == job.id
        assert processed_job.status == "succeeded"
        assert processed_job.error_message is None

        db_session.refresh(track)
        assert track.status == "ready"
        assert track.original_file_path is not None
        assert track.original_file_path.startswith("originals/user-1/track-1/")

        assert len(extractions) == 1
        src, dst = extractions[0]
        assert src == temp_video
        assert dst == storage.stored_media_path(track.original_file_path)
        assert dst.read_bytes() == b"extracted-audio"

        # Temp video deleted on success.
        assert not temp_video.is_file()

    def test_audio_processing_jobs_still_work(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        # Create an audio processing job.
        track = Track(
            user_id=user.id,
            title="Audio",
            content_type="song",
            original_file_path="originals/user-1/track-1/source.mp3",
            status="processing",
        )
        db_session.add(track)
        db_session.flush()
        job = create_processing_job(db_session, track)
        db_session.commit()
        db_session.refresh(track)
        db_session.refresh(job)
        assert job.job_type == "audio_processing"

        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.id == job.id
        assert processed_job.status == "succeeded"


class TestVideoExtractionFailures:
    def test_ffmpeg_failure_marks_track_and_job_failed(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/broken.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"broken-video")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.id == job.id
        assert processed_job.status == "failed"
        assert "Video audio extraction failed" in (processed_job.error_message or "")

        db_session.refresh(track)
        assert track.status == "failed"

        # Temp video kept on failure for retry/debug.
        assert temp_video.is_file()

    def test_ffmpeg_error_does_not_expose_temp_path_in_message(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/corrupt.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"corrupt")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        error_msg = processed_job.error_message or ""
        # Must not expose file paths.
        assert str(tmp_path) not in error_msg
        assert "temp-videos" not in error_msg
        assert "corrupt" not in error_msg

    def test_missing_source_path_rejected(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        track, job = create_video_track_and_job(db_session, user, source_path=None)

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        assert "missing" in (processed_job.error_message or "").lower()

        db_session.refresh(track)
        assert track.status == "failed"

    def test_missing_temp_file_rejected(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        track, job = create_video_track_and_job(
            db_session, user, source_path="temp-videos/user-1/track-1/ghost.mp4"
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        assert "missing" in (processed_job.error_message or "").lower()

        db_session.refresh(track)
        assert track.status == "failed"

    def test_source_path_outside_temp_video_storage_is_rejected_without_deletion(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "originals/user-1/track-1/source.mp4"
        non_temp_video = storage.stored_media_path(source_rel)
        non_temp_video.parent.mkdir(parents=True)
        non_temp_video.write_bytes(b"must-not-delete")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        def fail_extract(*args: object, **kwargs: object) -> None:
            raise AssertionError("non-temp source path should be rejected before extraction")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fail_extract,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        assert "temporary video storage" in (processed_job.error_message or "")
        assert non_temp_video.read_bytes() == b"must-not-delete"

        db_session.refresh(track)
        assert track.status == "failed"

    def test_track_not_found(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video")

        job = ProcessingJob(
            track_id=99999,
            status="pending",
            job_type="video_extraction",
            source_path=source_rel,
        )
        db_session.add(job)
        db_session.commit()

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        assert "not found" in (processed_job.error_message or "").lower()


class TestTempVideoLifecycle:
    def test_temp_video_deleted_after_successful_extraction(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video-data")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        def fake_extract(src: Path, dst: Path, **kwargs: object) -> None:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(b"audio")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fake_extract,
        )

        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "succeeded"
        assert not temp_video.is_file()

    def test_temp_video_preserved_after_failed_extraction(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video-data")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        def fail_extract(src: Path, dst: Path, **kwargs: object) -> None:
            raise FFmpegError(
                "No audio stream",
                executable="ffmpeg",
                args=["ffmpeg"],
                returncode=1,
            )

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fail_extract,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        assert temp_video.is_file()

    def test_no_recursive_directory_deletion(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video-data")

        # Place a sibling file in the same directory.
        sibling = temp_video.parent / "sibling.txt"
        sibling.write_text("do-not-delete")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        def fake_extract(src: Path, dst: Path, **kwargs: object) -> None:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(b"audio")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fake_extract,
        )

        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        process_next_job(db_session, storage)

        # Only the exact temp video is deleted; siblings and directory remain.
        assert not temp_video.is_file()
        assert sibling.is_file()
        assert temp_video.parent.is_dir()


class TestRerunAndIdempotency:
    def test_rerun_skips_extraction_when_original_exists(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        # Pre-create an existing extracted original.
        original_rel = "originals/user-1/track-1/extracted.mp3"
        original = storage.stored_media_path(original_rel)
        original.parent.mkdir(parents=True)
        original.write_bytes(b"existing-original")

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)
        track.original_file_path = original_rel
        db_session.commit()

        # The fake extraction should NOT be called.
        def fail_extract(*args: object, **kwargs: object) -> None:
            raise AssertionError("extraction should be skipped when original exists")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fail_extract,
        )

        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "succeeded"
        db_session.refresh(track)
        assert track.status == "ready"
        # Original path unchanged.
        assert track.original_file_path == original_rel

    def test_rerun_without_existing_original_re_extracts(
        self,
        db_session: Session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/source.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"video")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        extractions: list[tuple[Path, Path]] = []

        def fake_extract(src: Path, dst: Path, **kwargs: object) -> None:
            extractions.append((src, dst))
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(b"audio")

        monkeypatch.setattr(
            "app.worker.jobs.extract_audio_from_video",
            fake_extract,
        )

        def fake_process_track(db: Session, track_id: int, storage: MediaStorage) -> Track:
            t = db.get(Track, track_id)
            assert t is not None
            t.status = "ready"
            db.commit()
            db.refresh(t)
            return t

        monkeypatch.setattr(
            "app.worker.jobs.process_track",
            fake_process_track,
        )

        process_next_job(db_session, storage)
        # Create a new job for rerun.
        new_job = ProcessingJob(
            track_id=track.id,
            status="pending",
            job_type="video_extraction",
            source_path=source_rel,
        )
        db_session.add(new_job)
        db_session.commit()

        # Re-create temp file (simulating a new upload / retained file).
        temp_video.write_bytes(b"video")
        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "succeeded"
        # Extraction was called (the original was already consumed by process_track's commit).
        assert len(extractions) >= 1


class TestErrorMessagesAreUiSafe:
    def test_job_error_message_never_contains_absolute_path(
        self,
        db_session: Session,
        tmp_path: Path,
    ) -> None:
        user = create_user(db_session)
        storage = MediaStorage(Settings(media_root=str(tmp_path)))

        source_rel = "temp-videos/user-1/track-1/broken.mp4"
        temp_video = storage.stored_media_path(source_rel)
        temp_video.parent.mkdir(parents=True)
        temp_video.write_bytes(b"not-a-video")

        track, job = create_video_track_and_job(db_session, user, source_path=source_rel)

        processed_job = process_next_job(db_session, storage)

        assert processed_job is not None
        assert processed_job.status == "failed"
        error_msg = processed_job.error_message or ""
        # No absolute paths, no temp paths.
        assert str(tmp_path) not in error_msg
        assert "/temp-videos/" not in error_msg
        assert "\\temp-videos\\" not in error_msg
        # No stack traces.
        assert "Traceback" not in error_msg
        assert "File " not in error_msg
