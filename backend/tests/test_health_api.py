from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.router import check_database_health
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app


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
    # Override the health check so it does not hit the real PostgreSQL engine.
    app.dependency_overrides[check_database_health] = lambda: True
    with TestClient(app) as test_client:
        yield test_client


def _make_client(db_session: Session, health_result: bool) -> TestClient:
    """Build a TestClient whose health-check dependency returns *health_result*."""
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[check_database_health] = lambda: health_result
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200_when_database_connected(self, db_session: Session):
        client = _make_client(db_session, health_result=True)
        with client:
            resp = client.get("/health")

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"
        assert body["database"] == "connected"

    def test_health_requires_no_auth(self, client: TestClient):
        resp = client.get("/health", headers={})

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"

    def test_health_returns_503_when_database_disconnected(self, db_session: Session):
        client = _make_client(db_session, health_result=False)
        with client:
            resp = client.get("/health")

        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "unhealthy"
        assert body["database"] == "disconnected"

    def test_health_response_does_not_leak_connection_details(self, client: TestClient):
        resp = client.get("/health")

        body = resp.json()
        body_str = str(body).lower()
        assert "postgresql" not in body_str
        assert "password" not in body_str
        assert "secret" not in body_str
        assert "database_url" not in body_str
        assert "connection" not in body_str


class TestCheckDatabaseHealthFunction:
    def test_returns_false_when_db_is_unreachable(self):
        with patch(
            "app.api.router.engine.connect", side_effect=OSError("connection refused")
        ):
            result = check_database_health()
        assert result is False

    def test_returns_false_on_generic_exception(self):
        with patch(
            "app.api.router.engine.connect", side_effect=RuntimeError("unknown")
        ):
            result = check_database_health()
        assert result is False
