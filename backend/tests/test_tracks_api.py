from collections.abc import Generator
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.media.storage import MediaStorage, get_media_storage
from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.processing_job import ProcessingJob
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
def client(db_session: Session, tmp_path: Path) -> Generator[TestClient]:
    app = create_app()
    storage = MediaStorage(Settings(media_root=str(tmp_path)))

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_media_storage] = lambda: storage
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


def create_tag(db_session: Session, user: User, name: str = "Focus") -> Tag:
    tag = Tag(user_id=user.id, name=name, group="scenario")
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def test_list_tracks_returns_only_current_users_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    create_track(db_session, owner, title="Visible")
    create_track(db_session, other_user, title="Hidden")

    response = client.get("/api/tracks", headers=auth_headers(owner))

    assert response.status_code == 200
    assert [track["title"] for track in response.json()] == ["Visible"]


def test_get_track_detail(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    tag = create_tag(db_session, user)
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()

    response = client.get(f"/api/tracks/{track.id}", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Track One"
    assert body["artist"] == "Artist"
    assert body["tags"][0]["name"] == "Focus"
    assert body["processing_job_status"] is None
    assert body["processing_error_message"] is None


def test_get_track_detail_includes_latest_processing_failure(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.status = "failed"
    db_session.add(
        ProcessingJob(
            track_id=track.id,
            status="failed",
            error_message="ffmpeg could not decode the uploaded file",
        ),
    )
    db_session.commit()

    response = client.get(f"/api/tracks/{track.id}", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["processing_job_status"] == "failed"
    assert body["processing_error_message"] == "ffmpeg could not decode the uploaded file"


def test_update_track_metadata(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    cooldown_until = datetime(2026, 6, 10, tzinfo=timezone.utc).isoformat()

    response = client.patch(
        f"/api/tracks/{track.id}",
        json={
            "title": "Updated",
            "artist": "New Artist",
            "album": "New Album",
            "content_type": "mix",
            "source_url": "https://example.com/source",
            "liked": True,
            "cooldown_until": cooldown_until,
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated"
    assert body["artist"] == "New Artist"
    assert body["album"] == "New Album"
    assert body["content_type"] == "mix"
    assert body["source_url"] == "https://example.com/source"
    assert body["liked"] is True
    assert body["cooldown_until"] is not None


def test_update_track_tag_associations(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    focus = create_tag(db_session, user, name="Focus")
    calm = create_tag(db_session, user, name="Calm")

    response = client.patch(
        f"/api/tracks/{track.id}",
        json={"tag_ids": [focus.id, calm.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert [tag["name"] for tag in response.json()["tags"]] == ["Focus", "Calm"]

    response = client.patch(
        f"/api/tracks/{track.id}",
        json={"tag_ids": []},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["tags"] == []


def test_cannot_associate_another_users_tag(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, owner)
    hidden_tag = create_tag(db_session, other_user)

    response = client.patch(
        f"/api/tracks/{track.id}",
        json={"tag_ids": [hidden_tag.id]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 404


def test_delete_track(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    tag = create_tag(db_session, user)
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()

    response = client.delete(f"/api/tracks/{track.id}", headers=auth_headers(user))

    assert response.status_code == 204
    assert db_session.get(Track, track.id) is None
    assert db_session.get(TrackTag, (track.id, tag.id)) is None


def test_delete_track_removes_related_rows_and_media_files(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.cover_path = "covers/track.jpg"
    tag = create_tag(db_session, user)
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.add(
        PlaybackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id="playback-delete-test",
            event_type="play",
            position_seconds=0,
            duration_seconds=180,
            occurred_at=datetime.now(timezone.utc),
            client="web",
        ),
    )
    db_session.add(
        FeedbackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id="feedback-delete-test",
            feedback_type="like",
            scenario_tag_ids=[],
            state_tag_ids=[],
            type_tag_ids=[],
            attribute_tag_ids=[],
            occurred_at=datetime.now(timezone.utc),
            client="web",
        ),
    )
    db_session.add(ProcessingJob(track_id=track.id, status="pending"))
    db_session.commit()
    db_session.refresh(track)

    media_paths = [
        tmp_path / track.original_file_path,
        tmp_path / track.playback_file_path,
        tmp_path / track.cover_path,
    ]
    for media_path in media_paths:
        media_path.parent.mkdir(parents=True, exist_ok=True)
        media_path.write_bytes(b"media")

    track_id = track.id
    tag_id = tag.id

    response = client.delete(f"/api/tracks/{track_id}", headers=auth_headers(user))

    assert response.status_code == 204
    assert db_session.get(Track, track_id) is None
    assert db_session.get(TrackTag, (track_id, tag_id)) is None
    assert db_session.query(PlaybackEvent).filter_by(track_id=track_id).count() == 0
    assert db_session.query(FeedbackEvent).filter_by(track_id=track_id).count() == 0
    assert db_session.query(ProcessingJob).filter_by(track_id=track_id).count() == 0
    for media_path in media_paths:
        assert not media_path.exists()


def test_delete_track_reports_media_file_failure(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    tag = create_tag(db_session, user)
    db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()

    original_path = tmp_path / track.original_file_path
    original_path.parent.mkdir(parents=True, exist_ok=True)
    original_path.write_bytes(b"original")
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True, exist_ok=True)
    playback_path.write_bytes(b"playback")

    def failing_unlink(self: Path, missing_ok: bool = False) -> None:
        raise PermissionError("permission denied")

    monkeypatch.setattr(Path, "unlink", failing_unlink)
    track_id = track.id
    tag_id = tag.id

    response = client.delete(f"/api/tracks/{track_id}", headers=auth_headers(user))

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Unable to delete stored media file 'originals/track.mp3'. "
        "Check backend media volume permissions and try again."
    )
    assert db_session.get(Track, track_id) is not None
    assert db_session.get(TrackTag, (track_id, tag_id)) is not None
    assert original_path.exists()
    assert playback_path.exists()


def test_delete_track_rejects_unsafe_media_path(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.original_file_path = "../outside.mp3"
    db_session.commit()
    track_id = track.id

    response = client.delete(f"/api/tracks/{track_id}", headers=auth_headers(user))

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Track references an unsafe stored media path and was not deleted."
    )
    assert db_session.get(Track, track_id) is not None


def test_cannot_delete_another_users_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, other_user)
    track_id = track.id

    response = client.delete(f"/api/tracks/{track_id}", headers=auth_headers(owner))

    assert response.status_code == 404
    assert db_session.get(Track, track_id) is not None


def test_tracks_require_authentication(client: TestClient) -> None:
    response = client.get("/api/tracks")

    assert response.status_code == 401


def test_cannot_access_another_users_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, other_user)

    response = client.get(f"/api/tracks/{track.id}", headers=auth_headers(owner))

    assert response.status_code == 404


def test_stream_track_returns_playback_file(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True)
    playback_path.write_bytes(b"0123456789")

    response = client.get(f"/api/tracks/{track.id}/stream", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "10"
    assert response.content == b"0123456789"


def test_stream_track_supports_range_requests(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True)
    playback_path.write_bytes(b"0123456789")

    response = client.get(
        f"/api/tracks/{track.id}/stream",
        headers={**auth_headers(user), "Range": "bytes=2-5"},
    )

    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["content-length"] == "4"
    assert response.content == b"2345"


def test_stream_track_rejects_invalid_range(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True)
    playback_path.write_bytes(b"0123456789")

    response = client.get(
        f"/api/tracks/{track.id}/stream",
        headers={**auth_headers(user), "Range": "bytes=20-30"},
    )

    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */10"


def test_stream_track_requires_authentication(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.get(f"/api/tracks/{track.id}/stream")

    assert response.status_code == 401


def test_cannot_stream_another_users_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, other_user)

    response = client.get(f"/api/tracks/{track.id}/stream", headers=auth_headers(owner))

    assert response.status_code == 404


def test_cannot_stream_track_that_is_not_ready(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.status = "processing"
    db_session.commit()

    response = client.get(f"/api/tracks/{track.id}/stream", headers=auth_headers(user))

    assert response.status_code == 404


def test_cannot_stream_missing_playback_file(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.get(f"/api/tracks/{track.id}/stream", headers=auth_headers(user))

    assert response.status_code == 404
