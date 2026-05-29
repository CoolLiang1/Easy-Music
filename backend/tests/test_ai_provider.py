"""Tests for the AI provider service abstraction.

No real network calls — disabled, unconfigured, and error states are tested
through settings and a minimal mock client.
"""

import pytest

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest, AiCompletionResult, AiProviderStatus
from app.services.ai_provider import AiProviderService, AiProviderUnavailableError


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _settings(**overrides) -> Settings:
    """Build Settings with AI disabled by default so tests start safe."""
    defaults = {
        "ai_enabled": False,
        "ai_provider": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_base_url": "",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _request() -> AiCompletionRequest:
    return AiCompletionRequest(
        messages=[{"role": "user", "content": "Hello"}],
    )


class _FakeClient:
    """A test double that returns whatever the test configures."""

    def __init__(self, result: AiCompletionResult | None = None, exc: Exception | None = None):
        self.result = result
        self.exc = exc
        self.calls: list[AiCompletionRequest] = []

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        self.calls.append(request)
        if self.exc is not None:
            raise self.exc
        if self.result is not None:
            return self.result
        return AiCompletionResult.ok("fake-content")


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


def test_status_disabled_when_ai_enabled_is_false() -> None:
    svc = AiProviderService(_settings(ai_enabled=False))
    assert svc.status == AiProviderStatus.DISABLED


def test_status_unconfigured_when_no_api_key() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_model="gpt-4", ai_api_key="")
    )
    assert svc.status == AiProviderStatus.UNCONFIGURED


def test_status_unconfigured_when_no_model() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="")
    )
    assert svc.status == AiProviderStatus.UNCONFIGURED


def test_status_ok_when_fully_configured() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4")
    )
    assert svc.status == AiProviderStatus.OK


# ---------------------------------------------------------------------------
# complete — disabled / unconfigured
# ---------------------------------------------------------------------------


def test_complete_returns_disabled_when_ai_enabled_is_false() -> None:
    svc = AiProviderService(_settings(ai_enabled=False))
    result = svc.complete(_request())
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.DISABLED
    assert result.content is None


def test_complete_returns_unconfigured_when_missing_api_key() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="", ai_model="gpt-4")
    )
    result = svc.complete(_request())
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.UNCONFIGURED
    assert result.error_message is not None


def test_complete_returns_unconfigured_when_missing_model() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="")
    )
    result = svc.complete(_request())
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.UNCONFIGURED


# ---------------------------------------------------------------------------
# complete — no client
# ---------------------------------------------------------------------------


def test_complete_returns_not_implemented_when_no_client_injected() -> None:
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4")
    )
    result = svc.complete(_request())
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.ERROR
    assert result.error_type == "not_implemented"


# ---------------------------------------------------------------------------
# complete — with mock client
# ---------------------------------------------------------------------------


def test_complete_delegates_to_client_and_returns_ok() -> None:
    client = _FakeClient(result=AiCompletionResult.ok("response text", model="gpt-4"))
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    result = svc.complete(_request())
    assert result.is_success is True
    assert result.provider_status == AiProviderStatus.OK
    assert result.content == "response text"
    assert result.model == "gpt-4"
    assert len(client.calls) == 1


def test_complete_maps_client_exception_to_error_result() -> None:
    client = _FakeClient(exc=RuntimeError("connection refused"))
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    result = svc.complete(_request())
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.ERROR
    assert result.error_type == "provider_call_failed"
    assert "connection refused" in result.error_message


def test_complete_passes_request_fields_to_client() -> None:
    client = _FakeClient()
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    req = AiCompletionRequest(
        messages=[{"role": "system", "content": "Be helpful."}],
        max_tokens=512,
        temperature=0.7,
    )
    svc.complete(req)
    assert len(client.calls) == 1
    assert client.calls[0].messages[0]["role"] == "system"
    assert client.calls[0].max_tokens == 512
    assert client.calls[0].temperature == 0.7


# ---------------------------------------------------------------------------
# AiProviderUnavailableError
# ---------------------------------------------------------------------------


def test_unavailable_error_wraps_result() -> None:
    result = AiCompletionResult.disabled()
    exc = AiProviderUnavailableError(result)
    assert exc.result is result
    assert "disabled" in str(exc).lower()
