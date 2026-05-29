"""Tests for the natural-language listening intent parsing endpoint.

Covers auth, provider states, valid parse, and tag validation failures.
Every test uses a ``_FakeClient`` to avoid real network calls.
"""

from __future__ import annotations

import json
from collections.abc import Generator
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
from app.models.tag import Tag
from app.models.user import User
from app.schemas.ai import AiCompletionRequest, AiCompletionResult, AiProviderStatus
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


class _FakeClient:
    """Test double that returns a pre-configured AiCompletionResult."""

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
    scenario: list[int] | None = None,
    state: list[int] | None = None,
    type_: list[int] | None = None,
    attribute: list[int] | None = None,
    exclude: list[int] | None = None,
    unmatched: list[str] | None = None,
    explanation: str | None = None,
) -> str:
    """Build a valid AiIntentOutput JSON string for the fake client."""
    return json.dumps(
        {
            "scenario_tag_ids": scenario or [],
            "state_tag_ids": state or [],
            "type_tag_ids": type_ or [],
            "attribute_tag_ids": attribute or [],
            "exclude_attribute_tag_ids": exclude or [],
            "unmatched_terms": unmatched or [],
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
    """Override the AI provider dependency so the endpoint uses a fake client."""
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


def test_parse_intent_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/parse-listening-intent", json={"text": "hello"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# provider disabled / unconfigured
# ---------------------------------------------------------------------------


def test_parse_intent_returns_disabled_when_provider_is_disabled(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm focus music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "disabled"
    assert body["structured_request"]["scenario_tag_ids"] == []
    assert body["matched_tags"] == {}


def test_parse_intent_returns_unconfigured_when_missing_api_key(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=True, ai_api_key="")

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm focus music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["provider_status"] == "unconfigured"


def test_parse_intent_returns_unconfigured_when_missing_model(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=True, ai_model="")

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm focus music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["provider_status"] == "unconfigured"


# ---------------------------------------------------------------------------
# valid parse
# ---------------------------------------------------------------------------


def test_parse_intent_valid_mapping(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")
    instrumental = create_tag(db_session, user, "type", "Instrumental")
    piano = create_tag(db_session, user, "attribute", "Piano")
    noisy = create_tag(db_session, user, "attribute", "Noisy")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(
            scenario=[focus.id],
            state=[calm.id],
            type_=[instrumental.id],
            attribute=[piano.id],
            exclude=[noisy.id],
            unmatched=["some term"],
            explanation="Mapped 'calm focus' to Focus+Calm.",
        )
    )

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm focus piano music without noise"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    assert body["explanation"] == "Mapped 'calm focus' to Focus+Calm."
    assert body["unmatched_terms"] == ["some term"]

    sr = body["structured_request"]
    assert sr["scenario_tag_ids"] == [focus.id]
    assert sr["state_tag_ids"] == [calm.id]
    assert sr["type_tag_ids"] == [instrumental.id]
    assert sr["attribute_tag_ids"] == [piano.id]
    assert sr["exclude_attribute_tag_ids"] == [noisy.id]
    assert sr["limit"] == 3

    mt = body["matched_tags"]
    assert mt["scenario"][0]["name"] == "Focus"
    assert mt["state"][0]["name"] == "Calm"
    assert mt["type"][0]["name"] == "Instrumental"
    assert mt["attribute"][0]["name"] == "Piano"


def test_parse_intent_with_no_tags_for_user(
    client: TestClient,
    db_session: Session,
) -> None:
    """When the user has no tags the AI should return empty arrays."""
    user = create_user(db_session)
    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json())

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "any music"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "ok"
    assert body["structured_request"]["scenario_tag_ids"] == []


def test_parse_intent_passes_client_field(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json())

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "music", "client": "android"},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["structured_request"]["client"] == "android"


# ---------------------------------------------------------------------------
# invalid tag ownership
# ---------------------------------------------------------------------------


def test_parse_intent_rejects_tag_from_another_user(
    client: TestClient,
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    other_tag = create_tag(db_session, other, "scenario", "Stolen")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(scenario=[other_tag.id])
    )

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "test", "fallback_to_empty": True},
        headers=auth_headers(owner),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "error"
    # Tag ownership error message
    assert "not found" in (body["explanation"] or "").lower()


