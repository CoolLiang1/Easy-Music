"""Automatic covers: FFmpeg extraction, processing, video frames, backfill.

No real ffmpeg is called: fake runners and extractors stand in for it.
"""

from __future__ import annotations

import subprocess
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.media.ffmpeg import COVER_MAX_EDGE_PX, LoudnessMeasurement, extract_cover_image
from app.media.metadata import MediaMetadata
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User
from app.services.covers import attach_extracted_cover, list_tracks_without_cover, video_frame_seek_seconds
from app.services.jobs import VIDEO_EXTRACTION_JOB_TYPE
from app.services.processing import process_track
from app.worker import covers as covers_cli
from app.worker.jobs import process_next_job


# ---------------------------------------------------------------------------
# extract_cover_image
# ---------------------------------------------------------------------------


def _runner(returncode: int, *, write: bytes | None = b"jpeg") -> tuple[list[list[str]], Any]:
    calls: list[list[str]] = []

    def run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if write is not None:
            Path(args[-1]).write_bytes(write)
        return subprocess.CompletedProcess(args, returncode, "", "")

    return calls, run


def test_extract_cover_writes_jpeg_from_first_picture_stream(tmp_path: Path) -> None:
    destination = tmp_path / "covers" / "c.jpg"
    calls, run = _runner(0)

    assert extract_cover_image(tmp_path / "a.m4a", destination, settings=Settings(), runner=run)

    assert destination.read_bytes() == b"jpeg"
    assert not list(destination.parent.glob("*.partial*"))
    args = calls[0]
    assert args[args.index("-map") + 1] == "0:v:0"
    assert args[args.index("-frames:v") + 1] == "1"
    assert str(COVER_MAX_EDGE_PX) in args[args.index("-vf") + 1]
    assert "-ss" not in args


def test_extract_cover_seeks_for_video_frames(tmp_path: Path) -> None:
    calls, run = _runner(0)

    extract_cover_image(tmp_path / "v.mp4", tmp_path / "c.jpg", settings=Settings(), runner=run, seek_seconds=12.5)

    args = calls[0]
    assert args[args.index("-ss") + 1] == "12.50"
    assert args.index("-ss") < args.index("-i")


@pytest.mark.parametrize(("returncode", "write"), [(1, b"partial"), (0, None), (0, b"")])
def test_extract_cover_reports_no_picture_and_leaves_nothing(
    tmp_path: Path,
    returncode: int,
    write: bytes | None,
) -> None:
    destination = tmp_path / "c.jpg"
    _, run = _runner(returncode, write=write)

    assert not extract_cover_image(tmp_path / "a.mp3", destination, settings=Settings(), runner=run)
    assert list(tmp_path.iterdir()) == []


def test_extract_cover_without_ffmpeg_is_not_an_error(tmp_path: Path) -> None:
    def missing(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("ffmpeg")

    assert not extract_cover_image(tmp_path / "a.mp3", tmp_path / "c.jpg", settings=Settings(), runner=missing)


def test_video_frame_seek_skips_intros_and_caps() -> None:
    assert video_frame_seek_seconds(None) is None
    assert video_frame_seek_seconds(0) is None
    assert video_frame_seek_seconds(50) == 10
    assert video_frame_seek_seconds(3600) == 60


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with sessionmaker(autocommit=False, autoflush=False, bind=engine)() as session:
        yield session


@pytest.fixture
def storage(tmp_path: Path) -> MediaStorage:
    return MediaStorage(Settings(media_root=str(tmp_path)))


def create_track(
    db: Session,
    tmp_path: Path,
    *,
    cover_path: str | None = None,
    status: str = "ready",
    with_original: bool = True,
) -> Track:
    user = db.query(User).first()
    if user is None:
        user = User(username="owner", password_hash="hash")
        db.add(user)
        db.commit()
    track = Track(user_id=user.id, title="Song", status=status, cover_path=cover_path)
    db.add(track)
    db.commit()
    if with_original:
        original = tmp_path / "originals" / f"track-{track.id}" / "source.m4a"
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_bytes(b"audio")
        track.original_file_path = original.relative_to(tmp_path).as_posix()
        db.commit()
    return track


def writing_extractor(calls: list[tuple[Path, float | None]] | None = None, *, found: bool = True):
    def extract(source: Path, destination: Path, **kwargs: Any) -> bool:
        if calls is not None:
            calls.append((source, kwargs.get("seek_seconds")))
        if found:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(b"jpeg")
        return found

    return extract


# ---------------------------------------------------------------------------
# attach_extracted_cover
# ---------------------------------------------------------------------------


def test_attach_sets_cover_when_track_has_none(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path)

    assert attach_extracted_cover(track, tmp_path / "x.m4a", storage, extractor=writing_extractor())

    assert track.cover_path and track.cover_path.endswith("_cover.jpg")
    assert storage.stored_media_path(track.cover_path).read_bytes() == b"jpeg"


def test_attach_never_replaces_an_existing_cover(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path, cover_path="covers/user-1/track-1/owner_cover.png")
    calls: list[tuple[Path, float | None]] = []

    assert not attach_extracted_cover(track, tmp_path / "x.m4a", storage, extractor=writing_extractor(calls))

    assert calls == []
    assert track.cover_path == "covers/user-1/track-1/owner_cover.png"


def test_attach_swallows_extractor_errors(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path)

    def broken(*args: Any, **kwargs: Any) -> bool:
        raise RuntimeError("boom")

    assert not attach_extracted_cover(track, tmp_path / "x.m4a", storage, extractor=broken)
    assert track.cover_path is None


# ---------------------------------------------------------------------------
# processing
# ---------------------------------------------------------------------------


def _process(db: Session, track: Track, storage: MediaStorage, extractor: Any) -> Track:
    def metadata_extractor(source: Path, **kwargs: Any) -> MediaMetadata:
        return MediaMetadata(duration_seconds=100, format="m4a", bitrate=256000, title=None, artist=None, album=None)

    def playback_generator(source: Path, destination: Path, **kwargs: Any) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"mp3")

    def loudness_measurer(source: Path, **kwargs: Any) -> LoudnessMeasurement:
        return LoudnessMeasurement(integrated_lufs=-14.0, true_peak_dbtp=-1.0)

    return process_track(
        db,
        track.id,
        storage,
        metadata_extractor=metadata_extractor,
        playback_generator=playback_generator,
        loudness_measurer=loudness_measurer,
        cover_extractor=extractor,
    )


