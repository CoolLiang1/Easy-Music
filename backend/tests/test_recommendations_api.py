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
from app.models.track import Track
from app.models.track_tag import TrackTag
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
    status: str = "ready",
    liked: bool = False,
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist="Artist",
        album="Album",
        duration_seconds=180,
        content_type="song",
        original_file_path="originals/track.mp3",
        playback_file_path="playback/track.mp3",
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        status=status,
        liked=liked,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def create_tag(db_session: Session, user: User, group: str, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def assign_tags(db_session: Session, track: Track, *tags: Tag) -> None:
    for tag in tags:
        db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()


def test_create_recommendations_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/recommendations", json={})

    assert response.status_code == 401


def test_create_recommendations_rejects_unowned_tag(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden_tag = create_tag(db_session, other_user, "scenario", "Hidden")

    response = client.post(
        "/api/recommendations",
        json={"scenario_tag_ids": [hidden_tag.id]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Recommendation tag not found for current user."


def test_create_recommendations_rejects_wrong_tag_group(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    attribute = create_tag(db_session, user, "attribute", "Piano")

    response = client.post(
        "/api/recommendations",
        json={"scenario_tag_ids": [attribute.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Recommendation tag group must be scenario."


def test_create_recommendations_returns_empty_results_when_no_ready_candidates(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Processing", status="processing")

    response = client.post(
        "/api/recommendations",
        json={},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"]
    assert body["results"] == []


def test_create_recommendations_returns_three_ordered_results(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")
    instrumental = create_tag(db_session, user, "type", "Instrumental")
    piano = create_tag(db_session, user, "attribute", "Piano")
    excluded = create_tag(db_session, user, "attribute", "Noisy")

    best = create_track(db_session, user, "Best", liked=True)
    second = create_track(db_session, user, "Second")
    third = create_track(db_session, user, "Third")
    fourth = create_track(db_session, user, "Fourth")
    assign_tags(db_session, best, focus, calm, instrumental, piano)
    assign_tags(db_session, second, focus, instrumental)
    assign_tags(db_session, third, focus)
    assign_tags(db_session, fourth, focus, excluded)

    response = client.post(
        "/api/recommendations",
        json={
            "scenario_tag_ids": [focus.id],
            "state_tag_ids": [calm.id],
            "type_tag_ids": [instrumental.id],
            "attribute_tag_ids": [piano.id],
            "exclude_attribute_tag_ids": [excluded.id],
            "limit": 3,
            "client": "web",
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"]
    assert [result["rank"] for result in body["results"]] == [1, 2, 3]
    assert [result["track"]["title"] for result in body["results"]] == [
        "Best",
        "Second",
        "Third",
    ]
    assert body["results"][0]["score"] > body["results"][1]["score"]
    assert body["results"][0]["track"]["tags"][0]["name"] == "Focus"


def test_create_recommendations_includes_deterministic_reason_fields(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    track = create_track(db_session, user, "Reasoned", liked=True)
    assign_tags(db_session, track, focus)

    response = client.post(
        "/api/recommendations",
        json={"scenario_tag_ids": [focus.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["reason"] == "matched scenario tags: Focus; liked track boost."
    assert result["track"]["id"] == track.id
    assert "playback_file_path" in result["track"]
