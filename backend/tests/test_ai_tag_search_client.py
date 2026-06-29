"""Tests for Tavily suggest-tags search client request/response mapping."""

import json
import urllib.error

from app.core.config import Settings
from app.services.ai_tag_search_client import TavilyTagSearchClient


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


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
        ai_tag_search_enabled=True,
        ai_tag_search_provider="tavily",
        ai_tag_search_api_key="tvly-test",
        ai_tag_search_base_url="https://api.tavily.com",
        ai_tag_search_max_results=3,
    )


def test_tavily_search_sends_safe_basic_search_request(monkeypatch) -> None:
    opener = _FakeOpener(
        {
            "results": [
                {
                    "title": "Track info",
                    "content": "Short result snippet.",
                    "url": "https://example.test/track",
                    "raw_content": "This must not be read.",
                }
            ]
        }
    )
    monkeypatch.setattr("app.services.ai_tag_search_client._build_opener", lambda: opener)

    client = TavilyTagSearchClient(_settings())
    result = client.search("track artist music", max_results=3)

    assert result.status == "ok"
    assert result.results[0].title == "Track info"
    assert result.results[0].snippet == "Short result snippet."
    assert result.results[0].url == "https://example.test/track"

    request = opener.requests[0][0]
    assert request.headers["Authorization"] == "Bearer tvly-test"
    body = json.loads(request.data.decode("utf-8"))
    assert body == {
        "query": "track artist music",
        "search_depth": "basic",
        "max_results": 3,
        "include_answer": False,
        "include_raw_content": False,
        "include_images": False,
    }


def test_tavily_search_returns_no_results_for_empty_response(monkeypatch) -> None:
    opener = _FakeOpener({"results": []})
    monkeypatch.setattr("app.services.ai_tag_search_client._build_opener", lambda: opener)

    result = TavilyTagSearchClient(_settings()).search("unknown", max_results=3)

    assert result.status == "no_results"
    assert result.results == []


def test_tavily_search_retries_transient_network_error(monkeypatch) -> None:
    opener = _FlakyOpener(
        [
            urllib.error.URLError("temporary"),
            {"results": [{"title": "Recovered", "content": "Snippet", "url": ""}]},
        ]
    )
    monkeypatch.setattr("app.services.ai_tag_search_client._build_opener", lambda: opener)

    result = TavilyTagSearchClient(_settings()).search("track", max_results=3)

    assert result.status == "ok"
    assert result.results[0].title == "Recovered"
    assert len(opener.requests) == 2
