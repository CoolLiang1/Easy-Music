from collections.abc import Generator
import hashlib
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

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_media_storage] = lambda: MediaStorage(
        Settings(media_root=str(tmp_path), max_upload_mb=1),
    )
    with TestClient(app) as test_client:
        yield test_client


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_upload_audio_creates_track_and_saves_original(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload",
        files={"file": ("../My Song.MP3", b"audio bytes", "audio/mpeg")},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "My Song"
    assert body["format"] == "mp3"
    assert body["status"] == "processing"
    assert body["processing_job_status"] == "pending"
    assert body["processing_error_message"] is None
    assert body["original_file_path"].startswith("originals/user-")
    assert body["original_file_size_bytes"] == len(b"audio bytes")
    assert body["original_file_sha256"] == hashlib.sha256(b"audio bytes").hexdigest()
    assert body["playback_file_path"] is None
    assert body["playback_file_sha256"] is None
    assert body["normalized_metadata_key"] == "title=my song|artist=|album=|duration="
    assert body["tags"] == []

    track = db_session.get(Track, body["id"])
    assert track is not None
    assert track.user_id == user.id
    assert track.original_file_path == body["original_file_path"]
    assert track.original_file_size_bytes == len(b"audio bytes")
    assert track.original_file_sha256 == hashlib.sha256(b"audio bytes").hexdigest()
    assert track.normalized_metadata_key == "title=my song|artist=|album=|duration="
    assert (tmp_path / track.original_file_path).read_bytes() == b"audio bytes"

    job = db_session.query(ProcessingJob).one()
    assert job.track_id == track.id
    assert job.status == "pending"
    assert job.job_type == "audio_processing"
    assert job.source_path is None
    assert job.error_message is None


def test_upload_rejects_unsupported_extension(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload",
        files={"file": ("notes.txt", b"not audio", "text/plain")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert db_session.query(Track).count() == 0


def test_upload_rejects_mismatched_content_type(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload",
        files={"file": ("song.mp3", b"not audio", "text/plain")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert db_session.query(Track).count() == 0


def test_upload_rejects_files_over_configured_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/upload",
        files={"file": ("song.wav", b"x" * (1024 * 1024 + 1), "audio/wav")},
        headers=auth_headers(user),
    )

    assert response.status_code == 413
    assert db_session.query(Track).count() == 0


def test_upload_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/tracks/upload",
        files={"file": ("song.ogg", b"audio bytes", "audio/ogg")},
    )

    assert response.status_code == 401
