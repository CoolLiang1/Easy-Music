"""Online cover search: matching, rate limit, review flow, safe download, API.

No network: fake clients and downloaders stand in for iTunes.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes.covers import _get_cover_search_client
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.media.storage import MediaStorage, get_media_storage
from app.models.track import Track
from app.models.user import User
from app.services import cover_search
from app.services.cover_search import (
    COVER_SEARCH_VERSION,
    MATCH,
    UNCERTAIN,
    CoverSearchUnavailableError,
    ItunesCoverSearchClient,
    apply_cover_choices,
    count_pending_tracks,
    count_tracks_without_artist,
    download_artwork,
    find_cover,
    search_next_batch,
)

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
ART = "https://is1-ssl.mzstatic.com/image/thumb/Music/ab/cd/100x100bb.jpg"


def item(track: str, artist: str, collection: str = "Album", artwork: str = ART) -> dict[str, Any]:
    return {"trackName": track, "artistName": artist, "collectionName": collection, "artworkUrl100": artwork}


class FakeClient:
    def __init__(self, by_country: dict[str, list[dict[str, Any]]] | None = None, *, fail: bool = False):
        self.by_country = by_country or {}
        self.fail = fail
        self.calls: list[tuple[str, str]] = []

    def search(self, term: str, country: str) -> list[dict[str, Any]]:
        self.calls.append((term, country))
        if self.fail:
            raise CoverSearchUnavailableError("down")
        return self.by_country.get(country, [])


# ---------------------------------------------------------------------------
# matching (cases from the 2026-11-06 live test on the owner's titles)
# ---------------------------------------------------------------------------


def test_exact_title_and_artist_is_a_match_with_large_artwork() -> None:
    client = FakeClient({"JP": [item("Lemon", "米津玄師", "Lemon - Single")]})

    found = find_cover("Lemon", "米津玄師", client)

    assert found is not None and found.confidence == MATCH
    assert found.artwork_url.endswith("/600x600bb.jpg")
    assert client.calls == [("米津玄師 Lemon", "JP")]  # stops at the first confident country


def test_falls_back_to_the_next_country() -> None:
    client = FakeClient({"JP": [], "US": [item("False Alarm", "The Weeknd", "Starboy")]})

    found = find_cover("False Alarm", "The Weeknd", client)

    assert found is not None and found.confidence == MATCH
    assert [country for _, country in client.calls] == ["JP", "US"]


def test_original_release_beats_live_and_variant_releases() -> None:
    client = FakeClient(
        {
            "JP": [
                item("アイドル (DOME LIVE 2024)", "YOASOBI", "5th ANNIVERSARY DOME LIVE"),
                item("アイドル", "YOASOBI", "アイドル - Single"),
            ],
        },
    )

    found = find_cover("アイドル", "YOASOBI", client)

    assert found is not None and found.collection_name == "アイドル - Single"
    assert found.confidence == MATCH


def test_only_a_variant_release_is_uncertain() -> None:
    client = FakeClient({"JP": [], "US": [item("Experience (Reimagined)", "Ludovico Einaudi", "In A Time Lapse (Reimagined)")]})

    found = find_cover("Experience", "Ludovico Einaudi", client)

    assert found is not None and found.confidence == UNCERTAIN


def test_variant_in_the_owner_title_is_not_penalised() -> None:
    client = FakeClient({"JP": [item("I Want My Tears Back (Live)", "Nightwish", "Live at Wembley")]})

    found = find_cover("I Want My Tears Back (Live)", "Nightwish", client)

    assert found is not None and found.confidence == MATCH


def test_artist_written_differently_is_uncertain_not_dropped() -> None:
    # Dreamtale is listed in katakana in the JP store.
    client = FakeClient({"JP": [item("The Dawn", "ドリームテイル", "Beyond Reality")], "US": []})

    found = find_cover("The Dawn", "Dreamtale", client)

    assert found is not None and found.confidence == UNCERTAIN


def test_alive_is_not_a_live_version() -> None:
    client = FakeClient({"JP": [item("Faded", "Alan Walker", "Alive")]})

    found = find_cover("Faded", "Alan Walker", client)

    assert found is not None and found.confidence == MATCH


def test_other_songs_and_bad_artwork_hosts_are_ignored() -> None:
    client = FakeClient(
        {
            "JP": [
                item("Infinity", "One Direction"),
                item("Lemon", "米津玄師", artwork="https://evil.example.com/100x100bb.jpg"),
                item("Lemon", "米津玄師", artwork="http://is1-ssl.mzstatic.com/x/100x100bb.jpg"),
            ],
            "US": [],
        },
    )

    assert find_cover("Lemon", "米津玄師", client) is None


def test_short_title_inside_a_long_one_is_a_different_song() -> None:
    client = FakeClient({"JP": [item("Infinity", "One Direction")], "US": []})

    assert find_cover("To the Infinity Castle", "梶浦由記, 椎名豪", client) is None


def test_no_artist_means_no_search() -> None:
    client = FakeClient({"JP": [item("Lose Control", "Teddy Swims")]})

    assert find_cover("Lose Control", "", client) is None
    assert client.calls == []


def test_client_waits_between_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps: list[float] = []
    now = [100.0]

    class FakeResponse:
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def read(self) -> bytes:
            return b'{"results": [{"trackName": "A"}, "junk"]}'

    monkeypatch.setattr(cover_search.urllib.request, "urlopen", lambda *a, **k: FakeResponse())
    monkeypatch.setattr(ItunesCoverSearchClient, "_last_call", 0.0)
    client = ItunesCoverSearchClient(sleep=sleeps.append, clock=lambda: now[0])

    assert client.search("x", "JP") == [{"trackName": "A"}]
    client.search("y", "JP")

    assert len(sleeps) == 1 and sleeps[0] == pytest.approx(cover_search.MIN_SECONDS_BETWEEN_CALLS)


# ---------------------------------------------------------------------------
# review flow
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with sessionmaker(autocommit=False, autoflush=False, bind=engine)() as session:
        yield session


@pytest.fixture
def storage(tmp_path: Path) -> MediaStorage:
    return MediaStorage(Settings(media_root=str(tmp_path)))


def create_user(db: Session, name: str = "owner") -> User:
    user = User(username=name, password_hash="hash")
    db.add(user)
    db.commit()
    return user


def create_track(db: Session, user: User, title: str, artist: str | None = "Artist", **fields: Any) -> Track:
    track = Track(user_id=user.id, title=title, artist=artist, status=fields.pop("status", "ready"), **fields)
    db.add(track)
    db.commit()
    return track


def test_lists_every_coverless_track_but_auto_searches_only_new_ones(db_session: Session) -> None:
    user = create_user(db_session)
    other = create_user(db_session, "other")
    first = create_track(db_session, user, "A")
    no_artist = create_track(db_session, user, "No artist", artist=None)
    blank = create_track(db_session, user, "Blank artist", artist="  ")
    create_track(db_session, user, "Has cover", cover_path="covers/x.jpg")
    searched = create_track(db_session, user, "Searched", cover_search_version=COVER_SEARCH_VERSION)
    create_track(db_session, user, "Processing", status="processing")
    create_track(db_session, other, "Foreign")

    listed = cover_search.list_coverless_tracks(db_session, user_id=user.id)
    assert [t.id for t in listed] == [first.id, no_artist.id, blank.id, searched.id]
    assert [cover_search.is_searched(t) for t in listed] == [False, False, False, True]
    assert cover_search.count_coverless_tracks(db_session, user_id=user.id) == 4
    assert count_pending_tracks(db_session, user_id=user.id) == 1
    assert count_tracks_without_artist(db_session, user_id=user.id) == 2


def test_search_by_id_searches_again_and_skips_unsearchable_tracks(db_session: Session) -> None:
    user = create_user(db_session)
    other = create_user(db_session, "other")
    searched = create_track(db_session, user, "Lemon", "米津玄師", cover_search_version=COVER_SEARCH_VERSION)
    no_artist = create_track(db_session, user, "No artist", artist=None)
    has_cover = create_track(db_session, user, "Has cover", cover_path="covers/x.jpg")
    foreign = create_track(db_session, other, "Lemon", "米津玄師")
    client = FakeClient({"JP": [item("Lemon", "米津玄師")]})

    result = cover_search.search_tracks_by_id(
        db_session,
        client,
        user_id=user.id,
        track_ids=[foreign.id, has_cover.id, no_artist.id, searched.id],
        batch_size=10,
    )

    assert result.status == "ok"
    assert result.reviewed_track_ids == [searched.id]
    assert [s.track_id for s in result.suggestions] == [searched.id]
    assert len(client.calls) == 1
    assert cover_search.search_tracks_by_id(db_session, None, user_id=user.id, track_ids=[searched.id]).status == "disabled"


def test_batches_walk_by_cursor_and_save_nothing(db_session: Session) -> None:
    user = create_user(db_session)
    tracks = [create_track(db_session, user, f"Song {i}", "Band") for i in range(4)]
    client = FakeClient({"JP": [item("Song 0", "Band")]})

    result, cursor, remaining = search_next_batch(db_session, client, user_id=user.id, batch_size=3)

    assert result.status == "ok"
    assert result.reviewed_track_ids == [t.id for t in tracks[:3]]
    assert [s.track_id for s in result.suggestions] == [tracks[0].id]
    assert (cursor, remaining) == (tracks[2].id, 1)
    db_session.expire_all()
    assert db_session.get(Track, tracks[0].id).cover_path is None

    _, cursor, remaining = search_next_batch(db_session, client, user_id=user.id, after_id=cursor, batch_size=3)
    assert (cursor, remaining) == (tracks[3].id, 0)


def test_search_failure_keeps_finished_tracks_and_retries_the_rest(db_session: Session) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", "Band")
    create_track(db_session, user, "Second", "Band")

    class FlakyClient(FakeClient):
        def search(self, term: str, country: str) -> list[dict[str, Any]]:
            if "Second" in term:
                raise CoverSearchUnavailableError("rate limited")
            return []

    result, cursor, remaining = search_next_batch(db_session, FlakyClient(), user_id=user.id)

    assert result.status == "error" and result.error
    assert result.reviewed_track_ids == [first.id]
    assert (cursor, remaining) == (first.id, 1)


def test_disabled_search_makes_no_call(db_session: Session) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Song")

    result, cursor, _ = search_next_batch(db_session, None, user_id=user.id)

    assert result.status == "disabled" and cursor is None


def test_apply_downloads_accepted_covers_only(db_session: Session, storage: MediaStorage) -> None:
    user = create_user(db_session)
    other = create_user(db_session, "other")
    jpeg = create_track(db_session, user, "Jpeg")
    png = create_track(db_session, user, "Png")
    rejected = create_track(db_session, user, "Rejected")
    owner_cover = create_track(db_session, user, "Owner", cover_path="covers/owner.png")
    bad_host = create_track(db_session, user, "Bad host")
    not_image = create_track(db_session, user, "Not image")
    foreign = create_track(db_session, other, "Foreign")
    downloads: list[str] = []
    payloads = {"jpeg": JPEG, "png": PNG, "html": b"<html>"}

    def downloader(url: str) -> bytes:
        downloads.append(url)
        return payloads[url.rsplit("/", 1)[-1].split(".")[0]]

    cdn = "https://is1-ssl.mzstatic.com/image/thumb/x"
    updated, failed, reviewed = apply_cover_choices(
        db_session,
        storage,
        user_id=user.id,
        choices=[
            (jpeg.id, f"{cdn}/jpeg.jpg"),
            (png.id, f"{cdn}/png.jpg"),
            (owner_cover.id, f"{cdn}/jpeg.jpg"),
            (bad_host.id, "https://evil.example.com/jpeg.jpg"),
            (not_image.id, f"{cdn}/html.jpg"),
            (foreign.id, f"{cdn}/jpeg.jpg"),
        ],
        reviewed_track_ids=[jpeg.id, png.id, rejected.id, owner_cover.id, bad_host.id, not_image.id, foreign.id],
        downloader=downloader,
    )

    assert (updated, failed, reviewed) == (2, 2, 4)
    assert all("evil" not in url for url in downloads)
    db_session.expire_all()
    saved = db_session.get(Track, jpeg.id)
    assert saved.cover_path.endswith(".jpg")
    assert storage.stored_media_path(saved.cover_path).read_bytes() == JPEG
    assert db_session.get(Track, png.id).cover_path.endswith(".png")
    assert db_session.get(Track, owner_cover.id).cover_path == "covers/owner.png"
    assert db_session.get(Track, rejected.id).cover_search_version == COVER_SEARCH_VERSION
    # Failed downloads stay pending so they are offered again.
    assert db_session.get(Track, bad_host.id).cover_search_version is None
    assert db_session.get(Track, not_image.id).cover_search_version is None
    assert db_session.get(Track, foreign.id).cover_search_version is None


def test_download_refuses_urls_off_the_artwork_cdn() -> None:
    for url in ("https://evil.example.com/a.jpg", "http://is1-ssl.mzstatic.com/a.jpg", "https://mzstatic.com.evil.io/a.jpg"):
        with pytest.raises(ValueError):
            download_artwork(url)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.fixture
def api(db_session: Session, storage: MediaStorage) -> Generator[tuple[TestClient, Any]]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_media_storage] = lambda: storage
    with TestClient(app) as test_client:
        yield test_client, app


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_endpoints_require_authentication(api: tuple[TestClient, Any]) -> None:
    client, _ = api
    assert client.get("/api/covers/search/status").status_code == 401
    assert client.post("/api/covers/search/next-batch", json={}).status_code == 401
    assert client.post("/api/covers/search/apply", json={}).status_code == 401


def test_status_reports_disabled_search(api: tuple[TestClient, Any], db_session: Session) -> None:
    client, app = api
    user = create_user(db_session)
    track = create_track(db_session, user, "Lemon", "米津玄師")
    unknown = create_track(db_session, user, "Unknown", artist=None)
    app.dependency_overrides[_get_cover_search_client] = lambda: None

    body = client.get("/api/covers/search/status", headers=auth(user)).json()

    assert body == {
        "enabled": False,
        "coverless_count": 2,
        "pending_count": 1,
        "tracks": [
            {"track_id": track.id, "title": "Lemon", "artist": "米津玄師", "duration_seconds": None, "searched": False},
            {"track_id": unknown.id, "title": "Unknown", "artist": "", "duration_seconds": None, "searched": False},
        ],
        "skipped_without_artist": 1,
    }
    batch = client.post("/api/covers/search/next-batch", json={}, headers=auth(user)).json()
    assert batch["status"] == "disabled" and batch["candidates"] == []


def test_review_flow_through_endpoints(
    api: tuple[TestClient, Any],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, app = api
    user = create_user(db_session)
    track = create_track(db_session, user, "Lemon", "米津玄師")
    uncertain = create_track(db_session, user, "The Dawn", "Dreamtale")
    fake = FakeClient({"JP": [item("Lemon", "米津玄師"), item("The Dawn", "ドリームテイル")]})
    app.dependency_overrides[_get_cover_search_client] = lambda: fake
    monkeypatch.setattr(cover_search, "download_artwork", lambda url: JPEG)

    batch = client.post("/api/covers/search/next-batch", json={"after_id": None}, headers=auth(user)).json()

    assert batch["status"] == "ok" and batch["remaining_count"] == 0
    by_id = {c["track_id"]: c for c in batch["candidates"]}
    assert by_id[track.id]["confidence"] == "match" and by_id[track.id]["selected"]
    assert by_id[uncertain.id]["confidence"] == "uncertain" and not by_id[uncertain.id]["selected"]

    applied = client.post(
        "/api/covers/search/apply",
        json={
            "choices": [{"track_id": track.id, "artwork_url": by_id[track.id]["artwork_url"]}],
            "reviewed_track_ids": batch["reviewed_track_ids"],
        },
        headers=auth(user),
    ).json()

    assert applied == {"updated_count": 1, "failed_count": 0, "reviewed_count": 2}
    status = client.get("/api/covers/search/status", headers=auth(user)).json()
    assert status["pending_count"] == 0
    # The track without a saved cover stays listed, marked as searched.
    assert [(t["track_id"], t["searched"]) for t in status["tracks"]] == [(uncertain.id, True)]
    cover = client.get(f"/api/tracks/{track.id}/cover", headers=auth(user))
    assert cover.status_code == 200 and cover.content == JPEG

    again = client.post(
        "/api/covers/search/next-batch",
        json={"track_ids": [uncertain.id, track.id]},
        headers=auth(user),
    ).json()
    assert again["status"] == "ok" and again["reviewed_track_ids"] == [uncertain.id]
    assert again["next_after_id"] is None and again["remaining_count"] == 0
