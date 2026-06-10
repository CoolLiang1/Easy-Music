from collections.abc import Generator
from pathlib import Path
import hashlib
import shutil

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
from app.services.imports import ImportRootPolicy, get_import_root_policy


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
def client(db_session: Session, media_root: Path, import_root: Path) -> Generator[TestClient]:
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


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_confirm_import_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "song.mp3"}]},
    )

    assert response.status_code == 401


def test_confirm_import_copies_audio_and_creates_track_and_job(
    client: TestClient,
    db_session: Session,
    import_root: Path,
    media_root: Path,
) -> None:
    user = create_user(db_session)
    source = import_root / "Song.MP3"
    source.write_bytes(b"audio bytes")

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "Song.MP3"}]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["requested_count"] == 1
    assert body["imported_count"] == 1
    assert body["skipped_count"] == 0
    assert body["failed_count"] == 0
    result = body["results"][0]
    assert result["relative_path"] == "Song.MP3"
    assert result["status"] == "imported"
    assert result["error"] is None
    assert result["duplicate_warnings"] == []
    assert result["track"]["title"] == "Song"
    assert result["track"]["format"] == "mp3"
    assert result["track"]["status"] == "processing"
    assert result["track"]["processing_job_status"] == "pending"
    assert result["track"]["original_file_sha256"] == hashlib.sha256(b"audio bytes").hexdigest()
    assert result["track"]["original_file_path"].startswith("originals/user-")

    assert source.exists()
    assert source.read_bytes() == b"audio bytes"
    track = db_session.get(Track, result["track"]["id"])
    assert track is not None
    assert track.user_id == user.id
    assert track.original_file_path == result["track"]["original_file_path"]
    assert (media_root / track.original_file_path).read_bytes() == b"audio bytes"

    job = db_session.query(ProcessingJob).one()
    assert job.track_id == track.id
    assert job.status == "pending"


def test_confirm_import_disabled_returns_configured_off_response(
    db_session: Session,
    media_root: Path,
) -> None:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    settings = Settings(media_root=str(media_root))
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(settings)
    app.dependency_overrides[get_media_storage] = lambda: MediaStorage(settings)
    user = create_user(db_session)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/imports",
            json={"root_id": "root-1", "files": [{"relative_path": "song.mp3"}]},
            headers=auth_headers(user),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert "IMPORT_ALLOWED_ROOTS is empty" in body["message"]
    assert body["results"] == []
    assert db_session.query(Track).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


def test_confirm_import_rejects_path_traversal(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "../outside.mp3"}]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["status"] == "failed"
    assert "may not contain '..'" in result["error"]
    assert db_session.query(Track).count() == 0


def test_confirm_import_reports_unsupported_and_oversized_files_without_copying(
    client: TestClient,
    db_session: Session,
    import_root: Path,
    media_root: Path,
) -> None:
    user = create_user(db_session)
    unsupported = import_root / "notes.txt"
    oversized = import_root / "large.wav"
    unsupported.write_text("not audio", encoding="utf-8")
    oversized.write_bytes(b"x" * (1024 * 1024 + 1))

    response = client.post(
        "/api/imports",
        json={
            "root_id": "root-1",
            "files": [
                {"relative_path": "notes.txt"},
                {"relative_path": "large.wav"},
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["imported_count"] == 0
    assert body["skipped_count"] == 2
    results = {result["relative_path"]: result for result in body["results"]}
    assert results["notes.txt"]["status"] == "skipped"
    assert results["notes.txt"]["error"] == "Unsupported file extension."
    assert results["large.wav"]["status"] == "skipped"
    assert results["large.wav"]["error"] == "Source file exceeds import size limit."
    assert unsupported.exists()
    assert oversized.exists()
    assert list(media_root.rglob("*")) == []
    assert db_session.query(Track).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


def test_confirm_import_allows_partial_success(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    (import_root / "good.mp3").write_bytes(b"good")

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
    body = response.json()
    assert body["imported_count"] == 1
    assert body["failed_count"] == 1
    results = {result["relative_path"]: result for result in body["results"]}
    assert results["good.mp3"]["status"] == "imported"
    assert results["missing.mp3"]["status"] == "failed"
    assert results["missing.mp3"]["error"] == "Source file does not exist."
    assert db_session.query(Track).count() == 1
    assert db_session.query(ProcessingJob).count() == 1


def test_confirm_import_reports_duplicate_warning_without_blocking_import(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    source_bytes = b"same audio"
    existing = Track(
        user_id=user.id,
        title="Existing",
        content_type="song",
        original_file_path="originals/existing.mp3",
        original_file_size_bytes=len(source_bytes),
        original_file_sha256=hashlib.sha256(source_bytes).hexdigest(),
        status="ready",
        liked=False,
    )
    db_session.add(existing)
    db_session.commit()
    db_session.refresh(existing)
    (import_root / "duplicate.mp3").write_bytes(source_bytes)

    response = client.post(
        "/api/imports",
        json={"root_id": "root-1", "files": [{"relative_path": "duplicate.mp3"}]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["status"] == "imported"
    assert result["duplicate_warnings"] == [
        {
            "match_type": "exact_file",
            "reason": "Selected file matches an existing track original file SHA-256.",
            "candidate_track_ids": [existing.id],
        },
    ]
    assert db_session.query(Track).count() == 2


def test_confirm_import_copy_failure_does_not_delete_source_or_prior_success(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    good = import_root / "good.mp3"
    fail = import_root / "fail.mp3"
    good.write_bytes(b"good")
    fail.write_bytes(b"fail")
    original_copyfile = shutil.copyfile

    def fake_copyfile(src: Path, dst: Path) -> Path:
        if Path(src).name == "fail.mp3":
            raise OSError("simulated copy failure")
        return original_copyfile(src, dst)

    monkeypatch.setattr("app.services.imports.shutil.copyfile", fake_copyfile)

    response = client.post(
        "/api/imports",
        json={
            "root_id": "root-1",
            "files": [
                {"relative_path": "good.mp3"},
                {"relative_path": "fail.mp3"},
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["imported_count"] == 1
    assert body["failed_count"] == 1
    results = {result["relative_path"]: result for result in body["results"]}
    assert results["good.mp3"]["status"] == "imported"
    assert results["fail.mp3"]["status"] == "failed"
    assert "simulated copy failure" in results["fail.mp3"]["error"]
    assert good.read_bytes() == b"good"
    assert fail.read_bytes() == b"fail"
    assert db_session.query(Track).count() == 1
    assert db_session.query(ProcessingJob).count() == 1
