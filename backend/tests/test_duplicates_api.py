from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.auth.tokens import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
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
def client(db_session: Session) -> Generator[TestClient]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
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


def create_track(
    db_session: Session,
    user: User,
    title: str,
    *,
    artist: str | None = "Artist",
    album: str | None = "Album",
    duration_seconds: int | None = 180,
    original_file_sha256: str | None = None,
    playback_file_sha256: str | None = None,
    status: str = "ready",
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist=artist,
        album=album,
        duration_seconds=duration_seconds,
        content_type="song",
        original_file_path=f"originals/{title}.mp3",
        original_file_size_bytes=123,
        original_file_sha256=original_file_sha256,
        playback_file_path=f"playback/{title}.mp3",
        playback_file_sha256=playback_file_sha256,
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        normalized_metadata_key=None,
        status=status,
        liked=False,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_duplicate_candidates_require_authentication(client: TestClient) -> None:
    response = client.get("/api/tracks/duplicates")

    assert response.status_code == 401


def test_duplicate_candidates_return_empty_array_when_no_candidates(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Unique", original_file_sha256="unique-hash")

    response = client.get("/api/tracks/duplicates", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.json() == []


def test_duplicate_candidates_are_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    create_track(db_session, owner, "Owner", original_file_sha256="same-hash")
    create_track(db_session, other_user, "Hidden", original_file_sha256="same-hash")

    response = client.get("/api/tracks/duplicates", headers=auth_headers(owner))

    assert response.status_code == 200
    assert response.json() == []


def test_duplicate_candidates_return_exact_duplicate_group(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", original_file_sha256="same-hash")
    second = create_track(db_session, user, "Second", original_file_sha256="same-hash")

    response = client.get("/api/tracks/duplicates", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["match_type"] == "exact_file"
    assert body[0]["confidence"] == 1.0
    assert body[0]["reason"] == "Tracks share the same original file SHA-256."
    assert body[0]["candidate_track_ids"] == [first.id, second.id]
    assert [candidate["title"] for candidate in body[0]["candidates"]] == [
        "First",
        "Second",
    ]
    assert "original_file_path" not in body[0]["candidates"][0]
    assert "playback_file_path" not in body[0]["candidates"][0]


def test_duplicate_candidates_return_likely_duplicate_group(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(
        db_session,
        user,
        "  My   Song ",
        artist="ARTIST",
        duration_seconds=180,
    )
    second = create_track(
        db_session,
        user,
        "my song",
        artist="artist",
        duration_seconds=182,
    )

    response = client.get("/api/tracks/duplicates", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["match_type"] == "metadata_duration"
    assert body[0]["confidence"] == 0.8
    assert body[0]["candidate_track_ids"] == [first.id, second.id]
    assert body[0]["candidates"][0]["duration_seconds"] == 180


def test_duplicate_candidates_can_filter_by_track_id(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", original_file_sha256="same-hash")
    second = create_track(db_session, user, "Second", original_file_sha256="same-hash")
    create_track(db_session, user, "Unique", original_file_sha256="unique-hash")

    response = client.get(
        f"/api/tracks/duplicates?track_id={first.id}",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["candidate_track_ids"] == [first.id, second.id]


def test_duplicate_candidate_filter_returns_empty_when_track_has_no_candidates(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    unique = create_track(db_session, user, "Unique", original_file_sha256="unique-hash")
    create_track(db_session, user, "First", original_file_sha256="same-hash")
    create_track(db_session, user, "Second", original_file_sha256="same-hash")

    response = client.get(
        f"/api/tracks/duplicates?track_id={unique.id}",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json() == []


def test_duplicate_candidate_filter_rejects_invalid_track_id(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.get(
        "/api/tracks/duplicates?track_id=999999",
        headers=auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Track not found."


def test_duplicate_candidate_filter_rejects_unowned_track_id(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden = create_track(db_session, other_user, "Hidden")

    response = client.get(
        f"/api/tracks/duplicates?track_id={hidden.id}",
        headers=auth_headers(owner),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Track not found."


def test_duplicate_candidates_do_not_mutate_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", original_file_sha256="same-hash")
    second = create_track(db_session, user, "Second", original_file_sha256="same-hash")

    response = client.get("/api/tracks/duplicates", headers=auth_headers(user))

    assert response.status_code == 200
    db_session.refresh(first)
    db_session.refresh(second)
    assert first.status == "ready"
    assert second.status == "ready"
    assert not db_session.dirty
