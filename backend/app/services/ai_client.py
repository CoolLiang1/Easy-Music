"""OpenAI-compatible chat completions HTTP client.

Plugs into AiProviderService so real provider calls work when the backend
is configured with AI_ENABLED=true and a valid API key.
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest, AiCompletionResult


class OpenAiCompatibleClient:
    """Minimal OpenAI-compatible chat completions client.

    Uses the ``/chat/completions`` endpoint.  Works with OpenAI and any
    provider that exposes the same API shape (e.g. Azure, local Ollama with
    a proxy, etc.).
    """

    def __init__(self, settings: Settings, *, http_client: httpx.Client | None = None):
        self._settings = settings
        self._http = http_client or httpx.Client(timeout=30.0)

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        url = f"{self._settings.ai_base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._settings.ai_api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {
            "model": self._settings.ai_model,
            "messages": _sanitize_messages(request.messages),
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        try:
            response = self._http.post(url, headers=headers, json=body)

            if response.status_code == 401 or response.status_code == 403:
                return AiCompletionResult.error(
                    error_type="auth_error",
                    message=_extract_error(response),
                )

            if response.status_code == 429:
                return AiCompletionResult.error(
                    error_type="rate_limited",
                    message=_extract_error(response) or "Rate limited by provider.",
                )

            if not response.is_success:
                return AiCompletionResult.error(
                    error_type="provider_error",
                    message=_extract_error(response)
                    or f"Provider returned HTTP {response.status_code}.",
                )

            data = response.json()
            content = _extract_content(data)
            if content is None:
                return AiCompletionResult.error(
                    error_type="empty_response",
                    message="Provider returned no message content.",
                )

            return AiCompletionResult.ok(
                content=content,
                model=data.get("model", self._settings.ai_model),
            )

        except httpx.TimeoutException:
            return AiCompletionResult.error(
                error_type="timeout",
                message="AI provider request timed out.",
            )

        except httpx.NetworkError as exc:
            return AiCompletionResult.error(
                error_type="network_error",
                message=f"Could not reach AI provider: {exc}",
            )

        except Exception as exc:
            return AiCompletionResult.error(
                error_type="provider_call_failed",
                message=str(exc),
            )


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _sanitize_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop any messages with empty content so the provider doesn't reject them."""
    return [
        {k: v for k, v in msg.items() if v}
        for msg in messages
        if msg.get("content", "").strip()
    ]


def _extract_content(data: dict[str, Any]) -> str | None:
    choices = data.get("choices")
    if not choices:
        return None
    message = choices[0].get("message", {})
    return message.get("content")


def _extract_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        error = body.get("error", {})
        if isinstance(error, dict):
            return error.get("message", "") or json.dumps(error)
        return str(error)
    except (ValueError, json.JSONDecodeError):
        pass
    text = (response.text or "").strip()
    return text[:500] if text else response.reason_phrase or f"HTTP {response.status_code}"
