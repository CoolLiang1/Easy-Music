from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
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
    web_origin = "http://127.0.0.1:3000"
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
