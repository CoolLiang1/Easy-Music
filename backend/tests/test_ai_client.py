"""Tests for the OpenAI-compatible HTTP client request/response mapping."""

import json

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest
from app.services.ai_client import OpenAiCompatibleClient


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


def _settings() -> Settings:
    return Settings(
        ai_enabled=True,
        ai_api_key="sk-test",
        ai_model="gpt-test",
        ai_base_url="https://example.test",
    )


def test_complete_sends_response_format(monkeypatch) -> None:
    opener = _FakeOpener(
        {
            "model": "gpt-test",
            "choices": [{"message": {"content": '{"ok": true}'}}],
        }
    )
    monkeypatch.setattr("app.services.ai_client._build_opener", lambda: opener)

    client = OpenAiCompatibleClient(_settings())
    result = client.complete(
        AiCompletionRequest(
            messages=[{"role": "user", "content": "json please"}],
            response_format={"type": "json_object"},
        )
    )

    assert result.is_success is True
    body = json.loads(opener.requests[0][0].data.decode("utf-8"))
    assert body["response_format"] == {"type": "json_object"}


def test_complete_treats_blank_content_as_empty_response(monkeypatch) -> None:
    opener = _FakeOpener(
        {
            "model": "gpt-test",
            "choices": [{"message": {"content": "   "}}],
        }
    )
    monkeypatch.setattr("app.services.ai_client._build_opener", lambda: opener)

    client = OpenAiCompatibleClient(_settings())
    result = client.complete(
        AiCompletionRequest(messages=[{"role": "user", "content": "hello"}])
    )

    assert result.is_success is False
    assert result.error_type == "empty_response"
