from collections.abc import Generator
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
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


def create_tag(
    db_session: Session,
    user: User,
    name: str = "Focus",
    group: str = "scene",
) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
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
    assert response.headers["X-Total-Count"] == "1"


def test_list_tracks_searches_metadata_and_owned_tag_names(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    title_match = create_track(db_session, owner, title="Midnight Focus")
    artist_match = create_track(db_session, owner, title="Artist Match")
    artist_match.artist = "Quiet Ensemble"
    album_match = create_track(db_session, owner, title="Album Match")
    album_match.album = "Quiet Hours"
    tag_match = create_track(db_session, owner, title="Tag Match")
    quiet_tag = create_tag(db_session, owner, name="Quiet Room")
    db_session.add(TrackTag(track_id=tag_match.id, tag_id=quiet_tag.id))
    hidden_track = create_track(db_session, other_user, title="Hidden Quiet")
    hidden_tag = create_tag(db_session, other_user, name="Quiet Secret")
    db_session.add(TrackTag(track_id=hidden_track.id, tag_id=hidden_tag.id))
    db_session.commit()

    response = client.get(
        "/api/tracks?q=quiet&sort=title",
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert [track["title"] for track in response.json()] == [
        "Album Match",
        "Artist Match",
        "Tag Match",
    ]
    assert response.headers["X-Total-Count"] == "3"
    assert title_match.id not in {track["id"] for track in response.json()}


def test_list_tracks_filters_by_status_liked_content_type_and_all_tags(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, name="Focus")
    calm = create_tag(db_session, user, name="Calm", group="feature")
    matching = create_track(db_session, user, title="Matching")
    matching.status = "ready"
    matching.liked = True
    matching.content_type = "song"
    partial = create_track(db_session, user, title="Partial")
    partial.status = "ready"
    partial.liked = True
    partial.content_type = "song"
    wrong_status = create_track(db_session, user, title="Wrong Status")
    wrong_status.status = "failed"
    wrong_status.liked = True
    wrong_status.content_type = "song"
    db_session.add_all(
        [
            TrackTag(track_id=matching.id, tag_id=focus.id),
            TrackTag(track_id=matching.id, tag_id=calm.id),
            TrackTag(track_id=partial.id, tag_id=focus.id),
            TrackTag(track_id=wrong_status.id, tag_id=focus.id),
            TrackTag(track_id=wrong_status.id, tag_id=calm.id),
        ],
    )
    db_session.commit()

    response = client.get(
        (
            "/api/tracks?status=ready&liked=true&content_type=song"
            f"&tag_id={focus.id}&tag_id={calm.id}"
        ),
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert [track["title"] for track in response.json()] == ["Matching"]
    assert response.headers["X-Total-Count"] == "1"


def test_list_tracks_paginates_with_stable_sort_and_total_count(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, title="Charlie")
    first_bravo = create_track(db_session, user, title="Bravo")
    second_bravo = create_track(db_session, user, title="Bravo")
    create_track(db_session, user, title="Alpha")

    response = client.get(
        "/api/tracks?sort=title&order=asc&limit=2&offset=1",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert [track["id"] for track in response.json()] == [
        first_bravo.id,
        second_bravo.id,
    ]
    assert response.headers["X-Total-Count"] == "4"


@pytest.mark.parametrize(
    "query",
    [
        "sort=unknown",
        "order=sideways",
        "limit=0",
        "limit=101",
        "offset=-1",
        "tag_id=0",
    ],
)
def test_list_tracks_rejects_invalid_query_parameters(
    client: TestClient,
    db_session: Session,
    query: str,
) -> None:
    user = create_user(db_session)

    response = client.get(f"/api/tracks?{query}", headers=auth_headers(user))

    assert response.status_code == 422


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


def test_retry_failed_audio_processing_creates_one_pending_job(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    original = tmp_path / "originals" / "track.mp3"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track.status = "failed"
    failed_job = ProcessingJob(
        track_id=track.id,
        status="failed",
        job_type="audio_processing",
        error_message="ffmpeg failed",
    )
    db_session.add(failed_job)
    db_session.commit()

    response = client.post(
        f"/api/tracks/{track.id}/retry-processing",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "processing"
    assert response.json()["processing_job_status"] == "pending"
    jobs = list(
        db_session.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.track_id == track.id)
            .order_by(ProcessingJob.id),
        ),
    )
    assert [(job.status, job.job_type) for job in jobs] == [
        ("failed", "audio_processing"),
        ("pending", "audio_processing"),
    ]


def test_retry_failed_video_uses_retained_video_or_extracted_original(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    retained_track = create_track(db_session, user, title="Retained video")
    retained_track.original_file_path = None
    retained_track.status = "failed"
    retained_source = "temp-videos/retained.mp4"
    retained_file = tmp_path / retained_source
    retained_file.parent.mkdir(parents=True)
    retained_file.write_bytes(b"video")
    extracted_track = create_track(db_session, user, title="Extracted audio")
    extracted_track.status = "failed"
    original = tmp_path / "originals" / "track.mp3"
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(b"audio")
    db_session.add_all(
        [
            ProcessingJob(
                track_id=retained_track.id,
                status="failed",
                job_type="video_extraction",
                source_path=retained_source,
            ),
            ProcessingJob(
                track_id=extracted_track.id,
                status="failed",
                job_type="video_extraction",
                source_path="temp-videos/already-consumed.mp4",
            ),
        ],
    )
    db_session.commit()

    retained_response = client.post(
        f"/api/tracks/{retained_track.id}/retry-processing",
        headers=auth_headers(user),
    )
    extracted_response = client.post(
        f"/api/tracks/{extracted_track.id}/retry-processing",
        headers=auth_headers(user),
    )

    assert retained_response.status_code == 200
    assert extracted_response.status_code == 200
    newest_jobs = {
        track_id: db_session.scalar(
            select(ProcessingJob)
            .where(ProcessingJob.track_id == track_id)
            .order_by(ProcessingJob.id.desc()),
        )
        for track_id in (retained_track.id, extracted_track.id)
    }
    assert newest_jobs[retained_track.id].job_type == "video_extraction"
    assert newest_jobs[retained_track.id].source_path == retained_source
    assert newest_jobs[extracted_track.id].job_type == "audio_processing"
    assert newest_jobs[extracted_track.id].source_path is None


def test_retry_processing_recovers_stale_running_job(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    original = tmp_path / "originals" / "track.mp3"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"audio")
    track.status = "processing"
    stale_job = ProcessingJob(
        track_id=track.id,
        status="running",
        job_type="audio_processing",
        started_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    db_session.add(stale_job)
    db_session.commit()

    response = client.post(
        f"/api/tracks/{track.id}/retry-processing",
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    db_session.refresh(stale_job)
    assert stale_job.status == "failed"
    assert "configured running timeout" in (stale_job.error_message or "")
    assert response.json()["processing_job_status"] == "pending"


def test_retry_processing_rejects_active_missing_and_unowned_sources(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    active_track = create_track(db_session, owner, title="Active")
    active_track.status = "processing"
    missing_track = create_track(db_session, owner, title="Missing")
    missing_track.status = "failed"
    hidden_track = create_track(db_session, other, title="Hidden")
    hidden_track.status = "failed"
    unsafe_video_track = create_track(db_session, owner, title="Wrong video location")
    unsafe_video_track.original_file_path = None
    unsafe_video_track.status = "failed"
    wrong_location = tmp_path / "originals" / "retained.mp4"
    wrong_location.parent.mkdir(parents=True)
    wrong_location.write_bytes(b"video")
    db_session.add_all(
        [
            ProcessingJob(track_id=active_track.id, status="pending"),
            ProcessingJob(track_id=missing_track.id, status="failed"),
            ProcessingJob(track_id=hidden_track.id, status="failed"),
            ProcessingJob(
                track_id=unsafe_video_track.id,
                status="failed",
                job_type="video_extraction",
                source_path="originals/retained.mp4",
            ),
        ],
    )
    db_session.commit()

    active_response = client.post(
        f"/api/tracks/{active_track.id}/retry-processing",
        headers=auth_headers(owner),
    )
    missing_response = client.post(
        f"/api/tracks/{missing_track.id}/retry-processing",
        headers=auth_headers(owner),
    )
    hidden_response = client.post(
        f"/api/tracks/{hidden_track.id}/retry-processing",
        headers=auth_headers(owner),
    )
    unsafe_video_response = client.post(
        f"/api/tracks/{unsafe_video_track.id}/retry-processing",
        headers=auth_headers(owner),
    )

    assert active_response.status_code == 409
    assert missing_response.status_code == 409
    assert "source media is missing" in missing_response.json()["detail"]
    assert hidden_response.status_code == 404
    assert unsafe_video_response.status_code == 409


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


def test_batch_adds_tags_to_selected_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, title="First")
    second = create_track(db_session, user, title="Second")
    tag = create_tag(db_session, user, name="Focus")

    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [first.id, second.id], "add_tag_ids": [tag.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested_track_count"] == 2
    assert body["updated_count"] == 2
    assert body["results"] == [
        {"track_id": first.id, "status": "updated", "error": None},
        {"track_id": second.id, "status": "updated", "error": None},
    ]
    assert [track["id"] for track in body["tracks"]] == [first.id, second.id]
    assert [tag["name"] for tag in body["tracks"][0]["tags"]] == ["Focus"]
    assert [tag["name"] for tag in body["tracks"][1]["tags"]] == ["Focus"]


def test_batch_removes_tags_from_selected_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, title="First")
    second = create_track(db_session, user, title="Second")
    keep = create_tag(db_session, user, name="Keep", group="feature")
    remove = create_tag(db_session, user, name="Remove", group="type")
    for track in (first, second):
        db_session.add(TrackTag(track_id=track.id, tag_id=keep.id))
        db_session.add(TrackTag(track_id=track.id, tag_id=remove.id))
    db_session.commit()

    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [first.id, second.id], "remove_tag_ids": [remove.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["updated_count"] == 2
    assert [tag["name"] for tag in response.json()["tracks"][0]["tags"]] == ["Keep"]
    assert [tag["name"] for tag in response.json()["tracks"][1]["tags"]] == ["Keep"]


def test_batch_tag_update_rejects_invalid_tag(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, user)
    hidden_tag = create_tag(db_session, other_user)

    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [track.id], "add_tag_ids": [hidden_tag.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Tag not found for current user."
    assert db_session.query(TrackTag).filter_by(track_id=track.id).count() == 0


def test_batch_tag_update_reports_invalid_track_as_partial_failure(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    tag = create_tag(db_session, user)
    missing_track_id = track.id + 100

    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [track.id, missing_track_id], "add_tag_ids": [tag.id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested_track_count"] == 2
    assert body["updated_count"] == 1
    assert body["results"] == [
        {"track_id": track.id, "status": "updated", "error": None},
        {
            "track_id": missing_track_id,
            "status": "failed",
            "error": "Track not found for current user.",
        },
    ]
    assert [tag["name"] for tag in body["tracks"][0]["tags"]] == ["Focus"]


def test_batch_tag_update_is_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    owner_track = create_track(db_session, owner, title="Owner")
    other_track = create_track(db_session, other_user, title="Hidden")
    tag = create_tag(db_session, owner)

    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [owner_track.id, other_track.id], "add_tag_ids": [tag.id]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated_count"] == 1
    assert body["results"][1] == {
        "track_id": other_track.id,
        "status": "failed",
        "error": "Track not found for current user.",
    }
    assert db_session.query(TrackTag).filter_by(track_id=owner_track.id).count() == 1
    assert db_session.query(TrackTag).filter_by(track_id=other_track.id).count() == 0


def test_batch_tag_update_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [1], "add_tag_ids": [1]},
    )

    assert response.status_code == 401


def test_batch_tag_update_requires_selection_and_tag_action(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    no_tracks_response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [], "add_tag_ids": [1]},
        headers=auth_headers(user),
    )
    no_tag_action_response = client.post(
        "/api/tracks/batch-tags",
        json={"track_ids": [track.id]},
        headers=auth_headers(user),
    )

    assert no_tracks_response.status_code == 400
    assert no_tracks_response.json()["detail"] == "Choose at least one track."
    assert no_tag_action_response.status_code == 400
    assert no_tag_action_response.json()["detail"] == (
        "Choose at least one tag to add or remove."
    )


def test_batch_delete_tracks_removes_selected_tracks_and_media_files(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, title="First")
    second = create_track(db_session, user, title="Second")
    tag = create_tag(db_session, user)

    for track in (first, second):
        track.original_file_path = f"originals/user-{user.id}/track-{track.id}/track.mp3"
        track.playback_file_path = f"playback/user-{user.id}/track-{track.id}/playback.mp3"
        track.cover_path = f"covers/user-{user.id}/track-{track.id}/cover.jpg"
        db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
        db_session.add(ProcessingJob(track_id=track.id, status="pending"))
    db_session.commit()
    db_session.refresh(first)
    db_session.refresh(second)
    first_id = first.id
    second_id = second.id

    media_paths = [
        tmp_path / track_path
        for track in (first, second)
        for track_path in (
            track.original_file_path,
            track.playback_file_path,
            track.cover_path,
        )
        if track_path is not None
    ]
    media_dirs = [media_path.parent for media_path in media_paths]
    for media_path in media_paths:
        media_path.parent.mkdir(parents=True, exist_ok=True)
        media_path.write_bytes(b"media")

    response = client.post(
        "/api/tracks/batch-delete",
        json={"track_ids": [first_id, second_id, first_id]},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested_track_count"] == 2
    assert body["deleted_count"] == 2
    assert body["results"] == [
        {"track_id": first_id, "status": "deleted", "error": None},
        {"track_id": second_id, "status": "deleted", "error": None},
    ]
    assert db_session.get(Track, first_id) is None
    assert db_session.get(Track, second_id) is None
    assert (
        db_session.query(TrackTag)
        .filter(TrackTag.track_id.in_([first_id, second_id]))
        .count()
        == 0
    )
    assert (
        db_session.query(ProcessingJob)
        .filter(ProcessingJob.track_id.in_([first_id, second_id]))
        .count()
        == 0
    )
    for media_path in media_paths:
        assert not media_path.exists()
    for media_dir in media_dirs:
        assert not media_dir.exists()


def test_batch_delete_tracks_is_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    owner_track = create_track(db_session, owner, title="Owner")
    other_track = create_track(db_session, other_user, title="Hidden")
    owner_track_id = owner_track.id
    other_track_id = other_track.id
    missing_track_id = other_track_id + 100

    response = client.post(
        "/api/tracks/batch-delete",
        json={"track_ids": [owner_track_id, other_track_id, missing_track_id]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requested_track_count"] == 3
    assert body["deleted_count"] == 1
    assert body["results"] == [
        {"track_id": owner_track_id, "status": "deleted", "error": None},
        {
            "track_id": other_track_id,
            "status": "failed",
            "error": "Track not found for current user.",
        },
        {
            "track_id": missing_track_id,
            "status": "failed",
            "error": "Track not found for current user.",
        },
    ]
    assert db_session.get(Track, owner_track_id) is None
    assert db_session.get(Track, other_track_id) is not None


def test_batch_delete_tracks_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/tracks/batch-delete",
        json={"track_ids": [1]},
    )

    assert response.status_code == 401


def test_batch_delete_tracks_requires_selection(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/tracks/batch-delete",
        json={"track_ids": []},
        headers=auth_headers(user),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Choose at least one track."


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
            scene_tag_ids=[],
            feature_tag_ids=[],
            type_tag_ids=[],
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


def test_delete_track_removes_empty_track_media_directories(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.original_file_path = f"originals/user-{user.id}/track-{track.id}/track.mp3"
    track.playback_file_path = f"playback/user-{user.id}/track-{track.id}/playback.mp3"
    track.cover_path = f"covers/user-{user.id}/track-{track.id}/cover.jpg"
    db_session.commit()
    db_session.refresh(track)

    media_paths = [
        tmp_path / track.original_file_path,
        tmp_path / track.playback_file_path,
        tmp_path / track.cover_path,
    ]
    media_dirs = [media_path.parent for media_path in media_paths]
    for media_path in media_paths:
        media_path.parent.mkdir(parents=True, exist_ok=True)
        media_path.write_bytes(b"media")

    response = client.delete(f"/api/tracks/{track.id}", headers=auth_headers(user))

    assert response.status_code == 204
    for media_path in media_paths:
        assert not media_path.exists()
    for media_dir in media_dirs:
        assert not media_dir.exists()


def test_delete_track_keeps_non_empty_track_media_directory_and_logs_reason(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.original_file_path = f"originals/user-{user.id}/track-{track.id}/track.mp3"
    db_session.commit()
    db_session.refresh(track)

    original_path = tmp_path / track.original_file_path
    original_path.parent.mkdir(parents=True, exist_ok=True)
    original_path.write_bytes(b"media")
    sibling_path = original_path.parent / "keep.txt"
    sibling_path.write_text("do not delete")

    with caplog.at_level(logging.INFO, logger="app.services.tracks"):
        response = client.delete(f"/api/tracks/{track.id}", headers=auth_headers(user))

    assert response.status_code == 204
    assert not original_path.exists()
    assert sibling_path.read_text() == "do not delete"
    assert original_path.parent.exists()
    assert "directory is not empty" in caplog.text


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


def test_create_stream_url_returns_track_bound_stream_url(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True)
    playback_path.write_bytes(b"0123456789")

    url_response = client.post(
        f"/api/tracks/{track.id}/stream-url",
        headers=auth_headers(user),
    )

    assert url_response.status_code == 200
    body = url_response.json()
    assert body["stream_url"].startswith(f"/api/tracks/{track.id}/stream?token=")
    assert isinstance(body["expires_at"], int)

    stream_response = client.get(
        body["stream_url"],
        headers={"Range": "bytes=2-5"},
    )

    assert stream_response.status_code == 206
    assert stream_response.headers["content-range"] == "bytes 2-5/10"
    assert stream_response.content == b"2345"


def test_stream_url_requires_authentication(client: TestClient, db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.post(f"/api/tracks/{track.id}/stream-url")

    assert response.status_code == 401


def test_stream_url_rejects_non_ready_track(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.status = "processing"
    db_session.commit()

    response = client.post(
        f"/api/tracks/{track.id}/stream-url",
        headers=auth_headers(user),
    )

    assert response.status_code == 404


def test_track_stream_token_cannot_stream_another_track(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, title="First")
    second = create_track(db_session, user, title="Second")
    first_path = tmp_path / first.playback_file_path
    second_path = tmp_path / second.playback_file_path
    first_path.parent.mkdir(parents=True, exist_ok=True)
    second_path.parent.mkdir(parents=True, exist_ok=True)
    first_path.write_bytes(b"first")
    second_path.write_bytes(b"second")

    url_response = client.post(
        f"/api/tracks/{first.id}/stream-url",
        headers=auth_headers(user),
    )
    token = url_response.json()["stream_url"].split("token=", maxsplit=1)[1]

    response = client.get(f"/api/tracks/{second.id}/stream?token={token}")

    assert response.status_code == 401


def test_access_token_cannot_be_used_as_stream_query_token(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    playback_path = tmp_path / track.playback_file_path
    playback_path.parent.mkdir(parents=True)
    playback_path.write_bytes(b"audio")
    access_token = auth_headers(user)["Authorization"].removeprefix("Bearer ")

    response = client.get(
        f"/api/tracks/{track.id}/stream?token={access_token}",
    )

    assert response.status_code == 401


def test_stream_track_rejects_invalid_query_token(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.get(f"/api/tracks/{track.id}/stream?token=not-a-token")

    assert response.status_code == 401


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


def test_update_track_cover_saves_valid_image(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.put(
        f"/api/tracks/{track.id}/cover",
        files={
            "file": (
                "../cover.png",
                b"\x89PNG\r\n\x1a\ncover bytes",
                "image/png",
            ),
        },
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["cover_path"].startswith(f"covers/user-{user.id}/track-{track.id}/")
    assert body["cover_path"].endswith("_cover.png")
    assert ".." not in body["cover_path"]

    db_session.refresh(track)
    assert track.cover_path == body["cover_path"]
    assert (tmp_path / track.cover_path).read_bytes() == b"\x89PNG\r\n\x1a\ncover bytes"


def test_update_track_cover_requires_authentication(client: TestClient) -> None:
    response = client.put(
        "/api/tracks/1/cover",
        files={"file": ("cover.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )

    assert response.status_code == 401


def test_update_track_cover_is_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden_track = create_track(db_session, other_user)

    response = client.put(
        f"/api/tracks/{hidden_track.id}/cover",
        files={"file": ("cover.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        headers=auth_headers(owner),
    )

    assert response.status_code == 404


def test_update_track_cover_rejects_invalid_content_type(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.put(
        f"/api/tracks/{track.id}/cover",
        files={"file": ("cover.txt", b"not an image", "text/plain")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Unsupported cover image type."


def test_update_track_cover_rejects_mismatched_image_content(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)

    response = client.put(
        f"/api/tracks/{track.id}/cover",
        files={"file": ("cover.png", b"not a png", "image/png")},
        headers=auth_headers(user),
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Uploaded cover image content does not match its type."


def test_update_track_cover_rejects_oversized_file(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    content = b"\x89PNG\r\n\x1a\n" + b"x" * (10 * 1024 * 1024 + 1)

    response = client.put(
        f"/api/tracks/{track.id}/cover",
        files={"file": ("cover.png", content, "image/png")},
        headers=auth_headers(user),
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Cover image exceeds the configured size limit."


def test_get_track_cover_returns_stored_image(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.cover_path = "covers/user-1/track-1/cover.jpg"
    db_session.commit()
    cover_path = tmp_path / track.cover_path
    cover_path.parent.mkdir(parents=True)
    cover_path.write_bytes(b"\xff\xd8\xffjpeg")

    response = client.get(f"/api/tracks/{track.id}/cover", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert response.content == b"\xff\xd8\xffjpeg"


def test_get_track_cover_rejects_unsafe_path(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    track.cover_path = "../outside.jpg"
    db_session.commit()

    response = client.get(f"/api/tracks/{track.id}/cover", headers=auth_headers(user))

    assert response.status_code == 404
