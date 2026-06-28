from collections.abc import Generator
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
from app.models.playlist import Playlist, PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.services.playlists import list_playlist_track_signals


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
        original_file_path=f"originals/{title}.mp3",
        playback_file_path=f"playback/{title}.mp3",
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


def create_playlist(
    db_session: Session,
    user: User,
    name: str = "Focus Mix",
    *,
    description: str | None = None,
) -> Playlist:
    playlist = Playlist(user_id=user.id, name=name, description=description)
    db_session.add(playlist)
    db_session.commit()
    db_session.refresh(playlist)
    return playlist


def add_playlist_track(
    db_session: Session,
    playlist: Playlist,
    track: Track,
    position: int = 1,
) -> PlaylistTrack:
    membership = PlaylistTrack(
        playlist_id=playlist.id,
        track_id=track.id,
        position=position,
    )
    db_session.add(membership)
    db_session.commit()
    db_session.refresh(membership)
    return membership


def test_create_and_list_playlists_are_scoped_to_current_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    create_playlist(db_session, other_user, name="Hidden")

    response = client.post(
        "/api/playlists",
        json={
            "name": "  Study queue  ",
            "description": "  Focus sessions and reading  ",
        },
        headers=auth_headers(owner),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Study queue"
    assert body["description"] == "Focus sessions and reading"
    assert body["track_count"] == 0
    assert body["tracks"] == []

    list_response = client.get("/api/playlists", headers=auth_headers(owner))

    assert list_response.status_code == 200
    assert [playlist["name"] for playlist in list_response.json()] == ["Study queue"]
    assert [playlist["description"] for playlist in list_response.json()] == [
        "Focus sessions and reading",
    ]


def test_get_update_and_delete_playlist(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner, name="Morning")

    update_response = client.patch(
        f"/api/playlists/{playlist.id}",
        json={"name": "Night", "description": "Late sessions"},
        headers=auth_headers(owner),
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Night"
    assert update_response.json()["description"] == "Late sessions"

    get_response = client.get(
        f"/api/playlists/{playlist.id}",
        headers=auth_headers(owner),
    )
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Night"
    assert get_response.json()["description"] == "Late sessions"

    delete_response = client.delete(
        f"/api/playlists/{playlist.id}",
        headers=auth_headers(owner),
    )

    assert delete_response.status_code == 204
    assert db_session.get(Playlist, playlist.id) is None


def test_playlist_crud_rejects_another_users_playlist(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    hidden_playlist = create_playlist(db_session, other_user)

    assert client.get(
        f"/api/playlists/{hidden_playlist.id}",
        headers=auth_headers(owner),
    ).status_code == 404
    assert client.patch(
        f"/api/playlists/{hidden_playlist.id}",
        json={"name": "Nope"},
        headers=auth_headers(owner),
    ).status_code == 404
    assert client.delete(
        f"/api/playlists/{hidden_playlist.id}",
        headers=auth_headers(owner),
    ).status_code == 404
    assert db_session.get(Playlist, hidden_playlist.id) is not None


def test_add_track_to_playlist_is_idempotent(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner)
    track = create_track(db_session, owner)

    for _ in range(2):
        response = client.post(
            f"/api/playlists/{playlist.id}/tracks",
            json={"track_id": track.id},
            headers=auth_headers(owner),
        )
        assert response.status_code == 200
        assert response.json()["track_count"] == 1
        assert [item["track"]["id"] for item in response.json()["tracks"]] == [track.id]

    assert db_session.query(PlaylistTrack).filter_by(playlist_id=playlist.id).count() == 1


def test_add_track_to_playlist_rejects_another_users_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    playlist = create_playlist(db_session, owner)
    hidden_track = create_track(db_session, other_user, title="Hidden")

    response = client.post(
        f"/api/playlists/{playlist.id}/tracks",
        json={"track_id": hidden_track.id},
        headers=auth_headers(owner),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Track not found."
    assert db_session.query(PlaylistTrack).filter_by(playlist_id=playlist.id).count() == 0


def test_remove_track_from_playlist_compacts_order(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner)
    first = create_track(db_session, owner, title="First")
    second = create_track(db_session, owner, title="Second")
    third = create_track(db_session, owner, title="Third")
    add_playlist_track(db_session, playlist, first, position=1)
    add_playlist_track(db_session, playlist, second, position=2)
    add_playlist_track(db_session, playlist, third, position=3)

    response = client.delete(
        f"/api/playlists/{playlist.id}/tracks/{second.id}",
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert [
        (item["track"]["id"], item["position"])
        for item in response.json()["tracks"]
    ] == [(first.id, 1), (third.id, 2)]
    assert db_session.get(PlaylistTrack, (playlist.id, second.id)) is None


def test_reorder_playlist_tracks(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner)
    first = create_track(db_session, owner, title="First")
    second = create_track(db_session, owner, title="Second")
    third = create_track(db_session, owner, title="Third")
    add_playlist_track(db_session, playlist, first, position=1)
    add_playlist_track(db_session, playlist, second, position=2)
    add_playlist_track(db_session, playlist, third, position=3)

    response = client.put(
        f"/api/playlists/{playlist.id}/tracks/order",
        json={"track_ids": [third.id, first.id, second.id]},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    assert [
        (item["track"]["id"], item["position"])
        for item in response.json()["tracks"]
    ] == [(third.id, 1), (first.id, 2), (second.id, 3)]


@pytest.mark.parametrize(
    ("track_ids", "message"),
    [
        ([1, 1], "Playlist order cannot contain duplicate track ids."),
        ([1], "Playlist order must contain exactly the current playlist tracks."),
        ([1, 2, 999], "Playlist order must contain exactly the current playlist tracks."),
    ],
)
def test_reorder_playlist_tracks_validates_current_membership(
    client: TestClient,
    db_session: Session,
    track_ids: list[int],
    message: str,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner)
    first = create_track(db_session, owner, title="First")
    second = create_track(db_session, owner, title="Second")
    add_playlist_track(db_session, playlist, first, position=1)
    add_playlist_track(db_session, playlist, second, position=2)
    requested_track_ids = [
        first.id if track_id == 1 else second.id if track_id == 2 else track_id
        for track_id in track_ids
    ]

    response = client.put(
        f"/api/playlists/{playlist.id}/tracks/order",
        json={"track_ids": requested_track_ids},
        headers=auth_headers(owner),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == message


def test_playlist_track_mutations_reject_another_users_playlist(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    track = create_track(db_session, owner)
    hidden_playlist = create_playlist(db_session, other_user)

    add_response = client.post(
        f"/api/playlists/{hidden_playlist.id}/tracks",
        json={"track_id": track.id},
        headers=auth_headers(owner),
    )
    remove_response = client.delete(
        f"/api/playlists/{hidden_playlist.id}/tracks/{track.id}",
        headers=auth_headers(owner),
    )
    reorder_response = client.put(
        f"/api/playlists/{hidden_playlist.id}/tracks/order",
        json={"track_ids": [track.id]},
        headers=auth_headers(owner),
    )

    assert add_response.status_code == 404
    assert remove_response.status_code == 404
    assert reorder_response.status_code == 404


def test_delete_track_removes_playlist_track_relationships(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    playlist = create_playlist(db_session, owner)
    track = create_track(db_session, owner)
    add_playlist_track(db_session, playlist, track)

    response = client.delete(f"/api/tracks/{track.id}", headers=auth_headers(owner))

    assert response.status_code == 204
    assert db_session.get(Track, track.id) is None
    assert db_session.get(Playlist, playlist.id) is not None
    assert db_session.get(PlaylistTrack, (playlist.id, track.id)) is None


def test_playlist_track_signals_are_current_user_scoped(
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    owner_playlist = create_playlist(
        db_session,
        owner,
        name="Owner Focus",
        description="Personal picks",
    )
    other_playlist = create_playlist(db_session, other_user)
    owner_track = create_track(db_session, owner, title="Owner")
    other_track = create_track(db_session, other_user, title="Other")
    add_playlist_track(db_session, owner_playlist, owner_track, position=2)
    add_playlist_track(db_session, other_playlist, other_track, position=1)

    signals = list_playlist_track_signals(db_session, owner)

    assert len(signals) == 1
    assert signals[0].playlist_id == owner_playlist.id
    assert signals[0].track_id == owner_track.id
    assert signals[0].position == 2
    assert signals[0].playlist_name == "Owner Focus"
    assert signals[0].playlist_description == "Personal picks"


def test_playlists_require_authentication(client: TestClient) -> None:
    response = client.get("/api/playlists")

    assert response.status_code == 401
