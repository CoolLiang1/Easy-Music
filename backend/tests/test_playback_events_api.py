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
from app.models.playback_event import PlaybackEvent
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


def playback_event_payload(track_id: int, client_event_id: str = "android-event-1") -> dict:
    return {
        "client_event_id": client_event_id,
        "track_id": track_id,
        "event_type": "play",
        "position_seconds": 12.5,
        "duration_seconds": 180,
        "occurred_at": datetime(2026, 5, 28, 8, 30, tzinfo=timezone.utc).isoformat(),
        "client": "android",
    }


def add_playback_event(
    db_session: Session,
    user: User,
    track: Track,
    *,
    client_event_id: str,
    event_type: str,
    occurred_at: datetime,
) -> None:
    db_session.add(
        PlaybackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id=client_event_id,
            event_type=event_type,
            position_seconds=0,
            duration_seconds=track.duration_seconds,
            occurred_at=occurred_at,
            client="web",
        ),
    )
    db_session.commit()


def test_list_recent_playback_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/playback-events/recent")

    assert response.status_code == 401


def test_list_recent_playback_is_empty_without_meaningful_events(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    add_playback_event(
        db_session,
        user,
        track,
        client_event_id="pause-only",
        event_type="pause",
        occurred_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    )

    response = client.get(
        "/api/playback-events/recent",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json() == []


def test_list_recent_playback_aggregates_orders_and_scopes_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first_track = create_track(db_session, user, title="First")
    second_track = create_track(db_session, user, title="Second")
    other_user = create_user(db_session, username="other")
    hidden_track = create_track(db_session, other_user, title="Hidden")

    add_playback_event(
        db_session,
        user,
        first_track,
        client_event_id="first-play-1",
        event_type="play",
        occurred_at=datetime(2026, 7, 1, 8, tzinfo=timezone.utc),
    )
    add_playback_event(
        db_session,
        user,
        first_track,
        client_event_id="first-play-2",
        event_type="play",
        occurred_at=datetime(2026, 7, 3, 8, tzinfo=timezone.utc),
    )
    add_playback_event(
        db_session,
        user,
        first_track,
        client_event_id="first-pause-later",
        event_type="pause",
        occurred_at=datetime(2026, 7, 9, 8, tzinfo=timezone.utc),
    )
    add_playback_event(
        db_session,
        user,
        second_track,
        client_event_id="second-resume",
        event_type="resume",
        occurred_at=datetime(2026, 7, 4, 8, tzinfo=timezone.utc),
    )
    add_playback_event(
        db_session,
        other_user,
        hidden_track,
        client_event_id="hidden-play",
        event_type="play",
        occurred_at=datetime(2026, 7, 10, 8, tzinfo=timezone.utc),
    )

    response = client.get(
        "/api/playback-events/recent",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["track"]["title"] for item in body] == ["Second", "First"]
    assert [item["playback_count"] for item in body] == [0, 2]
    assert body[0]["last_played_at"] == "2026-07-04T08:00:00"
    assert body[1]["last_played_at"] == "2026-07-03T08:00:00"


def test_list_recent_playback_applies_validated_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    for index in range(2):
        track = create_track(db_session, user, title=f"Track {index}")
        add_playback_event(
            db_session,
            user,
            track,
            client_event_id=f"play-{index}",
            event_type="play",
            occurred_at=datetime(2026, 7, index + 1, tzinfo=timezone.utc),
        )

    response = client.get(
        "/api/playback-events/recent?limit=1",
        headers=auth_headers(user),
    )
    too_large_response = client.get(
        "/api/playback-events/recent?limit=101",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["track"]["title"] == "Track 1"
    assert too_large_response.status_code == 422


def test_sync_playback_events_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/playback-events", json={"events": []})

    assert response.status_code == 401


def test_sync_playback_events_bulk_inserts_owned_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/playback-events",
        json={
            "events": [
                playback_event_payload(track.id, "android-event-1"),
                {
                    **playback_event_payload(track.id, "android-event-2"),
                    "event_type": "pause",
                    "position_seconds": 24,
                    "duration_seconds": None,
                },
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": [
            {"client_event_id": "android-event-1", "status": "accepted"},
            {"client_event_id": "android-event-2", "status": "accepted"},
        ],
        "failed": [],
    }
    events = list(db_session.scalars(select(PlaybackEvent)))
    assert [event.client_event_id for event in events] == [
        "android-event-1",
        "android-event-2",
    ]
    assert events[0].track_id == track.id
    assert events[0].event_type == "play"
    assert events[0].client == "android"


def test_sync_playback_events_reports_unowned_track_without_insert(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden_track = create_track(db_session, other_user)

    response = client.post(
        "/api/playback-events",
        json={"events": [playback_event_payload(hidden_track.id)]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": [],
        "failed": [
            {
                "client_event_id": "android-event-1",
                "track_id": hidden_track.id,
                "status": "failed",
                "error": "Track not found for current user.",
            },
        ],
    }
    assert list(db_session.scalars(select(PlaybackEvent))) == []


def test_sync_playback_events_validates_payload(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(
        "/api/playback-events",
        json={
            "events": [
                {
                    **playback_event_payload(track.id),
                    "event_type": "buffer",
                    "position_seconds": -1,
                },
            ],
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 422


def test_sync_playback_events_duplicate_retry_is_idempotent(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    payload = {"events": [playback_event_payload(track.id)]}

    first_response = client.post(
        "/api/playback-events",
        json=payload,
        headers=auth_headers(user),
    )
    retry_response = client.post(
        "/api/playback-events",
        json=payload,
        headers=auth_headers(user),
    )

    assert first_response.status_code == 200
    assert retry_response.status_code == 200
    assert retry_response.json() == {
        "accepted": [{"client_event_id": "android-event-1", "status": "duplicate"}],
        "failed": [],
    }
    assert len(list(db_session.scalars(select(PlaybackEvent)))) == 1
