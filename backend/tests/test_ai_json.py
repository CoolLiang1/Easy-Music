"""Tests for AI JSON prompt contracts and parsing utilities.

Covers JSON extraction, prompt building, schema validation, and the full
``complete_and_parse_json`` pipeline.  No real provider calls — a minimal fake
client is used where needed.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest, AiCompletionResult, AiProviderStatus
from app.services.ai_json import (
    build_json_messages,
    build_json_system_prompt,
    complete_and_parse_json,
    extract_json,
    parse_json_response,
)
from app.services.ai_provider import AiProviderService


# ---------------------------------------------------------------------------
# Test Pydantic models
# ---------------------------------------------------------------------------


class _SimpleModel(BaseModel):
    name: str
    count: int


class _TagModel(BaseModel):
    scene_tag_ids: list[int] = Field(default_factory=list)
    feature_tag_ids: list[int] = Field(default_factory=list)
    explanation: str | None = None


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _settings(**overrides) -> Settings:
    defaults: dict = {
        "ai_enabled": False,
        "ai_provider": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_base_url": "",
    }
    defaults.update(overrides)
    return Settings(**defaults)


class _FakeClient:
    """Test double for the AI provider HTTP client."""

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


class _SequenceClient:
    """Test double that returns configured results in order."""

    def __init__(self, results: list[AiCompletionResult]):
        self.results = results
        self.calls: list[AiCompletionRequest] = []

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        self.calls.append(request)
        index = min(len(self.calls) - 1, len(self.results) - 1)
        return self.results[index]


# ---------------------------------------------------------------------------
# extract_json
# ---------------------------------------------------------------------------


def test_extract_json_clean_object() -> None:
    assert extract_json('{"a": 1}') == '{"a": 1}'


def test_extract_json_from_markdown_fence() -> None:
    text = 'Sure! Here it is:\n\n```json\n{"name": "test", "count": 3}\n```\n'
    result = extract_json(text)
    assert result is not None
    assert '"name"' in result
    assert '"count"' in result


def test_extract_json_from_fence_without_lang_label() -> None:
    text = '```\n{"x": "y"}\n```'
    result = extract_json(text)
    assert result is not None
    assert '"x": "y"' in result


def test_extract_json_surrounded_by_text() -> None:
    text = 'Some prefix text {"key": 42} and suffix text.'
    result = extract_json(text)
    assert result is not None
    assert '"key": 42' in result


def test_extract_json_nested_braces() -> None:
    text = '{"outer": {"inner": [1, 2, 3]}, "flag": true}'
    result = extract_json(text)
    assert result is not None
    assert '"outer"' in result
    assert '"inner"' in result


def test_extract_json_returns_none_for_plain_text() -> None:
    assert extract_json("I cannot process this request.") is None


def test_extract_json_returns_none_for_empty_string() -> None:
    assert extract_json("") is None


def test_extract_json_returns_none_for_whitespace_only() -> None:
    assert extract_json("   \n  ") is None


def test_extract_json_returns_none_for_malformed_json() -> None:
    assert extract_json('{"a": 1') is None


def test_extract_json_rejects_unbalanced_braces() -> None:
    assert extract_json('{"a": {"b": 1}') is None


def test_extract_json_prefers_fence_over_outer_text() -> None:
    # The outer text has a JSON-like fragment, but the fence has the real data.
    text = 'context {"ignored": true}\n```json\n{"name": "real"}\n```\nmore {"also_ignored": 1}'
    result = extract_json(text)
    assert result is not None
    assert '"name": "real"' in result
    assert "ignored" not in result


# ---------------------------------------------------------------------------
# build_json_system_prompt
# ---------------------------------------------------------------------------


def test_build_prompt_includes_schema() -> None:
    prompt = build_json_system_prompt(_SimpleModel)
    assert '"name"' in prompt
    assert '"count"' in prompt
    assert "string" in prompt  # name is string
    assert "integer" in prompt  # count is int


def test_build_prompt_includes_tag_guard_by_default() -> None:
    prompt = build_json_system_prompt(_TagModel)
    assert "never invent" in prompt.lower()
    assert "tag id" in prompt.lower()


def test_build_prompt_can_disable_tag_guard() -> None:
    prompt = build_json_system_prompt(_TagModel, include_tag_guard=False)
    assert "never invent" not in prompt.lower()


def test_build_prompt_appends_extra_instruction() -> None:
    prompt = build_json_system_prompt(
        _SimpleModel, extra_instruction="Do not include PII."
    )
    assert "Do not include PII." in prompt


def test_build_prompt_instructions_appear_before_schema() -> None:
    prompt = build_json_system_prompt(_SimpleModel)
    schema_pos = prompt.find('"properties"')
    guard_pos = prompt.find("Only use tag ids")
    # The guard (if present) and schema instructions precede the JSON Schema text
    assert guard_pos < schema_pos


# ---------------------------------------------------------------------------
# build_json_messages
# ---------------------------------------------------------------------------


def test_build_json_messages_returns_system_and_user() -> None:
    messages = build_json_messages("Find me music", _SimpleModel)
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "Find me music"
    assert "string" in messages[0]["content"]


# ---------------------------------------------------------------------------
# parse_json_response
# ---------------------------------------------------------------------------


def test_parse_valid_json_matching_schema() -> None:
    instance, error = parse_json_response(
        '{"name": "hello", "count": 42}',
        _SimpleModel,
    )
    assert error is None
    assert instance is not None
    assert instance.name == "hello"
    assert instance.count == 42


def test_parse_json_ignores_extra_fields() -> None:
    instance, error = parse_json_response(
        '{"name": "x", "count": 1, "extra": true}',
        _SimpleModel,
    )
    assert error is None
    assert instance is not None
    assert instance.name == "x"


def test_parse_json_missing_required_field() -> None:
    instance, error = parse_json_response(
        '{"name": "x"}',
        _SimpleModel,
    )
    assert instance is None
    assert error is not None
    assert "count" in error.lower() or "missing" in error.lower() or "validation" in error.lower()


def test_parse_json_wrong_field_type() -> None:
    instance, error = parse_json_response(
        '{"name": "x", "count": "not-a-number"}',
        _SimpleModel,
    )
    assert instance is None
    assert error is not None


def test_parse_json_returns_error_for_no_json() -> None:
    instance, error = parse_json_response("just some text", _SimpleModel)
    assert instance is None
    assert error is not None
    assert "No valid JSON" in error


def test_parse_json_returns_error_for_malformed_json() -> None:
    instance, error = parse_json_response('{"name": "x", count: 1}', _SimpleModel)
    assert instance is None
    assert error is not None
    # Malformed JSON won't parse — extract_json returns None
    assert "No valid JSON" in error


def test_parse_json_validates_list_field_types() -> None:
    instance, error = parse_json_response(
        '{"scene_tag_ids": [1, 2, 3], "explanation": "ok"}',
        _TagModel,
    )
    assert error is None
    assert instance is not None
    assert instance.scene_tag_ids == [1, 2, 3]


def test_parse_json_rejects_wrong_list_item_type() -> None:
    instance, error = parse_json_response(
        '{"scene_tag_ids": ["not-an-int"], "explanation": "ok"}',
        _TagModel,
    )
    assert instance is None
    assert error is not None


# ---------------------------------------------------------------------------
# complete_and_parse_json
# ---------------------------------------------------------------------------


def test_complete_and_parse_success_path() -> None:
    client = _FakeClient(
        result=AiCompletionResult.ok('{"name": "rec", "count": 7}', model="gpt-4")
    )
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    parsed, result, parse_error = complete_and_parse_json(
        svc, "a user request", _SimpleModel
    )
    assert parsed is not None
    assert parsed.name == "rec"
    assert parsed.count == 7
    assert result.is_success is True
    assert parse_error is None


def test_complete_and_parse_provider_disabled() -> None:
    svc = AiProviderService(_settings(ai_enabled=False))
    parsed, result, parse_error = complete_and_parse_json(
        svc, "any request", _SimpleModel
    )
    assert parsed is None
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.DISABLED
    assert parse_error is None


def test_complete_and_parse_provider_error_response() -> None:
    client = _FakeClient(
        result=AiCompletionResult.error("timeout", "request timed out")
    )
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    parsed, result, parse_error = complete_and_parse_json(
        svc, "any request", _SimpleModel
    )
    assert parsed is None
    assert result.is_success is False
    assert result.provider_status == AiProviderStatus.ERROR
    assert parse_error is None


def test_complete_and_parse_malformed_json_from_provider() -> None:
    client = _FakeClient(
        result=AiCompletionResult.ok("not json at all, just words")
    )
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    parsed, result, parse_error = complete_and_parse_json(
        svc, "any request", _SimpleModel
    )
    assert parsed is None
    assert result.is_success is True  # provider was fine
    assert parse_error is not None
    assert "No valid JSON" in parse_error


def test_complete_and_parse_passes_system_instruction() -> None:
    client = _FakeClient()
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    complete_and_parse_json(
        svc,
        "recommend calm music",
        _SimpleModel,
        system_instruction="Only use existing tags.",
    )
    assert len(client.calls) == 1
    system_content = client.calls[0].messages[0]["content"]
    assert "Only use existing tags." in system_content


def test_complete_and_parse_passes_max_tokens_and_temperature() -> None:
    client = _FakeClient()
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    complete_and_parse_json(
        svc,
        "request",
        _SimpleModel,
        max_tokens=512,
        temperature=0.1,
    )
    assert len(client.calls) == 1
    assert client.calls[0].max_tokens == 512
    assert client.calls[0].temperature == 0.1


def test_complete_and_parse_requests_json_response_format() -> None:
    client = _FakeClient()
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )
    complete_and_parse_json(svc, "request", _SimpleModel)
    assert len(client.calls) == 1
    assert client.calls[0].response_format == {"type": "json_object"}


def test_complete_and_parse_retries_empty_json_response() -> None:
    client = _SequenceClient(
        [
            AiCompletionResult.error("empty_response", "Provider returned no content."),
            AiCompletionResult.ok('{"name": "rec", "count": 7}'),
        ]
    )
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )

    parsed, result, parse_error = complete_and_parse_json(
        svc, "request", _SimpleModel
    )

    assert parsed is not None
    assert parsed.name == "rec"
    assert result.is_success is True
    assert parse_error is None
    assert len(client.calls) == 2


def test_complete_and_parse_retries_no_valid_json_response() -> None:
    client = _SequenceClient(
        [
            AiCompletionResult.ok(""),
            AiCompletionResult.ok('{"name": "rec", "count": 7}'),
        ]
    )
    svc = AiProviderService(
        _settings(ai_enabled=True, ai_api_key="sk-test", ai_model="gpt-4"),
        client=client,
    )

    parsed, result, parse_error = complete_and_parse_json(
        svc, "request", _SimpleModel
    )

    assert parsed is not None
    assert result.is_success is True
    assert parse_error is None
    assert len(client.calls) == 2
