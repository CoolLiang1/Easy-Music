"""Tests for the AI track tag suggestion endpoint.

Covers auth, track ownership, provider states, existing tag mapping, invented
tag rejection, and proof that tags are never created or assigned automatically.
"""

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
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.ai import AiCompletionRequest, AiCompletionResult
from app.services.ai_provider import AiProviderService


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {
        "ai_enabled": False,
        "ai_provider": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_base_url": "",
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


def create_tag(db_session: Session, user: User, group: str, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def create_track(
    db_session: Session,
    user: User,
    title: str,
    *,
    artist: str = "Artist",
    album: str = "Album",
    content_type: str = "song",
    status: str = "ready",
    original_file_path: str = "originals/test.mp3",
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist=artist,
        album=album,
        duration_seconds=180,
        content_type=content_type,
        original_file_path=original_file_path,
        playback_file_path="playback/track.mp3",
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        status=status,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


class _FakeClient:
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
        return AiCompletionResult.ok("{}")


def _suggestion_json(
    *,
    existing_tag_ids: list[int] | None = None,
    new_tags: list[dict[str, Any]] | None = None,
    explanation: str | None = None,
) -> str:
    return json.dumps(
        {
            "existing_tag_ids": existing_tag_ids or [],
            "new_tag_suggestions": new_tags or [],
            "explanation": explanation,
        }
    )


def _install_provider(
    app: Any,
    *,
    ai_enabled: bool = True,
    ai_api_key: str = "sk-test",
    ai_model: str = "gpt-4",
    client: _FakeClient | None = None,
) -> _FakeClient:
    from app.api.routes.ai import _get_ai_provider

    fake = client or _FakeClient()

    def override() -> AiProviderService:
        settings = _settings(
            ai_enabled=ai_enabled,
            ai_api_key=ai_api_key,
            ai_model=ai_model,
        )
        return AiProviderService(settings, client=fake)

    app.dependency_overrides[_get_ai_provider] = override
    return fake


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


def test_suggest_tags_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/tracks/1/suggest-tags", json={})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# track ownership / not found
# ---------------------------------------------------------------------------


def test_suggest_tags_returns_error_for_unowned_track(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    other_track = create_track(db_session, other, "Other Track")

    _install_provider(client.app)

    response = client.post(
        f"/api/ai/tracks/{other_track.id}/suggest-tags",
        json={},
        headers=auth_headers(owner),
    )

    # Track belongs to another user — error status in response
    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "error"
    assert "not found" in (body["explanation"] or "").lower()


def test_suggest_tags_returns_error_for_nonexistent_track(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app)

    response = client.post(
        "/api/ai/tracks/99999/suggest-tags",
        json={},
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    assert response.json()["provider_status"] == "error"


# ---------------------------------------------------------------------------
# provider disabled / unconfigured
# ---------------------------------------------------------------------------


def test_suggest_tags_returns_disabled_when_provider_disabled(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "My Track")
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["provider_status"] == "disabled"


def test_suggest_tags_returns_unconfigured_when_missing_key(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "My Track")
    _install_provider(client.app, ai_enabled=True, ai_api_key="")

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    assert response.json()["provider_status"] == "unconfigured"


def test_suggest_tags_includes_provider_error_explanation(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "My Track")
    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.error(
        "empty_response",
        "Provider returned no message content.",
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["provider_status"] == "error"
    assert body["explanation"] == "Provider returned no message content."


# ---------------------------------------------------------------------------
# valid existing tag suggestions
# ---------------------------------------------------------------------------


def test_suggest_tags_maps_existing_tags_with_correct_groups(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Piano Study", artist="Classical Composer")
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")
    instrumental = create_tag(db_session, user, "type", "Instrumental")
    piano = create_tag(db_session, user, "attribute", "Piano")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _suggestion_json(
            existing_tag_ids=[focus.id, calm.id, instrumental.id, piano.id],
            explanation="Matched based on title and artist.",
        )
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    assert body["track_id"] == track.id
    assert body["explanation"] == "Matched based on title and artist."

    existing = body["existing_tag_suggestions"]
    assert "scenario" in existing
    assert "state" in existing
    assert "type" in existing
    assert "attribute" in existing
    assert existing["scenario"][0]["name"] == "Focus"
    assert existing["scenario"][0]["tag_id"] == focus.id
    assert existing["state"][0]["name"] == "Calm"
    assert existing["attribute"][0]["name"] == "Piano"


# ---------------------------------------------------------------------------
# invented / unowned tag id rejection
# ---------------------------------------------------------------------------


def test_suggest_tags_rejects_invented_tag_id(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Track")
    focus = create_tag(db_session, user, "scenario", "Focus")

    fake = _install_provider(client.app)
    # AI returns a legit id AND an invented one — invented is silently dropped
    fake.result = AiCompletionResult.ok(
        _suggestion_json(existing_tag_ids=[focus.id, 99999])
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    existing = body["existing_tag_suggestions"]
    # Only the valid tag appears
    assert len(existing.get("scenario", [])) == 1
    assert existing["scenario"][0]["tag_id"] == focus.id


def test_suggest_tags_rejects_another_users_tag_id(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    track = create_track(db_session, owner, "Owner Track")
    other_tag = create_tag(db_session, other, "scenario", "Stolen")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _suggestion_json(existing_tag_ids=[other_tag.id])
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    # Other user's tag is silently dropped
    assert body["existing_tag_suggestions"] == {}


# ---------------------------------------------------------------------------
# no automatic tag creation or assignment
# ---------------------------------------------------------------------------


def test_suggest_tags_does_not_create_tags(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Track")
    # Only one tag exists — AI suggests it plus a new tag name
    focus = create_tag(db_session, user, "scenario", "Focus")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _suggestion_json(
            existing_tag_ids=[focus.id],
            new_tags=[
                {
                    "name": "Meditation",
                    "group": "scenario",
                    "confidence": 0.8,
                    "reason": "Track title suggests meditation.",
                }
            ],
        )
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={"include_new_tag_suggestions": True},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"

    # New tags are in the response...
    assert len(body["new_tag_suggestions"]) == 1
    assert body["new_tag_suggestions"][0]["name"] == "Meditation"

    # ...but not created in the database
    tag_count = db_session.scalar(
        select(Tag).where(Tag.user_id == user.id)
    )  # returns int via func.count
    tags = list(
        db_session.scalars(select(Tag).where(Tag.user_id == user.id))
    )
    assert len(tags) == 1  # only the original "Focus" tag


def test_suggest_tags_does_not_assign_tags_to_track(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Track")
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _suggestion_json(existing_tag_ids=[focus.id, calm.id])
    )

    client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    # Verify no TrackTag rows were created
    track_tags = list(
        db_session.scalars(
            select(TrackTag).where(TrackTag.track_id == track.id)
        )
    )
    assert len(track_tags) == 0


# ---------------------------------------------------------------------------
# new tag suggestions
# ---------------------------------------------------------------------------


def test_suggest_tags_includes_new_tag_suggestions_when_requested(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Sunset Vibes", artist="Chill Artist")
    chill = create_tag(db_session, user, "state", "Chill")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _suggestion_json(
            existing_tag_ids=[chill.id],
            new_tags=[
                {
                    "name": "Sunset",
                    "group": "scenario",
                    "confidence": 0.9,
                    "reason": "Title strongly suggests sunset mood.",
                },
                {
                    "name": "Lo-Fi",
                    "group": "type",
                    "confidence": 0.7,
                    "reason": "Artist matches lo-fi genre.",
                },
            ],
            explanation="Two existing and two new suggestions.",
        )
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={"include_new_tag_suggestions": True},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    assert len(body["new_tag_suggestions"]) == 2
    assert body["new_tag_suggestions"][0]["name"] == "Sunset"
    assert body["new_tag_suggestions"][0]["confidence"] == 0.9
    assert body["new_tag_suggestions"][1]["name"] == "Lo-Fi"


def test_suggest_tags_excludes_new_tags_when_not_requested(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Track")
    focus = create_tag(db_session, user, "scenario", "Focus")

    fake = _install_provider(client.app)
    # AI returns new tag suggestions but include_new_tag_suggestions is False
    fake.result = AiCompletionResult.ok(
        _suggestion_json(
            existing_tag_ids=[focus.id],
            new_tags=[
                {"name": "New", "group": "scenario", "confidence": 0.5, "reason": ""}
            ],
        )
    )

    response = client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={"include_new_tag_suggestions": False},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    # New tag suggestions filtered out by service when not requested
    assert body["new_tag_suggestions"] == []


# ---------------------------------------------------------------------------
# prompt content
# ---------------------------------------------------------------------------


def test_suggest_tags_prompt_includes_track_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(
        db_session,
        user,
        "Test Title",
        artist="Test Artist",
        album="Test Album",
        content_type="song",
        original_file_path="media/originals/test.mp3",
    )
    create_tag(db_session, user, "scenario", "Focus")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_suggestion_json())

    client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    assert len(fake.calls) == 1
    user_msg = fake.calls[0].messages[1]["content"]
    assert "Test Title" in user_msg
    assert "Test Artist" in user_msg
    assert "Test Album" in user_msg
    assert "test.mp3" in user_msg  # basename only
    assert "media/originals" not in user_msg  # full path NOT exposed


def test_suggest_tags_prompt_includes_tag_catalogue(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Track")
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_suggestion_json())

    client.post(
        f"/api/ai/tracks/{track.id}/suggest-tags",
        json={},
        headers=auth_headers(user),
    )

    user_msg = fake.calls[0].messages[1]["content"]
    assert f"id:{focus.id} Focus" in user_msg
    assert f"id:{calm.id} Calm" in user_msg
    assert "[scenario]" in user_msg
    assert "[state]" in user_msg
