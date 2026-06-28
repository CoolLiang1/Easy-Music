from collections.abc import Generator
from datetime import datetime, timedelta, timezone

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
from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User


NOW = datetime(2026, 6, 9, 8, 0, tzinfo=timezone.utc)


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    with testing_session_local() as session:
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
    cooldown_until: datetime | None = None,
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist="Artist",
        album="Album",
        duration_seconds=180,
        content_type="song",
        original_file_path=f"originals/{title}.mp3",
        original_file_size_bytes=123,
        original_file_sha256=None,
        playback_file_path=f"playback/{title}.mp3",
        playback_file_sha256=None,
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        normalized_metadata_key=None,
        status=status,
        liked=False,
        cooldown_until=cooldown_until,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def add_playback_event(
    db_session: Session,
    user: User,
    track: Track,
    occurred_at: datetime,
) -> None:
    db_session.add(
        PlaybackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id=f"play-{track.id}-{occurred_at.isoformat()}",
            event_type="play",
            position_seconds=0,
            duration_seconds=track.duration_seconds,
            occurred_at=occurred_at,
            client="web",
        ),
    )
    db_session.commit()


def add_feedback_event(
    db_session: Session,
    user: User,
    track: Track,
    feedback_type: str,
    occurred_at: datetime,
) -> None:
    db_session.add(
        FeedbackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id=f"feedback-{track.id}-{feedback_type}",
            feedback_type=feedback_type,
            occurred_at=occurred_at,
            client="web",
        ),
    )
    db_session.commit()


def assign_tag(db_session: Session, user: User, track: Track) -> None:
    tag = Tag(user_id=user.id, name="Focus", group="scenario")
    db_session.add(tag)
    db_session.commit()
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()


def test_revived_tracks_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/recommendations/revived")

    assert response.status_code == 401


def test_revived_tracks_returns_long_unplayed_before_never_played(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.routes import recommendations

    user = create_user(db_session)
    long_unplayed = create_track(db_session, user, "Long Unplayed")
    never_played = create_track(db_session, user, "Never Played")
    recently_played = create_track(db_session, user, "Recently Played")
    processing = create_track(db_session, user, "Processing", status="processing")
    assign_tag(db_session, user, long_unplayed)
    add_playback_event(db_session, user, long_unplayed, NOW - timedelta(days=45))
    add_playback_event(db_session, user, recently_played, NOW - timedelta(days=2))

    monkeypatch.setattr(
        recommendations.revived_tracks_service,
        "datetime",
        StaticDateTime,
    )

    response = client.get("/api/recommendations/revived", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["long_unplayed_threshold_days"] == 30
    assert [candidate["track"]["title"] for candidate in body["candidates"]] == [
        "Long Unplayed",
        "Never Played",
    ]
    assert body["candidates"][0]["days_since_last_played"] == 45
    assert body["candidates"][0]["playback_count"] == 1
    assert body["candidates"][0]["tag_summary"] == ["Focus"]
    assert "Last played 45 days ago" in body["candidates"][0]["reason"]
    assert body["candidates"][1]["last_played_at"] is None
    assert body["candidates"][1]["days_since_last_played"] is None
    assert "Never played" in body["candidates"][1]["reason"]
    assert processing.title not in str(body)


def test_revived_tracks_suppresses_cooldown_and_strong_negative_feedback(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.routes import recommendations

    monkeypatch.setattr(
        recommendations.revived_tracks_service,
        "datetime",
        StaticDateTime,
    )

    user = create_user(db_session)
    available = create_track(db_session, user, "Available")
    cooldown = create_track(
        db_session,
        user,
        "Cooldown",
        cooldown_until=NOW + timedelta(days=1),
    )
    tired = create_track(db_session, user, "Tired")
    disliked = create_track(db_session, user, "Disliked")
    not_suitable = create_track(db_session, user, "Not Suitable")
    skipped = create_track(db_session, user, "Skipped")
    not_today = create_track(db_session, user, "Not Today")

    for track in [available, cooldown, tired, disliked, not_suitable, skipped, not_today]:
        add_playback_event(db_session, user, track, NOW - timedelta(days=60))
    add_feedback_event(db_session, user, tired, "tired", NOW - timedelta(days=3))
    add_feedback_event(db_session, user, disliked, "dislike", NOW - timedelta(days=3))
    add_feedback_event(
        db_session,
        user,
        not_suitable,
        "not_suitable_for_context",
        NOW - timedelta(days=3),
    )
    add_feedback_event(
        db_session,
        user,
        skipped,
        "skip_recommendation",
        NOW - timedelta(days=3),
    )
    add_feedback_event(db_session, user, not_today, "not_today", NOW)

    response = client.get("/api/recommendations/revived", headers=auth_headers(user))

    assert response.status_code == 200
    assert [candidate["track"]["title"] for candidate in response.json()["candidates"]] == [
        "Available",
    ]


def test_revived_tracks_are_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.routes import recommendations

    monkeypatch.setattr(
        recommendations.revived_tracks_service,
        "datetime",
        StaticDateTime,
    )

    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    visible = create_track(db_session, owner, "Visible")
    hidden = create_track(db_session, other_user, "Hidden")
    add_playback_event(db_session, owner, visible, NOW - timedelta(days=45))
    add_playback_event(db_session, other_user, hidden, NOW - timedelta(days=45))

    response = client.get("/api/recommendations/revived", headers=auth_headers(owner))

    assert response.status_code == 200
    body = response.json()
    assert "Visible" in str(body)
    assert "Hidden" not in str(body)


class StaticDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        if tz is None:
            return NOW.replace(tzinfo=None)
        return NOW.astimezone(tz)
