from collections.abc import Generator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.auth.tokens import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.feedback_event import FeedbackEvent
from app.models.tag import Tag
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


def create_track(db_session: Session, user: User, title: str = "Track One") -> Track:
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
        status="ready",
        liked=False,
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


def feedback_event_payload(
    track_id: int,
    client_event_id: str | None = "feedback-event-1",
    feedback_type: str = "not_today",
) -> dict:
    payload = {
        "track_id": track_id,
        "feedback_type": feedback_type,
        "occurred_at": datetime(2026, 5, 29, 8, 30, tzinfo=timezone.utc).isoformat(),
        "client": "android",
    }
    if client_event_id is not None:
        payload["client_event_id"] = client_event_id
    return payload


def test_sync_feedback_events_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/feedback-events", json={"events": []})

    assert response.status_code == 401


def test_sync_feedback_events_inserts_owned_track_with_context(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    scene = create_tag(db_session, user, "scene", "Focus")
    feature = create_tag(db_session, user, "feature", "Calm")
    kind = create_tag(db_session, user, "type", "Song")

    response = client.post(
        "/api/feedback-events",
        json={
            "events": [
                {
                    **feedback_event_payload(track.id),
                    "scene_tag_ids": [scene.id],
                    "feature_tag_ids": [feature.id],
                    "type_tag_ids": [kind.id],
                },
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": [{"client_event_id": "feedback-event-1", "status": "accepted"}],
        "failed": [],
    }
    events = list(db_session.scalars(select(FeedbackEvent)))
    assert len(events) == 1
    assert events[0].track_id == track.id
    assert events[0].feedback_type == "not_today"
    assert events[0].scene_tag_ids == [scene.id]
    assert events[0].feature_tag_ids == [feature.id]
    assert events[0].type_tag_ids == [kind.id]
    assert events[0].client == "android"


def test_sync_feedback_events_reports_unowned_track_without_insert(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden_track = create_track(db_session, other_user)

    response = client.post(
        "/api/feedback-events",
        json={"events": [feedback_event_payload(hidden_track.id)]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": [],
        "failed": [
            {
                "client_event_id": "feedback-event-1",
                "track_id": hidden_track.id,
                "status": "failed",
                "error": "Track not found for current user.",
            },
        ],
    }
    assert list(db_session.scalars(select(FeedbackEvent))) == []


def test_sync_feedback_events_validates_context_tag_ownership(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, owner)
    hidden_tag = create_tag(db_session, other_user, "scene", "Hidden")

    response = client.post(
        "/api/feedback-events",
        json={
            "events": [
                {
                    **feedback_event_payload(track.id),
                    "scene_tag_ids": [hidden_tag.id],
                },
            ],
        },
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert response.json()["accepted"] == []
    assert response.json()["failed"][0]["error"] == "Context tag not found for current user."
    assert list(db_session.scalars(select(FeedbackEvent))) == []


def test_sync_feedback_events_validates_context_tag_group(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    feature = create_tag(db_session, user, "feature", "Calm")

    response = client.post(
        "/api/feedback-events",
        json={
            "events": [
                {
                    **feedback_event_payload(track.id),
                    "scene_tag_ids": [feature.id],
                },
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["accepted"] == []
    assert response.json()["failed"][0]["error"] == "Context tag group must be scene."
    assert list(db_session.scalars(select(FeedbackEvent))) == []


def test_sync_feedback_events_rejects_attribute_context_field(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/feedback-events",
        json={
            "events": [
                {
                    **feedback_event_payload(track.id),
                    "attribute_tag_ids": [1],
                },
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 422


def test_sync_feedback_events_like_updates_track_liked(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/feedback-events",
        json={"events": [feedback_event_payload(track.id, feedback_type="like")]},
        headers=auth_headers(user),
    )

    db_session.refresh(track)
    assert response.status_code == 200
    assert track.liked is True
    assert db_session.scalar(select(FeedbackEvent)).feedback_type == "like"


def test_sync_feedback_events_accepts_dislike_without_track_feature_change(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/feedback-events",
        json={"events": [feedback_event_payload(track.id, feedback_type="dislike")]},
        headers=auth_headers(user),
    )

    db_session.refresh(track)
    assert response.status_code == 200
    assert track.liked is False
    assert track.cooldown_until is None
    assert db_session.scalar(select(FeedbackEvent)).feedback_type == "dislike"


def test_sync_feedback_events_tired_sets_default_cooldown(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/feedback-events",
        json={"events": [feedback_event_payload(track.id, feedback_type="tired")]},
        headers=auth_headers(user),
    )

    db_session.refresh(track)
    assert response.status_code == 200
    assert track.cooldown_until == datetime(2026, 6, 12, 8, 30)


def test_sync_feedback_events_duplicate_retry_is_idempotent(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    payload = {"events": [feedback_event_payload(track.id)]}

    first_response = client.post(
        "/api/feedback-events",
        json=payload,
        headers=auth_headers(user),
    )
    retry_response = client.post(
        "/api/feedback-events",
        json=payload,
        headers=auth_headers(user),
    )

    assert first_response.status_code == 200
    assert retry_response.status_code == 200
    assert retry_response.json() == {
        "accepted": [{"client_event_id": "feedback-event-1", "status": "duplicate"}],
        "failed": [],
    }
    assert len(list(db_session.scalars(select(FeedbackEvent)))) == 1


def test_sync_feedback_events_accepts_events_without_client_event_id(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/feedback-events",
        json={"events": [feedback_event_payload(track.id, client_event_id=None)]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": [{"client_event_id": None, "status": "accepted"}],
        "failed": [],
    }
    assert len(list(db_session.scalars(select(FeedbackEvent)))) == 1
