"""Tests for the Tavily-compatible search HTTP client."""

import json
import urllib.error

from app.core.config import Settings
from app.schemas.ai_search import AiSearchRequest
from app.services.ai_search_client import TavilyCompatibleSearchClient


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class _FakeErrorResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    def close(self) -> None:
        pass


class _FakeOpener:
    def __init__(self, payload: dict):
        self._payload = payload
        self.requests = []

    def open(self, request, timeout: int):
        self.requests.append((request, timeout))
        return _FakeResponse(self._payload)


class _FlakyOpener:
    def __init__(self, outcomes: list[dict | Exception]):
        self._outcomes = outcomes
        self.requests = []

    def open(self, request, timeout: int):
        self.requests.append((request, timeout))
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return _FakeResponse(outcome)


def _settings() -> Settings:
    return Settings(
        ai_search_enabled=True,
        ai_search_provider="tavily-compatible",
        ai_search_api_key="tvly-test",
        ai_search_base_url="https://api.tavily.com",
        ai_search_max_results=5,
    )


def test_search_sends_tavily_request_and_normalizes_results(monkeypatch) -> None:
    opener = _FakeOpener(
        {
            "results": [
                {
                    "title": "  Song title  ",
                    "content": " First   snippet. ",
                    "url": "https://example.test/a",
                    "raw_content": "ignored page body",
                },
                {
                    "title": "Artist page",
                    "snippet": "Fallback snippet.",
                    "url": "https://example.test/b",
                },
            ]
        }
    )
    monkeypatch.setattr("app.services.ai_search_client._build_opener", lambda: opener)

    client = TavilyCompatibleSearchClient(_settings())
    result = client.search(AiSearchRequest(query="song artist", max_results=2))

    assert result.is_success is True
    assert result.results[0].title == "Song title"
    assert result.results[0].snippet == "First snippet."
    assert result.results[0].url == "https://example.test/a"
    assert len(result.results) == 2

    request = opener.requests[0][0]
    body = json.loads(request.data.decode("utf-8"))
    assert request.full_url == "https://api.tavily.com/search"
    assert request.headers["Authorization"] == "Bearer tvly-test"
    assert body["query"] == "song artist"
    assert body["max_results"] == 2
    assert body["include_raw_content"] is False


def test_search_limits_normalized_results_to_request_max(monkeypatch) -> None:
    opener = _FakeOpener(
        {
            "results": [
                {"title": "One", "content": "Snippet", "url": "https://example.test/1"},
                {"title": "Two", "content": "Snippet", "url": "https://example.test/2"},
            ]
        }
    )
    monkeypatch.setattr("app.services.ai_search_client._build_opener", lambda: opener)

    client = TavilyCompatibleSearchClient(_settings())
    result = client.search(AiSearchRequest(query="song artist", max_results=1))

    assert len(result.results) == 1
    assert result.results[0].title == "One"


def test_search_maps_http_error_to_safe_error(monkeypatch) -> None:
    error = urllib.error.HTTPError(
        "https://api.tavily.com/search",
        500,
        "Internal Server Error",
        hdrs=None,
        fp=_FakeErrorResponse({"detail": "upstream failed"}),
    )
    opener = _FlakyOpener([error])
    monkeypatch.setattr("app.services.ai_search_client._build_opener", lambda: opener)

    client = TavilyCompatibleSearchClient(_settings())
    result = client.search(AiSearchRequest(query="song artist", max_results=2))

    assert result.is_success is False
    assert result.error_type == "provider_error"
    assert result.error_message == "upstream failed"
    assert "tvly-test" not in (result.error_message or "")


def test_search_maps_auth_error_to_safe_error(monkeypatch) -> None:
    error = urllib.error.HTTPError(
        "https://api.tavily.com/search",
        401,
        "Unauthorized",
        hdrs=None,
        fp=_FakeErrorResponse({"detail": "bad key"}),
    )
    opener = _FlakyOpener([error])
    monkeypatch.setattr("app.services.ai_search_client._build_opener", lambda: opener)

    client = TavilyCompatibleSearchClient(_settings())
    result = client.search(AiSearchRequest(query="song artist", max_results=2))

    assert result.is_success is False
    assert result.error_type == "auth_error"
    assert result.error_message == "bad key"


def test_search_retries_transient_network_error(monkeypatch) -> None:
    opener = _FlakyOpener(
        [
            urllib.error.URLError("[SSL: UNEXPECTED_EOF_WHILE_READING]"),
            {"results": [{"title": "Recovered", "content": "Snippet", "url": ""}]},
        ]
    )
    monkeypatch.setattr("app.services.ai_search_client._build_opener", lambda: opener)

    client = TavilyCompatibleSearchClient(_settings())
    result = client.search(AiSearchRequest(query="song artist", max_results=2))

    assert result.is_success is True
    assert result.results[0].title == "Recovered"
    assert len(opener.requests) == 2
