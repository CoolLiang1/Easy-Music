"""Tests for the AI search provider service abstraction."""

from app.core.config import Settings
from app.schemas.ai_search import (
    AiSearchProviderResult,
    AiSearchProviderStatus,
    AiSearchRequest,
    AiSearchResult,
)
from app.services.ai_search_provider import AiSearchProviderService


def _settings(**overrides) -> Settings:
    defaults = {
        "ai_search_enabled": False,
        "ai_search_provider": "",
        "ai_search_api_key": "",
        "ai_search_base_url": "",
        "ai_search_max_results": 5,
        "ai_search_cache_days": 30,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _request() -> AiSearchRequest:
    return AiSearchRequest(query="test song artist", max_results=5)


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
                    title="Track page",
                    snippet="Short normalized search snippet.",
                    url="https://example.test/track",
                )
            ],
        )


def test_status_disabled_when_search_enabled_is_false() -> None:
    svc = AiSearchProviderService(_settings(ai_search_enabled=False))
    assert svc.status == AiSearchProviderStatus.DISABLED


def test_status_unconfigured_when_provider_is_missing() -> None:
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="",
            ai_search_api_key="tvly-test",
            ai_search_base_url="https://api.tavily.com",
        )
    )
    assert svc.status == AiSearchProviderStatus.UNCONFIGURED


def test_status_unconfigured_when_provider_is_unsupported() -> None:
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="other-search",
            ai_search_api_key="tvly-test",
            ai_search_base_url="https://api.tavily.com",
        )
    )
    assert svc.status == AiSearchProviderStatus.UNCONFIGURED


def test_status_unconfigured_when_api_key_is_missing() -> None:
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="",
            ai_search_base_url="https://api.tavily.com",
        )
    )
    assert svc.status == AiSearchProviderStatus.UNCONFIGURED


def test_status_unconfigured_when_base_url_is_missing() -> None:
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="tvly-test",
            ai_search_base_url="",
        )
    )
    assert svc.status == AiSearchProviderStatus.UNCONFIGURED


def test_search_returns_disabled_when_search_enabled_is_false() -> None:
    svc = AiSearchProviderService(_settings(ai_search_enabled=False))
    result = svc.search(_request())
    assert result.is_success is False
    assert result.provider_status == AiSearchProviderStatus.DISABLED
    assert result.results == []


def test_search_returns_unconfigured_when_settings_are_incomplete() -> None:
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="",
            ai_search_base_url="https://api.tavily.com",
        )
    )
    result = svc.search(_request())
    assert result.is_success is False
    assert result.provider_status == AiSearchProviderStatus.UNCONFIGURED
    assert result.error_message is not None
    assert "AI_SEARCH_API_KEY" in result.error_message


def test_search_delegates_to_fake_client_and_returns_ok() -> None:
    client = _FakeSearchClient()
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="tvly-test",
            ai_search_base_url="https://api.tavily.com",
        ),
        client=client,
    )

    result = svc.search(_request())

    assert result.is_success is True
    assert result.provider_status == AiSearchProviderStatus.OK
    assert result.results[0].title == "Track page"
    assert len(client.calls) == 1


def test_search_caps_requested_results_to_configured_max() -> None:
    client = _FakeSearchClient()
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="tvly-test",
            ai_search_base_url="https://api.tavily.com",
            ai_search_max_results=3,
        ),
        client=client,
    )

    svc.search(AiSearchRequest(query="track", max_results=8))

    assert client.calls[0].max_results == 3


def test_search_maps_client_exception_to_safe_error_result() -> None:
    client = _FakeSearchClient(exc=RuntimeError("connection refused with token tvly-test"))
    svc = AiSearchProviderService(
        _settings(
            ai_search_enabled=True,
            ai_search_provider="tavily-compatible",
            ai_search_api_key="tvly-test",
            ai_search_base_url="https://api.tavily.com",
        ),
        client=client,
    )

    result = svc.search(_request())

    assert result.is_success is False
    assert result.provider_status == AiSearchProviderStatus.ERROR
    assert result.error_type == "provider_call_failed"
    assert "connection refused" in (result.error_message or "")
    assert "tvly-test" not in (result.error_message or "")
