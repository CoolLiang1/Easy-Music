from collections.abc import Generator, Iterable
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
def client(db_session: Session, tmp_path: Path, import_root: Path) -> Generator[TestClient]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    settings = Settings(
        media_root=str(tmp_path / "media"),
        import_allowed_roots=[str(import_root)],
        import_scan_max_files=100,
        import_scan_max_depth=5,
        import_scan_max_file_mb=1,
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(settings)
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


def test_import_configuration_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/imports/configuration")

    assert response.status_code == 401


def test_import_scan_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/imports/scan", json={"root_id": "root-1"})

    assert response.status_code == 401


def test_import_configuration_returns_safe_root_labels(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)

    response = client.get("/api/imports/configuration", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["roots"] == [{"id": "root-1", "label": "imports"}]
    assert str(import_root) not in response.text


def test_scan_returns_supported_audio_candidates_and_skipped_files(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    (import_root / "song.mp3").write_bytes(b"mp3")
    (import_root / "voice.FLAC").write_bytes(b"flac")
    (import_root / "melody.m4a").write_bytes(b"m4a")
    (import_root / "zed.ogg").write_bytes(b"ogg")
    (import_root / "notes.txt").write_text("not audio", encoding="utf-8")

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["root"] == {"id": "root-1", "label": "imports"}
    assert body["scanned_relative_path"] == "."
    assert body["message"] == "Scan completed."
    candidates = {item["relative_path"]: item for item in body["candidates"]}
    assert candidates == {
        "melody.m4a": {
            "relative_path": "melody.m4a",
            "basename": "melody.m4a",
            "extension": "m4a",
            "size_bytes": 3,
            "status": "supported",
        },
        "song.mp3": {
            "relative_path": "song.mp3",
            "basename": "song.mp3",
            "extension": "mp3",
            "size_bytes": 3,
            "status": "supported",
        },
        "voice.FLAC": {
            "relative_path": "voice.FLAC",
            "basename": "voice.FLAC",
            "extension": "flac",
            "size_bytes": 4,
            "status": "supported",
        },
        "zed.ogg": {
            "relative_path": "zed.ogg",
            "basename": "zed.ogg",
            "extension": "ogg",
            "size_bytes": 3,
            "status": "supported",
        },
    }
    assert body["skipped"] == [
        {
            "relative_path": "notes.txt",
            "basename": "notes.txt",
            "extension": "txt",
            "size_bytes": 9,
            "status": "skipped",
            "reason": "unsupported_extension",
        },
    ]
    assert str(import_root) not in response.text
    assert db_session.query(Track).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


def test_scan_can_target_nested_allowed_directory(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    nested = import_root / "album" / "disc-1"
    nested.mkdir(parents=True)
    (nested / "track.wav").write_bytes(b"wav")

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1", "relative_subdir": "album\\disc-1"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scanned_relative_path"] == "album/disc-1"
    assert body["candidates"][0]["relative_path"] == "album/disc-1/track.wav"


def test_scan_returns_configured_off_response_when_imports_are_disabled(
    db_session: Session,
    tmp_path: Path,
) -> None:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(
        Settings(media_root=str(tmp_path / "media")),
    )
    user = create_user(db_session)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/imports/scan",
            json={"root_id": "root-1"},
            headers=auth_headers(user),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert "IMPORT_ALLOWED_ROOTS is empty" in body["message"]
    assert body["candidates"] == []
    assert body["skipped"] == []


def test_scan_rejects_path_traversal(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1", "relative_subdir": "../outside"},
        headers=auth_headers(user),
    )

    assert response.status_code == 400
    assert "may not contain '..'" in response.json()["detail"]


def test_scan_handles_missing_directory(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1", "relative_subdir": "missing"},
        headers=auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested import directory does not exist."


def test_scan_reports_file_size_and_depth_limits(
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    (import_root / "large.mp3").write_bytes(b"x" * (1024 * 1024 + 1))
    deep = import_root / "level-1"
    deep.mkdir()
    (deep / "deep.mp3").write_bytes(b"mp3")

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    skipped = {item["relative_path"]: item["reason"] for item in response.json()["skipped"]}
    assert skipped["large.mp3"] == "file_too_large"


def test_scan_applies_max_file_limit(
    db_session: Session,
    tmp_path: Path,
    import_root: Path,
) -> None:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    (import_root / "a.mp3").write_bytes(b"a")
    (import_root / "b.mp3").write_bytes(b"b")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(
        Settings(
            media_root=str(tmp_path / "media"),
            import_allowed_roots=[str(import_root)],
            import_scan_max_files=1,
            import_scan_max_depth=5,
            import_scan_max_file_mb=1,
        ),
    )
    user = create_user(db_session)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/imports/scan",
            json={"root_id": "root-1"},
            headers=auth_headers(user),
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["candidates"]) == 1
    assert body["message"] == "Scan completed with configured limits applied."
    assert body["skipped"][0]["reason"] == "max_files_exceeded"


def test_scan_applies_max_depth_limit(
    db_session: Session,
    tmp_path: Path,
    import_root: Path,
) -> None:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    nested = import_root / "nested"
    nested.mkdir()
    (nested / "song.mp3").write_bytes(b"mp3")
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_import_root_policy] = lambda: ImportRootPolicy(
        Settings(
            media_root=str(tmp_path / "media"),
            import_allowed_roots=[str(import_root)],
            import_scan_max_files=100,
            import_scan_max_depth=0,
            import_scan_max_file_mb=1,
        ),
    )
    user = create_user(db_session)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/imports/scan",
            json={"root_id": "root-1"},
            headers=auth_headers(user),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["candidates"] == []
    assert body["skipped"][0]["relative_path"] == "nested"
    assert body["skipped"][0]["reason"] == "max_depth_exceeded"


def test_scan_reports_permission_errors_without_crashing(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    db_session: Session,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    blocked = import_root / "blocked"
    blocked.mkdir()
    original_iterdir = Path.iterdir

    def fake_iterdir(path: Path) -> Iterable[Path]:
        if path.name == "blocked":
            raise PermissionError("blocked")
        return original_iterdir(path)

    monkeypatch.setattr(Path, "iterdir", fake_iterdir)

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["candidates"] == []
    assert body["skipped"][0]["relative_path"] == "blocked"
    assert body["skipped"][0]["reason"] == "permission_denied"


def test_scan_skips_symlink_escape_where_supported(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
    import_root: Path,
) -> None:
    user = create_user(db_session)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "outside.mp3").write_bytes(b"mp3")
    link = import_root / "escape.mp3"
    try:
        link.symlink_to(outside / "outside.mp3")
    except OSError as exc:
        pytest.skip(f"symlink creation is not available in this environment: {exc}")

    response = client.post(
        "/api/imports/scan",
        json={"root_id": "root-1"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["candidates"] == []
    assert body["skipped"][0]["relative_path"] == "escape.mp3"
    assert body["skipped"][0]["reason"] == "path_escapes_root"
