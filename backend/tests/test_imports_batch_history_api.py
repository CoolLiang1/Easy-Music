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
from app.models.import_batch import ImportBatch, ImportItem
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User
from app.services.imports import ImportRootPolicy, get_import_root_policy


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def mp4_bytes(payload: bytes = b"video") -> bytes:
    return b"\x00\x00\x00\x18ftypmp42" + payload


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
def import_root(tmp_path: Path) -> Path:
    root = tmp_path / "imports"
    root.mkdir()
    return root


@pytest.fixture
def media_root(tmp_path: Path) -> Path:
    root = tmp_path / "media"
    root.mkdir()
    return root


@pytest.fixture
def client(
    db_session: Session,
    media_root: Path,
    import_root: Path,
) -> Generator[TestClient]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    settings = Settings(
        media_root=str(media_root),
        import_allowed_roots=[str(import_root)],
        import_scan_max_file_mb=1,
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(settings)
    app.dependency_overrides[get_media_storage] = lambda: MediaStorage(settings)
    with TestClient(app) as test_client:
        yield test_client


def test_confirm_import_creates_batch_history_with_safe_fields(
    client: TestClient,
    db_session: Session,
    import_root: Path,
    media_root: Path,
) -> None:
    (import_root / "nested").mkdir()
    (import_root / "nested" / "song.mp3").write_bytes(b"song")
    user = create_user(db_session)

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "nested/song.mp3"}]},
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    batch_id = response.json()["batch_id"]

    batch_response = client.get(f"/api/imports/batches/{batch_id}", headers=auth_headers(user))

    assert batch_response.status_code == 200
    body = batch_response.json()
    assert body["id"] == batch_id
    assert body["root"] == {"id": "root-1", "label": "imports"}
    assert body["status"] == "imported"
    assert body["requested_count"] == 1
    assert body["imported_count"] == 1
    assert body["skipped_count"] == 0
    assert body["failed_count"] == 0
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["relative_path"] == "nested/song.mp3"
    assert str(import_root) not in item["relative_path"]
    assert item["basename"] == "song.mp3"
    assert item["status"] == "imported"
    assert item["media_kind"] == "audio"
    assert item["error"] is None
    assert item["track_id"] == item["track"]["id"]
    assert item["track"]["status"] == "processing"
    assert item["track"]["processing_job_status"] == "pending"
    assert item["track"]["original_file_path"].startswith("originals/user-")
    assert str(media_root) not in item["track"]["original_file_path"]
    assert db_session.query(ImportBatch).count() == 1
    assert db_session.query(ImportItem).count() == 1
    assert db_session.query(ProcessingJob).count() == 1


def test_batch_history_records_video_import_media_kind(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    (import_root / "clip.mp4").write_bytes(mp4_bytes())
    user = create_user(db_session)

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "clip.mp4"}]},
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    batch_id = response.json()["batch_id"]
    assert response.json()["results"][0]["media_kind"] == "video"

    batch_response = client.get(f"/api/imports/batches/{batch_id}", headers=auth_headers(user))

    assert batch_response.status_code == 200
    item = batch_response.json()["items"][0]
    assert item["relative_path"] == "clip.mp4"
    assert item["media_kind"] == "video"
    assert item["track"]["processing_job_status"] == "pending"


def test_latest_batch_is_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    (import_root / "song.mp3").write_bytes(b"song")
    owner = create_user(db_session, "owner")
    other = create_user(db_session, "other")

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "song.mp3"}]},
        headers=auth_headers(owner),
    )
    assert response.status_code == 200
    batch_id = response.json()["batch_id"]

    latest_owner = client.get("/api/imports/batches/latest", headers=auth_headers(owner))
    latest_other = client.get("/api/imports/batches/latest", headers=auth_headers(other))
    other_specific = client.get(f"/api/imports/batches/{batch_id}", headers=auth_headers(other))

    assert latest_owner.status_code == 200
    assert latest_owner.json()["id"] == batch_id
    assert latest_other.status_code == 200
    assert latest_other.json() is None
    assert other_specific.status_code == 404


def test_batch_history_records_partial_failure_state_and_created_track(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    (import_root / "good.mp3").write_bytes(b"good")
    user = create_user(db_session)

    response = client.post(
        "/api/imports",
        json={
            "root_id": "root-1",
            "files": [
                {"relative_path": "good.mp3"},
                {"relative_path": "missing.mp3"},
            ],
        },
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    batch_id = response.json()["batch_id"]
    track_id = response.json()["results"][0]["track"]["id"]
    track = db_session.get(Track, track_id)
    assert track is not None
    track.status = "ready"
    db_session.commit()

    batch_response = client.get(f"/api/imports/batches/{batch_id}", headers=auth_headers(user))

    assert batch_response.status_code == 200
    body = batch_response.json()
    assert body["status"] == "failed"
    assert body["imported_count"] == 1
    assert body["failed_count"] == 1
    items = {item["relative_path"]: item for item in body["items"]}
    assert items["good.mp3"]["status"] == "imported"
    assert items["good.mp3"]["track_id"] == track_id
    assert items["good.mp3"]["track"]["status"] == "ready"
    assert items["missing.mp3"]["status"] == "failed"
    assert items["missing.mp3"]["track_id"] is None
    assert items["missing.mp3"]["track"] is None
    assert items["missing.mp3"]["error"] == "Source file does not exist."


def test_batch_history_requires_authentication(client: TestClient) -> None:
    latest = client.get("/api/imports/batches/latest")
    specific = client.get("/api/imports/batches/1")

    assert latest.status_code == 401
    assert specific.status_code == 401
