from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.auth.refresh_tokens import ROTATION_GRACE_SECONDS
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.refresh_token import RefreshToken
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


def create_user(db_session: Session) -> User:
    user = User(username="owner", password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_login_returns_access_token(client: TestClient, db_session: Session) -> None:
    create_user(db_session)

    response = client.post(
        "/api/auth/login",
        json={"username": "owner", "password": "correct-password"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_rejects_invalid_credentials(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)

    response = client.post(
        "/api/auth/login",
        json={"username": "owner", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_me_returns_current_user(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    login_response = client.post(
        "/api/auth/login",
        json={"username": "owner", "password": "correct-password"},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat(),
    }


def test_login_allows_web_cors_preflight(monkeypatch: pytest.MonkeyPatch) -> None:
    web_origin = "http://127.0.0.1:8081"
    monkeypatch.setenv(
        "CORS_ORIGINS",
        f"{web_origin},http://localhost:5173",
    )
    get_settings.cache_clear()
    app = create_app()
    get_settings.cache_clear()

    with TestClient(app) as test_client:
        response = test_client.options(
            "/api/auth/login",
            headers={
                "Origin": web_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == web_origin
    assert "POST" in response.headers["access-control-allow-methods"]


def login_tokens(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"username": "owner", "password": "correct-password"},
    )
    assert response.status_code == 200
    return response.json()


def test_login_returns_refresh_token(client: TestClient, db_session: Session) -> None:
    create_user(db_session)

    body = login_tokens(client)

    assert body["refresh_token"]
    assert body["expires_in"] == get_settings().access_token_expire_minutes * 60
    assert body["refresh_token_expires_at"]
    stored = db_session.scalars(select(RefreshToken)).all()
    assert len(stored) == 1
    assert stored[0].token_hash != body["refresh_token"]


def test_refresh_rotates_tokens(client: TestClient, db_session: Session) -> None:
    create_user(db_session)
    first = login_tokens(client)

    response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": first["refresh_token"]},
    )

    assert response.status_code == 200
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {second['access_token']}"},
    )
    assert me.status_code == 200

    again = client.post(
        "/api/auth/refresh",
        json={"refresh_token": second["refresh_token"]},
    )
    assert again.status_code == 200


def test_refresh_allows_concurrent_reuse_within_grace_window(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    first = login_tokens(client)

    a = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    b = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})

    assert a.status_code == 200
    assert b.status_code == 200


def test_refresh_rejects_token_revoked_outside_grace_window(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    first = login_tokens(client)
    assert client.post(
        "/api/auth/refresh",
        json={"refresh_token": first["refresh_token"]},
    ).status_code == 200

    record = db_session.scalar(
        select(RefreshToken).where(RefreshToken.revoked_at.is_not(None)),
    )
    assert record is not None
    record.revoked_at = datetime.now(UTC) - timedelta(seconds=ROTATION_GRACE_SECONDS + 5)
    db_session.commit()

    response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": first["refresh_token"]},
    )

    assert response.status_code == 401


def test_refresh_rejects_unknown_and_expired_tokens(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    tokens = login_tokens(client)

    unknown = client.post("/api/auth/refresh", json={"refresh_token": "not-a-token"})
    assert unknown.status_code == 401

    record = db_session.scalar(select(RefreshToken))
    assert record is not None
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()

    expired = client.post(
        "/api/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert expired.status_code == 401


def test_logout_revokes_refresh_token_without_access_token(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    tokens = login_tokens(client)

    logout = client.post(
        "/api/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert logout.status_code == 200

    response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert response.status_code == 401


def test_logout_without_refresh_token_still_requires_access_token(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    tokens = login_tokens(client)

    assert client.post("/api/auth/logout").status_code == 401
    response = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 200


def test_login_cleans_up_expired_refresh_tokens(
    client: TestClient,
    db_session: Session,
) -> None:
    create_user(db_session)
    login_tokens(client)
    record = db_session.scalar(select(RefreshToken))
    assert record is not None
    record.expires_at = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()

    login_tokens(client)

    assert len(db_session.scalars(select(RefreshToken)).all()) == 1
