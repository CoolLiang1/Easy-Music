"""Tests for the AI recommendation composition endpoint.

Proves the AI endpoint delegates ranking to Phase 5 and cannot bypass cooldown,
not_today, or other feedback penalties.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Any

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
from app.models.feedback_event import FeedbackEvent
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
    status: str = "ready",
    liked: bool = False,
    cooldown_until: datetime | None = None,
) -> Track:
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
        status=status,
        liked=liked,
        cooldown_until=cooldown_until,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def assign_tags(db_session: Session, track: Track, *tags: Tag) -> None:
    for tag in tags:
        db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()


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


def _intent_json(
    *,
    scene: list[int] | None = None,
    feature: list[int] | None = None,
    type_: list[int] | None = None,
    explanation: str | None = None,
) -> str:
    return json.dumps(
        {
            "scene_tag_ids": scene or [],
            "feature_tag_ids": feature or [],
            "type_tag_ids": type_ or [],
            "unmatched_terms": [],
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


def test_ai_recommend_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/recommend", json={"text": "music"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# provider disabled / unconfigured
# ---------------------------------------------------------------------------


def test_ai_recommend_returns_disabled_when_provider_disabled(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/recommend",
        json={"text": "calm music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["parsed_intent"]["provider_status"] == "disabled"
    assert body["results"] == []
    assert body["request_id"]


def test_ai_recommend_returns_unconfigured_when_missing_key(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=True, ai_api_key="")

    response = client.post(
        "/api/ai/recommend",
        json={"text": "calm music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["parsed_intent"]["provider_status"] == "unconfigured"


# ---------------------------------------------------------------------------
# valid recommendation flow
# ---------------------------------------------------------------------------


def test_ai_recommend_delegates_ranking_to_phase_5(
    client: TestClient,
    db_session: Session,
) -> None:
    """Happy path: AI parses intent, Phase 5 ranks tracks, results returned."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")
    calm = create_tag(db_session, user, "feature", "Calm")

    # Create three tracks tagged with Focus
    best = create_track(db_session, user, "Best", liked=True)
    second = create_track(db_session, user, "Second")
    third = create_track(db_session, user, "Third")
    assign_tags(db_session, best, focus, calm)
    assign_tags(db_session, second, focus)
    assign_tags(db_session, third, focus)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(scene=[focus.id], feature=[calm.id])
    )

    response = client.post(
        "/api/ai/recommend",
        json={"text": "calm focus music", "limit": 3},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()

    # Parsed intent
    assert body["parsed_intent"]["provider_status"] == "ok"
    assert body["parsed_intent"]["structured_request"]["scene_tag_ids"] == [focus.id]
    assert body["parsed_intent"]["structured_request"]["feature_tag_ids"] == [calm.id]
    assert body["parsed_intent"]["matched_tags"]["scene"][0]["name"] == "Focus"

    # Results from Phase 5 ranking
    assert body["request_id"]
    assert len(body["results"]) == 3
    assert [r["rank"] for r in body["results"]] == [1, 2, 3]
    assert body["results"][0]["track"]["title"] == "Best"
    assert body["results"][1]["track"]["title"] == "Second"
    assert body["results"][2]["track"]["title"] == "Third"

    # Phase 5 deterministic reason text is present
    for result in body["results"]:
        assert "reason" in result
        assert len(result["reason"]) > 0


def test_ai_recommend_includes_deterministic_reason_from_phase_5(
    client: TestClient,
    db_session: Session,
) -> None:
    """Phase 5 deterministic reason text must be present and not replaced by AI."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")
    track = create_track(db_session, user, "Reasoned", liked=True)
    assign_tags(db_session, track, focus)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(scene=[focus.id], explanation="AI thinks focus is best.")
    )

    response = client.post(
        "/api/ai/recommend",
        json={"text": "focus music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    # AI explanation is in parsed_intent, not in result reason
    assert body["parsed_intent"]["explanation"] == "AI thinks focus is best."
    # But the result reason comes from Phase 5
    result_reason = body["results"][0]["reason"]
    assert "matched scene tags: Focus" in result_reason
    assert "liked track boost" in result_reason


def test_ai_recommend_returns_empty_when_no_candidates(
    client: TestClient,
    db_session: Session,
) -> None:
    """No ready tracks match - Phase 5 returns empty results."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")
    # No tracks at all

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json(scene=[focus.id]))

    response = client.post(
        "/api/ai/recommend",
        json={"text": "focus music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["parsed_intent"]["provider_status"] == "ok"
    assert body["results"] == []


# ---------------------------------------------------------------------------
# cooldown penalty (proof LLM cannot bypass ranking)
# ---------------------------------------------------------------------------


def test_ai_recommend_applies_default_soft_cooldown_penalty(
    client: TestClient,
    db_session: Session,
) -> None:
    """A track with future cooldown_until stays eligible but is penalized."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")

    future = datetime.now(timezone.utc) + timedelta(days=7)
    cooled = create_track(db_session, user, "Cooled Down", cooldown_until=future)
    assign_tags(db_session, cooled, focus)

    normal = create_track(db_session, user, "Available")
    assign_tags(db_session, normal, focus)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json(scene=[focus.id]))

    response = client.post(
        "/api/ai/recommend",
        json={"text": "focus music", "limit": 3},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    results = response.json()["results"]
    titles = [r["track"]["title"] for r in results]
    assert titles == ["Available", "Cooled Down"]
    assert "active cooldown soft penalty" in results[1]["reason"]


# ---------------------------------------------------------------------------
# not_today exclusion (proof LLM cannot bypass Phase 5 penalties)
# ---------------------------------------------------------------------------


def test_ai_recommend_excludes_not_today_track(
    client: TestClient,
    db_session: Session,
) -> None:
    """A track with a not_today feedback today must not appear in AI results."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")

    not_today_track = create_track(db_session, user, "Not Today Track")
    assign_tags(db_session, not_today_track, focus)

    available = create_track(db_session, user, "Available")
    assign_tags(db_session, available, focus)

    # Record not_today feedback for today
    db_session.add(
        FeedbackEvent(
            user_id=user.id,
            track_id=not_today_track.id,
            feedback_type="not_today",
            occurred_at=datetime.now(timezone.utc),
            client="test",
        )
    )
    db_session.commit()

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json(scene=[focus.id]))

    response = client.post(
        "/api/ai/recommend",
        json={"text": "focus music", "limit": 3},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    titles = [r["track"]["title"] for r in response.json()["results"]]
    assert "Not Today Track" not in titles
    assert "Available" in titles


# ---------------------------------------------------------------------------
# fallback / error behaviour
# ---------------------------------------------------------------------------


def test_ai_recommend_fallback_is_default(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/recommend",
        json={"text": "music"},
        headers=auth_headers(user),
    )
    assert response.status_code == 200
    assert response.json()["parsed_intent"]["provider_status"] == "disabled"


def test_ai_recommend_no_fallback_raises_503(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/recommend",
        json={"text": "music", "fallback_to_empty": False},
        headers=auth_headers(user),
    )
    assert response.status_code == 503


def test_ai_recommend_passes_limit_and_client(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")
    for i in range(5):
        t = create_track(db_session, user, f"Track {i}")
        assign_tags(db_session, t, focus)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json(scene=[focus.id]))

    response = client.post(
        "/api/ai/recommend",
        json={"text": "focus music", "limit": 2, "client": "android"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    # limit is capped at 3 by the service
    assert len(body["results"]) == 2
    assert body["parsed_intent"]["structured_request"]["client"] == "android"


def test_ai_recommend_allows_optional_ai_explanation_in_parsed_intent(
    client: TestClient,
    db_session: Session,
) -> None:
    """AI helper explanation may appear in parsed_intent, not in per-result reason."""
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scene", "Focus")
    track = create_track(db_session, user, "Explained")
    assign_tags(db_session, track, focus)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(
            scene=[focus.id],
            explanation="Focus is ideal for deep work sessions.",
        )
    )

    response = client.post(
        "/api/ai/recommend",
        json={"text": "deep work focus"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    # AI explanation in parsed_intent
    assert "deep work" in body["parsed_intent"]["explanation"].lower()
    # Result reason is Phase 5 deterministic text, not the AI explanation
    assert "matched scene tags: Focus" in body["results"][0]["reason"]


def test_ai_recommend_handles_empty_text_rejection(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    response = client.post(
        "/api/ai/recommend",
        json={"text": ""},
        headers=auth_headers(user),
    )
    assert response.status_code == 422