def test_processing_extracts_embedded_artwork(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path, status="processing")

    processed = _process(db_session, track, storage, writing_extractor())

    assert processed.status == "ready"
    assert processed.cover_path is not None


def test_processing_without_artwork_still_succeeds(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path, status="processing")

    processed = _process(db_session, track, storage, writing_extractor(found=False))

    assert processed.status == "ready"
    assert processed.cover_path is None


def test_processing_keeps_an_owner_cover(db_session: Session, tmp_path: Path, storage: MediaStorage) -> None:
    track = create_track(db_session, tmp_path, status="processing", cover_path="covers/owner.png")
    calls: list[tuple[Path, float | None]] = []

    processed = _process(db_session, track, storage, writing_extractor(calls))

    assert processed.cover_path == "covers/owner.png"
    assert calls == []


# ---------------------------------------------------------------------------
# video uploads
# ---------------------------------------------------------------------------


def test_video_job_grabs_a_frame_before_deleting_the_video(
    db_session: Session,
    tmp_path: Path,
    storage: MediaStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    track = create_track(db_session, tmp_path, status="processing", with_original=False)
    video = storage.temporary_video_path(track.user_id, track.id, "clip.mp4")
    video.parent.mkdir(parents=True, exist_ok=True)
    video.write_bytes(b"video")
    db_session.add(
        ProcessingJob(
            track_id=track.id,
            job_type=VIDEO_EXTRACTION_JOB_TYPE,
            status="pending",
            source_path=storage.relative_media_path(video),
        ),
    )
    db_session.commit()
    frames: list[tuple[Path, float | None]] = []

    def fake_audio(src: Path, dst: Path, **kwargs: Any) -> None:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(b"audio")

    def fake_metadata(source: Path, **kwargs: Any) -> MediaMetadata:
        assert source == video
        return MediaMetadata(duration_seconds=200, format="mp4", bitrate=None, title=None, artist=None, album=None)

    def frame_extractor(source: Path, destination: Path, **kwargs: Any) -> bool:
        assert source.is_file(), "the video must still exist when the frame is grabbed"
        return writing_extractor(frames)(source, destination, **kwargs)

    def fake_process(db: Session, track_id: int, storage: MediaStorage) -> Track:
        processed = db.get(Track, track_id)
        processed.status = "ready"
        db.commit()
        return processed

    monkeypatch.setattr("app.worker.jobs.extract_audio_from_video", fake_audio)
    monkeypatch.setattr("app.worker.jobs.extract_metadata", fake_metadata)
    monkeypatch.setattr("app.worker.jobs.extract_cover_image", frame_extractor)
    monkeypatch.setattr("app.worker.jobs.process_track", fake_process)

    process_next_job(db_session, storage)

    db_session.expire_all()
    saved = db_session.get(Track, track.id)
    assert saved.cover_path is not None
    assert frames == [(video, 40)]
    assert not video.exists()


# ---------------------------------------------------------------------------
# backfill command
# ---------------------------------------------------------------------------


def test_backfill_fills_only_tracks_without_cover(
    db_session: Session,
    tmp_path: Path,
    storage: MediaStorage,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with_art = create_track(db_session, tmp_path)
    without_art = create_track(db_session, tmp_path)
    owner_cover = create_track(db_session, tmp_path, cover_path="covers/owner.png")
    create_track(db_session, tmp_path, status="processing")
    no_original = create_track(db_session, tmp_path, with_original=False)

    assert list_tracks_without_cover(db_session) == [with_art.id, without_art.id]
    assert no_original.id not in list_tracks_without_cover(db_session)

    def extractor(source: Path, destination: Path, **kwargs: Any) -> bool:
        return writing_extractor(found=f"track-{with_art.id}" in source.as_posix())(source, destination, **kwargs)

    assert covers_cli.run(db_session, storage, extractor=extractor) == 0

    db_session.expire_all()
    assert db_session.get(Track, with_art.id).cover_path is not None
    assert db_session.get(Track, without_art.id).cover_path is None
    assert db_session.get(Track, owner_cover.id).cover_path == "covers/owner.png"
    assert "1 of 2 track(s) got a cover" in capsys.readouterr().out


def test_backfill_dry_run_writes_nothing(
    db_session: Session,
    tmp_path: Path,
    storage: MediaStorage,
    capsys: pytest.CaptureFixture[str],
) -> None:
    track = create_track(db_session, tmp_path)

    assert covers_cli.run(db_session, storage, dry_run=True, extractor=writing_extractor()) == 0

    db_session.expire_all()
    assert db_session.get(Track, track.id).cover_path is None
    assert "1 track(s) without a cover" in capsys.readouterr().out
