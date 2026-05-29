"""OpenAI-compatible chat completions HTTP client.

Plugs into AiProviderService so real provider calls work when the backend
is configured with AI_ENABLED=true and a valid API key.

Uses only stdlib (urllib) — no extra dependencies needed in production.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest, AiCompletionResult

_TIMEOUT_SECONDS = 60


class OpenAiCompatibleClient:
    """Minimal OpenAI-compatible chat completions client.

    Calls ``POST /chat/completions`` on the configured AI_BASE_URL.  Works
    with OpenAI and any provider exposing the same API shape.
    """

    def __init__(self, settings: Settings):
        self._settings = settings

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        url = f"{self._settings.ai_base_url.rstrip('/')}/chat/completions"
        body: dict[str, Any] = {
            "model": self._settings.ai_model,
            "messages": _sanitize_messages(request.messages),
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }
        data = json.dumps(body).encode("utf-8")

        http_request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self._settings.ai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(http_request, timeout=_TIMEOUT_SECONDS) as resp:
                raw = resp.read().decode("utf-8")
                response_data = json.loads(raw)
                content = _extract_content(response_data)
                if content is None:
                    return AiCompletionResult.error(
                        error_type="empty_response",
                        message="Provider returned no message content.",
                    )
                return AiCompletionResult.ok(
                    content=content,
                    model=response_data.get("model", self._settings.ai_model),
                )

        except urllib.error.HTTPError as exc:
            error_body = _read_error_body(exc)
            status = exc.code

            if status in (401, 403):
                return AiCompletionResult.error(
                    error_type="auth_error",
                    message=error_body or "Authentication failed — check your AI_API_KEY.",
                )
            if status == 429:
                return AiCompletionResult.error(
                    error_type="rate_limited",
                    message=error_body or "Rate limited by provider.",
                )
            return AiCompletionResult.error(
                error_type="provider_error",
                message=error_body or f"Provider returned HTTP {status}.",
            )

        except (urllib.error.URLError, socket.timeout, OSError) as exc:
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


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8")
        body = json.loads(raw)
        error = body.get("error", {})
        if isinstance(error, dict):
            return error.get("message", "") or json.dumps(error)
        return str(error)
    except Exception:
        return exc.reason or f"HTTP {exc.code}"
