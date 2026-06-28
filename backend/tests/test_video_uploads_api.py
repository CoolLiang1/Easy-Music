from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.media.storage import MediaStorage, get_media_storage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User


def mp4_bytes(payload: bytes = b"video") -> bytes:
    return b"\x00\x00\x00\x18ftypmp42" + payload


def webm_bytes(payload: bytes = b"video") -> bytes:
    return b"\x1a\x45\xdf\xa3" + payload


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def media_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file()]


def temp_video_file(root: Path, relative_path: str) -> Path:
    path = root / relative_path
    assert path.is_file()
    return path


def test_video_upload_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("clip.mp4", mp4_bytes(), "video/mp4")},
    )

    assert response.status_code == 401


def test_video_upload_creates_processing_track_and_video_job(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("../My Clip.MP4", mp4_bytes(b"content"), "video/mp4")},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "My Clip"
    assert body["format"] == "mp4"
    assert body["status"] == "processing"
    assert body["processing_job_status"] == "pending"
    assert body["original_file_path"] is None
    assert body["original_file_size_bytes"] is None
    assert body["original_file_sha256"] is None
    assert body["playback_file_path"] is None
    assert body["cover_path"] is None

    track = db_session.get(Track, body["id"])
    assert track is not None
    assert track.user_id == user.id
    assert track.original_file_path is None

    job = db_session.query(ProcessingJob).one()
    assert job.track_id == track.id
    assert job.status == "pending"
    assert job.job_type == "video_extraction"
    assert job.source_path is not None
    assert job.source_path.startswith(f"temp-videos/user-{user.id}/track-{track.id}/")
    assert "My_Clip" in job.source_path
    assert str(tmp_path) not in job.source_path
    assert temp_video_file(tmp_path, job.source_path).read_bytes() == mp4_bytes(b"content")


def test_video_upload_accepts_webm_signature(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("clip.webm", webm_bytes(), "video/webm")},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    job = db_session.query(ProcessingJob).one()
    assert job.job_type == "video_extraction"
    assert job.source_path is not None
    assert job.source_path.endswith(".webm")


def test_video_upload_rejects_unsupported_extension(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("clip.avi", b"video", "video/x-msvideo")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert db_session.query(Track).count() == 0
    assert media_files(tmp_path) == []


def test_video_upload_rejects_mismatched_content_type(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("clip.mp4", mp4_bytes(), "text/plain")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert db_session.query(Track).count() == 0
    assert media_files(tmp_path) == []


def test_video_upload_rejects_bad_signature_and_removes_temp_file(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={"file": ("clip.mp4", b"not an mp4", "video/mp4")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert db_session.query(Track).count() == 0
    assert db_session.query(ProcessingJob).count() == 0
    assert media_files(tmp_path) == []


def test_video_upload_rejects_files_over_configured_limit(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload-video",
        files={
            "file": (
                "clip.mp4",
                b"\x00\x00\x00\x18ftypmp42" + b"x" * (1024 * 1024 + 1),
                "video/mp4",
            ),
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 413
    assert db_session.query(Track).count() == 0
    assert db_session.query(ProcessingJob).count() == 0
    assert media_files(tmp_path) == []


def test_video_upload_does_not_change_audio_upload_behavior(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload",
        files={"file": ("song.mp3", b"audio bytes", "audio/mpeg")},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["original_file_path"].startswith("originals/user-")
    job = db_session.query(ProcessingJob).one()
    assert job.job_type == "audio_processing"
    assert job.source_path is None
    assert (tmp_path / body["original_file_path"]).read_bytes() == b"audio bytes"


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


@pytest.fixture
def client(db_session: Session, tmp_path: Path) -> Generator[TestClient]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    settings = Settings(
        media_root=str(tmp_path),
        max_upload_mb=1,
        max_video_upload_mb=1,
    )
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_media_storage] = lambda: MediaStorage(settings)
    with TestClient(app) as test_client:
        yield test_client