# ---------------------------------------------------------------------------
# invalid tag group
# ---------------------------------------------------------------------------


def test_parse_intent_rejects_tag_in_wrong_group(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    # Create an attribute tag but the AI puts it in scenario_tag_ids
    piano = create_tag(db_session, user, "attribute", "Piano")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(scenario=[piano.id])
    )

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "test", "fallback_to_empty": True},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "error"
    assert "group" in (body["explanation"] or "").lower()


# ---------------------------------------------------------------------------
# invented tag id
# ---------------------------------------------------------------------------


def test_parse_intent_rejects_invented_tag_id(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(
        _intent_json(scenario=[99999])
    )

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "test", "fallback_to_empty": True},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_status"] == "error"
    assert "not found" in (body["explanation"] or "").lower()


# ---------------------------------------------------------------------------
# fallback / error behaviour
# ---------------------------------------------------------------------------


def test_parse_intent_fallback_to_empty_is_default(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm music"},
        headers=auth_headers(user),
    )

    # fallback_to_empty defaults to True → 200 even when disabled
    assert response.status_code == 200
    assert response.json()["provider_status"] == "disabled"


def test_parse_intent_no_fallback_raises_503_when_disabled(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    _install_provider(client.app, ai_enabled=False)

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm music", "fallback_to_empty": False},
        headers=auth_headers(user),
    )

    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


def test_parse_intent_handles_empty_text_rejection(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": ""},
        headers=auth_headers(user),
    )
    # Pydantic validation should reject empty text
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# prompt content
# ---------------------------------------------------------------------------


def test_parse_intent_prompt_includes_tag_catalogue(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    calm = create_tag(db_session, user, "state", "Calm")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json())

    client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "calm focus music"},
        headers=auth_headers(user),
    )

    assert len(fake.calls) == 1
    user_message = fake.calls[0].messages[1]["content"]
    assert f"id:{focus.id} Focus" in user_message
    assert f"id:{calm.id} Calm" in user_message
    assert "calm focus music" in user_message
    assert "never invent" in user_message.lower()


def test_parse_intent_prompt_tells_ai_not_to_invent_tags(
    client: TestClient,
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_tag(db_session, user, "scenario", "Focus")

    fake = _install_provider(client.app)
    fake.result = AiCompletionResult.ok(_intent_json())

    client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "relax"},
        headers=auth_headers(user),
    )

    system_msg = fake.calls[0].messages[0]["content"]
    user_msg = fake.calls[0].messages[1]["content"]
    # Both system and user message should mention not inventing
    assert "never invent" in system_msg.lower() or "never invent" in user_msg.lower()


# ---------------------------------------------------------------------------
# ai not implemented (no real HTTP client yet)
# ---------------------------------------------------------------------------


def test_parse_intent_handles_not_implemented_provider(
    client: TestClient,
    db_session: Session,
) -> None:
    """Without a fake client the provider returns 'not_implemented' error."""
    user = create_user(db_session)
    # Don't install a fake — use the real _get_ai_provider (no client injected)
    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "any music", "fallback_to_empty": True},
        headers=auth_headers(user),
    )

    # The real provider has no client → returns not_implemented error
    # But the endpoint defaults ai_enabled=False, so it will be disabled
    # We need to test when ai is enabled but no client
    from app.api.routes.ai import _get_ai_provider

    def not_implemented_override() -> AiProviderService:
        settings = _settings(
            ai_enabled=True,
            ai_api_key="sk-test",
            ai_model="gpt-4",
        )
        return AiProviderService(settings)  # no client

    client.app.dependency_overrides[_get_ai_provider] = not_implemented_override

    response = client.post(
        "/api/ai/parse-listening-intent",
        json={"text": "any music", "fallback_to_empty": True},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    # Without a client, provider returns error; fallback kicks in
    assert body["provider_status"] == "error"
