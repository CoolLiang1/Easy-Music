"""Tavily-compatible search HTTP client for AI track organization."""

from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any

from app.core.config import Settings
from app.schemas.ai_search import AiSearchProviderResult, AiSearchRequest, AiSearchResult

_TIMEOUT_SECONDS = 30
_NETWORK_ATTEMPTS = 2


class TavilyCompatibleSearchClient:
    """Minimal Tavily-compatible search client.

    Calls ``POST /search`` and normalizes provider results to title, snippet,
    and URL. It does not request raw page content and does not fetch result URLs.
    """

    def __init__(self, settings: Settings):
        self._settings = settings
        self._opener = _build_opener()

    def search(self, request: AiSearchRequest) -> AiSearchProviderResult:
        url = f"{self._settings.ai_search_base_url.rstrip('/')}/search"
        body: dict[str, Any] = {
            "query": request.query,
            "max_results": request.max_results,
            "include_raw_content": False,
        }
        data = json.dumps(body).encode("utf-8")

        http_request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self._settings.ai_search_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with _open_with_network_retry(self._opener, http_request) as resp:
                raw = resp.read().decode("utf-8")
                response_data = json.loads(raw)
                return AiSearchProviderResult.ok(
                    provider=self._settings.ai_search_provider,
                    query=request.query,
                    results=_normalize_results(response_data, request.max_results),
                )

        except urllib.error.HTTPError as exc:
            error_body = _read_error_body(exc)
            status = exc.code
            if status in (401, 403):
                return AiSearchProviderResult.error(
                    error_type="auth_error",
                    message=_safe_error_text(
                        error_body or "Authentication failed. Check AI_SEARCH_API_KEY.",
                        secret=self._settings.ai_search_api_key,
                    ),
                    provider=self._settings.ai_search_provider,
                    query=request.query,
                )
            if status == 429:
                return AiSearchProviderResult.error(
                    error_type="rate_limited",
                    message=_safe_error_text(
                        error_body or "Rate limited by search provider.",
                        secret=self._settings.ai_search_api_key,
                    ),
                    provider=self._settings.ai_search_provider,
                    query=request.query,
                )
            return AiSearchProviderResult.error(
                error_type="provider_error",
                message=_safe_error_text(
                    error_body or f"Search provider returned HTTP {status}.",
                    secret=self._settings.ai_search_api_key,
                ),
                provider=self._settings.ai_search_provider,
                query=request.query,
            )

        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            return AiSearchProviderResult.error(
                error_type="network_error",
                message=(
                    "Could not reach search provider: "
                    f"{_safe_error_text(exc, secret=self._settings.ai_search_api_key)}"
                ),
                provider=self._settings.ai_search_provider,
                query=request.query,
            )

        except Exception as exc:
            return AiSearchProviderResult.error(
                error_type="provider_call_failed",
                message=_safe_error_text(exc, secret=self._settings.ai_search_api_key),
                provider=self._settings.ai_search_provider,
                query=request.query,
            )


def _normalize_results(data: dict[str, Any], max_results: int) -> list[AiSearchResult]:
    raw_results = data.get("results")
    if not isinstance(raw_results, list):
        return []

    normalized: list[AiSearchResult] = []
    for raw_item in raw_results[:max_results]:
        if not isinstance(raw_item, dict):
            continue
        title = _clean_text(raw_item.get("title"))
        snippet = _clean_text(raw_item.get("content") or raw_item.get("snippet"))
        url = _clean_text(raw_item.get("url"))
        if not title and not snippet and not url:
            continue
        normalized.append(
            AiSearchResult(
                title=title,
                snippet=snippet,
                url=url,
            )
        )
    return normalized


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _open_with_network_retry(
    opener: urllib.request.OpenerDirector,
    request: urllib.request.Request,
):
    for attempt in range(_NETWORK_ATTEMPTS):
        try:
            return opener.open(request, timeout=_TIMEOUT_SECONDS)
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, socket.timeout, OSError):
            if attempt >= _NETWORK_ATTEMPTS - 1:
                raise

    return opener.open(request, timeout=_TIMEOUT_SECONDS)


def _build_opener() -> urllib.request.OpenerDirector:
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy_url:
        handler = urllib.request.ProxyHandler({"https": proxy_url})
        return urllib.request.build_opener(handler)
    return urllib.request.build_opener()


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8")
        body = json.loads(raw)
        detail = body.get("detail") or body.get("message")
        if detail:
            return _safe_error_text(detail)
        error = body.get("error", {})
        if isinstance(error, dict):
            return _safe_error_text(error.get("message", "") or json.dumps(error))
        return _safe_error_text(error)
    except Exception:
        return _safe_error_text(exc.reason or f"HTTP {exc.code}")


def _safe_error_text(value: Any, *, secret: str = "") -> str:
    text = str(value).strip()
    if not text:
        return "Search provider call failed."
    if secret:
        text = text.replace(secret, "[redacted]")
    return text[:500]
