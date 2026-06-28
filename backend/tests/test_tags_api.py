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
from app.models.tag import Tag
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


def create_tag(db_session: Session, user: User, name: str = "Focus") -> Tag:
    tag = Tag(user_id=user.id, name=name, group="scene")
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def test_create_tag(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tags",
        json={"name": "Focus", "group": "scene"},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Focus"
    assert body["group"] == "scene"
    assert body["id"]
    assert body["created_at"]


def test_list_tags_returns_only_current_users_tags(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    create_tag(db_session, owner, name="Focus")
    create_tag(db_session, other_user, name="Hidden")

    response = client.get("/api/tags", headers=auth_headers(owner))

    assert response.status_code == 200
    assert [tag["name"] for tag in response.json()] == ["Focus"]


def test_update_tag(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    tag = create_tag(db_session, user)

    response = client.patch(
        f"/api/tags/{tag.id}",
        json={"name": "Morning", "group": "feature"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Morning"
    assert response.json()["group"] == "feature"


def test_delete_tag(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    tag = create_tag(db_session, user)

    response = client.delete(f"/api/tags/{tag.id}", headers=auth_headers(user))

    assert response.status_code == 204
    assert db_session.get(Tag, tag.id) is None


def test_tags_require_authentication(client: TestClient) -> None:
    response = client.get("/api/tags")

    assert response.status_code == 401


def test_cannot_update_another_users_tag(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    tag = create_tag(db_session, other_user)

    response = client.patch(
        f"/api/tags/{tag.id}",
        json={"name": "Nope"},
        headers=auth_headers(owner),
    )

    assert response.status_code == 404


@pytest.mark.parametrize("method", ["post", "patch"])
def test_tag_group_is_limited(
    client: TestClient,
    db_session: Session,
    method: str,
) -> None:
    user = create_user(db_session)
    tag = create_tag(db_session, user)
    url = "/api/tags" if method == "post" else f"/api/tags/{tag.id}"

    response = getattr(client, method)(
        url,
        json={"name": "Invalid", "group": "mood"},
        headers=auth_headers(user),
    )

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["post", "patch"])
def test_attribute_group_is_not_accepted(
    client: TestClient,
    db_session: Session,
    method: str,
) -> None:
    user = create_user(db_session)
    tag = create_tag(db_session, user)
    url = "/api/tags" if method == "post" else f"/api/tags/{tag.id}"

    response = getattr(client, method)(
        url,
        json={"name": "Piano", "group": "attribute"},
        headers=auth_headers(user),
    )

    assert response.status_code == 422
