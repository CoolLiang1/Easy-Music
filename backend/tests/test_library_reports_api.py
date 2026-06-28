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
from app.models.playback_event import PlaybackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User


NOW = datetime(2026, 6, 4, 8, 0, tzinfo=timezone.utc)


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
    artist: str | None = "Artist",
    album: str | None = "Album",
    cover_path: str | None = "covers/track.jpg",
    duration_seconds: int | None = 180,
    original_file_sha256: str | None = None,
    status: str = "ready",
    cooldown_until: datetime | None = None,
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
        playback_file_sha256=None,
        cover_path=cover_path,
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


def create_tag(db_session: Session, user: User) -> Tag:
    tag = Tag(user_id=user.id, name="Focus", group="scene")
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def assign_tag(db_session: Session, track: Track, tag: Tag) -> None:
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()


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


def test_library_report_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/library/reports")

    assert response.status_code == 401


def test_library_report_returns_read_only_cleanup_sections(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    tag = create_tag(db_session, user)
    tagged = create_track(db_session, user, "Tagged")
    assign_tag(db_session, tagged, tag)
    create_track(db_session, user, "Untagged")
    missing = create_track(
        db_session,
        user,
        "Missing",
        artist=None,
        album=None,
        cover_path=None,
        duration_seconds=None,
    )
    processing = create_track(db_session, user, "Processing", status="processing")
    failed = create_track(db_session, user, "Failed", status="failed")
    duplicate_first = create_track(
        db_session,
        user,
        "Duplicate One",
        original_file_sha256="same-hash",
    )
    duplicate_second = create_track(
        db_session,
        user,
        "Duplicate Two",
        original_file_sha256="same-hash",
    )
    never_played = create_track(db_session, user, "Never Played")
    rarely_played = create_track(db_session, user, "Rarely Played")
    recently_played = create_track(db_session, user, "Recently Played")
    stale_cooldown = create_track(
        db_session,
        user,
        "Stale Cooldown",
        cooldown_until=NOW - timedelta(days=1),
    )
    add_playback_event(db_session, user, rarely_played, NOW - timedelta(days=45))
    add_playback_event(db_session, user, recently_played, NOW - timedelta(days=2))

    response = client.get("/api/library/reports", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert "generated_at" in body
    assert {track["title"] for track in body["untagged_ready_tracks"]} >= {
        "Untagged",
        "Missing",
    }
    missing_issue = next(
        issue for issue in body["missing_metadata_tracks"] if issue["track"]["id"] == missing.id
    )
    assert missing_issue["reasons"] == [
        "Missing artist.",
        "Missing album.",
        "Missing duration.",
        "Missing cover.",
    ]
    assert {issue["track"]["title"] for issue in body["processing_tracks"]} == {
        "Processing",
        "Failed",
    }
    assert {issue["reasons"][0] for issue in body["processing_tracks"]} == {
        "Backend processing is still running.",
        "Processing failed.",
    }
    assert len(body["duplicate_groups"]) == 1
    assert body["duplicate_groups"][0]["candidate_track_ids"] == [
        duplicate_first.id,
        duplicate_second.id,
    ]
    assert "original_file_path" not in body["duplicate_groups"][0]["candidates"][0]
    assert never_played.title in {
        track["title"] for track in body["never_played_ready_tracks"]
    }
    assert "Rarely Played" in {track["title"] for track in body["rarely_played_ready_tracks"]}
    assert "Recently Played" not in {
        track["title"] for track in body["rarely_played_ready_tracks"]
    }
    assert body["stale_cooldown_tracks"][0]["track"]["id"] == stale_cooldown.id


def test_library_report_is_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden = create_track(db_session, other_user, "Hidden", original_file_sha256="same-hash")
    create_track(db_session, other_user, "Also Hidden", original_file_sha256="same-hash")
    visible = create_track(db_session, owner, "Visible")

    response = client.get("/api/library/reports", headers=auth_headers(owner))

    assert response.status_code == 200
    body = response.json()
    serialized = str(body)
    assert visible.title in serialized
    assert hidden.title not in serialized
    assert body["duplicate_groups"] == []
