"""AI JSON prompt contracts and parsing utilities.

Reusable helpers that ask the AI provider for strict JSON and parse the result
into validated local Pydantic schemas. No real provider calls happen here —
the caller injects an AiProviderService.
"""

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.schemas.ai import AiCompletionRequest, AiCompletionResult
from app.services.ai_provider import AiProviderService


T = TypeVar("T", bound=BaseModel)

_MARKDOWN_JSON_RE = re.compile(r"```(?:json)?\s*\n?(.*?)```", re.DOTALL)

# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------


def extract_json(text: str) -> str | None:
    """Extract a JSON object string from LLM response text.

    Tries, in order:
    1. Markdown code fence (```` ```json ... ``` ````).
    2. Outermost balanced ``{ … }`` pair.
    3. The whole trimmed text as JSON.

    Returns the JSON string on success, or ``None`` when no parseable JSON is
    found.
    """
    if not text or not text.strip():
        return None

    # Strategy 1 — markdown code fence
    m = _MARKDOWN_JSON_RE.search(text)
    if m:
        candidate = m.group(1).strip()
        if candidate and _is_valid_json(candidate):
            return candidate

    # Strategy 2 — outermost balanced { … }
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    if _is_valid_json(candidate):
                        return candidate
                    break  # balanced but invalid — don't keep scanning

    # Strategy 3 — whole text
    stripped = text.strip()
    if stripped.startswith("{") and _is_valid_json(stripped):
        return stripped

    return None


def _is_valid_json(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except json.JSONDecodeError:
        return False


# ---------------------------------------------------------------------------
# prompt building
# ---------------------------------------------------------------------------

_DEFAULT_SYSTEM_INSTRUCTION = (
    "Only use tag ids that are explicitly listed in the user message. "
    "Never invent, guess, or hallucinate tag ids. "
    'If no matching tag exists for a concept, leave the field empty or omit it.'
)


def build_json_system_prompt(
    output_model: type[BaseModel],
    *,
    extra_instruction: str = "",
    include_tag_guard: bool = True,
) -> str:
    """Build a compact system prompt that instructs the LLM to return strict JSON.

    The prompt includes the full JSON Schema of *output_model* so the LLM knows
    the exact shape to produce.  *extra_instruction* is appended verbatim after
    the schema block.  When *include_tag_guard* is ``True`` (the default), a
    standard instruction forbidding invented tag ids is prepended.
    """
    schema = json.dumps(output_model.model_json_schema(), indent=2)
    parts: list[str] = []

    if include_tag_guard:
        parts.append(_DEFAULT_SYSTEM_INSTRUCTION)

    parts.extend(
        [
            "You are a structured JSON API. Respond ONLY with a valid JSON object.",
            "Do not wrap the JSON in markdown fences. Do not add explanations.",
            "The JSON object must conform to this JSON Schema:",
            schema,
        ]
    )

    if extra_instruction:
        parts.append(extra_instruction)

    return "\n\n".join(parts)


def build_json_messages(
    user_message: str,
    output_model: type[BaseModel],
    *,
    system_instruction: str = "",
) -> list[dict[str, str]]:
    """Return a message list ready for ``AiCompletionRequest.messages``.

    Convenience wrapper around ``build_json_system_prompt``.
    """
    return [
        {
            "role": "system",
            "content": build_json_system_prompt(
                output_model,
                extra_instruction=system_instruction,
            ),
        },
        {"role": "user", "content": user_message},
    ]


# ---------------------------------------------------------------------------
# JSON parsing & validation
# ---------------------------------------------------------------------------


def parse_json_response(
    text: str,
    output_model: type[BaseModel],
) -> tuple[BaseModel | None, str | None]:
    """Extract JSON from raw LLM text and validate against *output_model*.

    Returns a ``(parsed_instance, error_message)`` tuple — exactly one of the
    two values is ``None``.
    """
    json_str = extract_json(text)
    if json_str is None:
        return None, "No valid JSON found in AI response."

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        return None, f"Invalid JSON in AI response: {exc}"

    # Pydantic v2 model_validate gives us full type + constraint checking
    try:
        instance = output_model.model_validate(data)
    except ValidationError as exc:
        return None, f"AI response does not match expected schema: {exc}"

    return instance, None


# ---------------------------------------------------------------------------
# full pipeline
# ---------------------------------------------------------------------------


def complete_and_parse_json(
    provider: AiProviderService,
    user_message: str,
    output_model: type[BaseModel],
    *,
    system_instruction: str = "",
    max_tokens: int = 1024,
    temperature: float = 0.3,
    max_attempts: int = 3,
) -> tuple[BaseModel | None, AiCompletionResult, str | None]:
    """Run the full prompt → provider → extract-JSON → validate pipeline.

    Returns ``(parsed_model, completion_result, parse_error)``:

    * *parsed_model* — the validated Pydantic instance, or ``None``.
    * *completion_result* — always set; check ``is_success`` for provider
      status.
    * *parse_error* — human-readable message when JSON extraction or validation
      failed, otherwise ``None``.
    """
    messages = build_json_messages(
        user_message,
        output_model,
        system_instruction=system_instruction,
    )
    request = AiCompletionRequest(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        response_format={"type": "json_object"},
    )

    attempts = max(1, max_attempts)
    for attempt in range(attempts):
        result = provider.complete(request)
        if not result.is_success:
            if _should_retry_completion(result, attempt, attempts):
                continue
            return None, result, None

        parsed, parse_error = parse_json_response(result.content or "", output_model)
        if parsed is not None:
            return parsed, result, None
        if _should_retry_parse_error(parse_error, attempt, attempts):
            continue
        return None, result, parse_error

    return None, result, parse_error


def _should_retry_completion(
    result: AiCompletionResult,
    attempt: int,
    max_attempts: int,
) -> bool:
    if attempt >= max_attempts - 1:
        return False
    return result.error_type == "empty_response"


def _should_retry_parse_error(
    parse_error: str | None,
    attempt: int,
    max_attempts: int,
) -> bool:
    if attempt >= max_attempts - 1 or parse_error is None:
        return False
    return parse_error.startswith("No valid JSON")
