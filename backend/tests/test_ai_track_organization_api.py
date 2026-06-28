"""Tests for V2.5 single-track AI organization endpoint."""

from __future__ import annotations

import json
from collections.abc import Generator
from typing import Any

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
from app.models.playlist import Playlist, PlaylistTrack
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_ai_organization import TrackAiAnalysis, TrackAiResearch
from app.models.user import User
from app.schemas.ai import AiCompletionRequest, AiCompletionResult
from app.schemas.ai_search import AiSearchProviderResult, AiSearchRequest, AiSearchResult
from app.services.ai_provider import AiProviderService
from app.services.ai_search_provider import AiSearchProviderService


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


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {
        "ai_enabled": False,
        "ai_provider": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_base_url": "",
        "ai_search_enabled": False,
        "ai_search_provider": "",
        "ai_search_api_key": "",
        "ai_search_base_url": "",
        "ai_search_max_results": 5,
        "ai_search_cache_days": 30,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def create_track(db_session: Session, user: User, title: str = "Track") -> Track:
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


def create_tag(db_session: Session, user: User, group: str, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def create_playlist(
    db_session: Session,
    user: User,
    name: str = "Focus Mix",
    *,
    description: str | None = "Study sessions",
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
) -> None:
    db_session.add(
        PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=position,
        )
    )
    db_session.commit()


class _FakeAiClient:
    def __init__(
        self,
        result: AiCompletionResult | None = None,
        exc: Exception | None = None,
    ):
        self.result = result
        self.exc = exc
        self.calls: list[AiCompletionRequest] = []

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        self.calls.append(request)
        if self.exc is not None:
            raise self.exc
        if self.result is not None:
            return self.result
        return AiCompletionResult.ok(_analysis_json())


class _FakeSearchClient:
    def __init__(
        self,
        result: AiSearchProviderResult | None = None,
        exc: Exception | None = None,
    ):
        self.result = result
        self.exc = exc
        self.calls: list[AiSearchRequest] = []

    def search(self, request: AiSearchRequest) -> AiSearchProviderResult:
        self.calls.append(request)
        if self.exc is not None:
            raise self.exc
        if self.result is not None:
            return self.result
        return AiSearchProviderResult.ok(
            provider="tavily-compatible",
            query=request.query,
            results=[
                AiSearchResult(
                    title="Track search result",
                    snippet="A concise search result snippet.",
                    url="https://example.test/track",
                )
            ],
        )


def _install_ai_provider(
    app: Any,
    *,
    ai_enabled: bool = True,
    ai_api_key: str = "sk-test",
    ai_model: str = "gpt-test",
    fake: _FakeAiClient | None = None,
) -> _FakeAiClient:
    from app.api.routes.ai import _get_ai_provider

    client = fake or _FakeAiClient()

    def override() -> AiProviderService:
        settings = _settings(
            ai_enabled=ai_enabled,
            ai_provider="openai-compatible",
            ai_api_key=ai_api_key,
            ai_model=ai_model,
            ai_base_url="https://example.test",
        )
        return AiProviderService(settings, client=client)

    app.dependency_overrides[_get_ai_provider] = override
    return client


def _install_search_provider(
    app: Any,
    *,
    search_enabled: bool = True,
    api_key: str = "tvly-test",
    fake: _FakeSearchClient | None = None,
) -> _FakeSearchClient:
    from app.api.routes.ai import _get_ai_search_provider

    client = fake or _FakeSearchClient()

    def override() -> AiSearchProviderService:
        settings = _settings(
            ai_search_enabled=search_enabled,
            ai_search_provider="tavily-compatible",
            ai_search_api_key=api_key,
            ai_search_base_url="https://api.tavily.com",
            ai_search_max_results=5,
        )
        return AiSearchProviderService(settings, client=client)

    app.dependency_overrides[_get_ai_search_provider] = override
    return client


def _analysis_json(
    *,
    existing_tag_suggestions: list[dict[str, Any]] | None = None,
    new_tag_suggestions: list[dict[str, Any]] | None = None,
    playlist_suggestions: list[dict[str, Any]] | None = None,
    summary: str = "Organization summary.",
    confidence: float = 0.8,
) -> str:
    return json.dumps(
        {
            "existing_tag_suggestions": existing_tag_suggestions or [],
            "new_tag_suggestions": new_tag_suggestions or [],
            "playlist_suggestions": playlist_suggestions or [],
            "summary": summary,
            "confidence": confidence,
        }
    )


def test_organize_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/tracks/1/organize", json={})
    assert response.status_code == 401


def test_organize_rejects_unknown_or_unowned_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    other_track = create_track(db_session, other)
    _install_ai_provider(client.app)
    _install_search_provider(client.app)

    missing = client.post(
        "/api/ai/tracks/9999/organize",
        json={},
        headers=auth_headers(owner),
    )
    unowned = client.post(
        f"/api/ai/tracks/{other_track.id}/organize",
        json={},
        headers=auth_headers(owner),
    )

    assert missing.status_code == 404
    assert unowned.status_code == 404


def test_search_disabled_still_allows_local_metadata_analysis(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, title="Local Only")
    focus = create_tag(db_session, user, "scene", "Focus")
    fake_ai = _install_ai_provider(client.app)
    fake_ai.result = AiCompletionResult.ok(
        _analysis_json(
            existing_tag_suggestions=[
                {"tag_id": focus.id, "confidence": 0.9, "reason": "Metadata fit."}
            ],
        )
    )
    _install_search_provider(client.app, search_enabled=False)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["research_status"] == "disabled"
    assert body["research"] is None
    assert body["analysis_status"] == "ok"
    assert body["analysis"]["existing_tag_suggestions"][0]["tag_id"] == focus.id
    assert len(fake_ai.calls) == 1


def test_search_unconfigured_still_allows_local_metadata_analysis(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    fake_ai = _install_ai_provider(client.app)
    fake_ai.result = AiCompletionResult.ok(_analysis_json(summary="Local analysis."))
    _install_search_provider(client.app, search_enabled=True, api_key="")

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["research_status"] == "unconfigured"
    assert body["research"] is None
    assert body["analysis_status"] == "ok"
    assert body["analysis"]["summary"] == "Local analysis."


def test_ai_disabled_returns_clear_analysis_state(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    _install_ai_provider(client.app, ai_enabled=False)
    _install_search_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["research_status"] == "ok"
    assert body["analysis_status"] == "disabled"
    assert body["analysis"] is None


def test_ai_unconfigured_returns_clear_analysis_state(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    _install_ai_provider(client.app, ai_enabled=True, ai_api_key="")
    _install_search_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["research_status"] == "ok"
    assert body["analysis_status"] == "unconfigured"
    assert body["analysis"] is None


def test_valid_fake_search_and_ai_store_research_and_analysis(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, title="Piano Study")
    focus = create_tag(db_session, user, "scene", "Focus")
    feature = create_tag(db_session, user, "feature", "Calm")
    playlist = create_playlist(db_session, user)
    add_playlist_track(db_session, playlist, track)
    fake_ai = _install_ai_provider(client.app)
    fake_ai.result = AiCompletionResult.ok(
        _analysis_json(
            existing_tag_suggestions=[
                {"tag_id": focus.id, "confidence": 0.9, "reason": "Good for focus."},
                {"tag_id": feature.id, "confidence": 0.8, "reason": "Calm mood."},
            ],
            new_tag_suggestions=[
                {
                    "name": "Study",
                    "group": "scene",
                    "confidence": 0.7,
                    "reason": "Study use case.",
                }
            ],
            playlist_suggestions=[
                {
                    "playlist_id": playlist.id,
                    "confidence": 0.6,
                    "reason": "Matches playlist.",
                }
            ],
        )
    )
    fake_search = _install_search_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["research_status"] == "ok"
    assert body["analysis_status"] == "ok"
    assert body["research"]["results"][0]["title"] == "Track search result"
    assert body["analysis"]["summary"] == "Organization summary."
    assert [item["tag_id"] for item in body["analysis"]["existing_tag_suggestions"]] == [
        focus.id,
        feature.id,
    ]
    assert body["analysis"]["new_tag_suggestions"][0]["group"] == "scene"
    assert body["analysis"]["playlist_suggestions"][0]["playlist_id"] == playlist.id
    assert len(fake_search.calls) == 1
    assert len(fake_ai.calls) == 1
    assert db_session.scalar(select(TrackAiResearch).where(TrackAiResearch.track_id == track.id))
    assert db_session.scalar(select(TrackAiAnalysis).where(TrackAiAnalysis.track_id == track.id))


def test_cached_research_and_analysis_are_reused_without_force(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    _install_ai_provider(client.app)
    fake_search = _install_search_provider(client.app)

    first = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )
    second = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["research"]["id"] == second.json()["research"]["id"]
    assert first.json()["analysis"]["id"] == second.json()["analysis"]["id"]
    assert len(fake_search.calls) == 1


def test_force_refresh_search_creates_fresh_research_and_analysis(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    fake_ai = _install_ai_provider(client.app)
    fake_search = _install_search_provider(client.app)

    first = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )
    second = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={"force_refresh_search": True},
        headers=auth_headers(user),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["research"]["id"] != second.json()["research"]["id"]
    assert first.json()["analysis"]["id"] != second.json()["analysis"]["id"]
    assert len(fake_search.calls) == 2
    assert len(fake_ai.calls) == 2


def test_force_reanalyze_reuses_research_and_creates_fresh_analysis(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    fake_ai = _install_ai_provider(client.app)
    fake_search = _install_search_provider(client.app)

    first = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )
    second = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={"force_reanalyze": True},
        headers=auth_headers(user),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["research"]["id"] == second.json()["research"]["id"]
    assert first.json()["analysis"]["id"] != second.json()["analysis"]["id"]
    assert len(fake_search.calls) == 1
    assert len(fake_ai.calls) == 2


def test_invalid_tag_and_playlist_ids_are_filtered_safely(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    track = create_track(db_session, owner)
    valid_tag = create_tag(db_session, owner, "scene", "Focus")
    other_tag = create_tag(db_session, other, "scene", "Hidden")
    valid_playlist = create_playlist(db_session, owner)
    other_playlist = create_playlist(db_session, other)
    fake_ai = _install_ai_provider(client.app)
    fake_ai.result = AiCompletionResult.ok(
        _analysis_json(
            existing_tag_suggestions=[
                {"tag_id": valid_tag.id, "confidence": 0.9, "reason": "Valid."},
                {"tag_id": other_tag.id, "confidence": 0.9, "reason": "Unowned."},
                {"tag_id": 99999, "confidence": 0.9, "reason": "Invented."},
            ],
            playlist_suggestions=[
                {"playlist_id": valid_playlist.id, "confidence": 0.8, "reason": "Valid."},
                {"playlist_id": other_playlist.id, "confidence": 0.8, "reason": "Unowned."},
                {"playlist_id": 99999, "confidence": 0.8, "reason": "Invented."},
            ],
        )
    )
    _install_search_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(owner),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["analysis_status"] == "ok"
    assert [item["tag_id"] for item in body["analysis"]["existing_tag_suggestions"]] == [
        valid_tag.id
    ]
    assert [
        item["playlist_id"] for item in body["analysis"]["playlist_suggestions"]
    ] == [valid_playlist.id]


def test_invalid_legacy_tag_group_output_becomes_analysis_error(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    fake_ai = _install_ai_provider(client.app)
    fake_ai.result = AiCompletionResult.ok(
        _analysis_json(
            new_tag_suggestions=[
                {
                    "name": "Legacy",
                    "group": "attribute",
                    "confidence": 0.7,
                    "reason": "Invalid legacy group.",
                }
            ],
        )
    )
    _install_search_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{track.id}/organize",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["analysis_status"] == "error"
    assert body["analysis"]["status"] == "error"
    assert "schema" in body["analysis_error_message"].lower()
