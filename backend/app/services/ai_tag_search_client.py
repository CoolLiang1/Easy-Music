"""Tavily search client for AI tag suggestions.

The client only returns normalized title/snippet/URL records. It never stores
or exposes raw page bodies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
import socket
from typing import Any
import urllib.error
import urllib.request

from app.core.config import Settings

_TIMEOUT_SECONDS = 20
_NETWORK_ATTEMPTS = 2


@dataclass(frozen=True)
class TagSearchResult:
    title: str
    snippet: str
    url: str


@dataclass(frozen=True)
class TagSearchClientResult:
    status: str
    results: list[TagSearchResult] = field(default_factory=list)
    error_message: str = ""


class TavilyTagSearchClient:
    """Minimal Tavily Search API client used only by suggest-tags."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._opener = _build_opener()

    def search(self, query: str, *, max_results: int) -> TagSearchClientResult:
        url = f"{self._settings.ai_tag_search_base_url.rstrip('/')}/search"
        body: dict[str, Any] = {
            "query": query,
            "search_depth": "basic",
            "max_results": max_results,
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
        }
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self._settings.ai_tag_search_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with _open_with_network_retry(self._opener, request) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                results = _extract_results(payload, limit=max_results)
                if not results:
                    return TagSearchClientResult(status="no_results")
                return TagSearchClientResult(status="ok", results=results)
        except urllib.error.HTTPError as exc:
            return TagSearchClientResult(
                status="error",
                error_message=_read_error_body(exc) or f"Tavily returned HTTP {exc.code}.",
            )
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            return TagSearchClientResult(
                status="error",
                error_message=f"Could not reach Tavily search: {exc}",
            )
        except Exception as exc:
            return TagSearchClientResult(status="error", error_message=str(exc))


def _extract_results(payload: dict[str, Any], *, limit: int) -> list[TagSearchResult]:
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        return []

    results: list[TagSearchResult] = []
    for item in raw_results[:limit]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        snippet = str(item.get("content") or item.get("snippet") or "").strip()
        url = str(item.get("url") or "").strip()
        if not title and not snippet:
            continue
        results.append(
            TagSearchResult(
                title=_truncate(title, 180),
                snippet=_truncate(snippet, 500),
                url=_truncate(url, 500),
            ),
        )
    return results


def _truncate(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return value[: max_length - 1].rstrip() + "..."


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
        error = body.get("error", body)
        if isinstance(error, dict):
            return error.get("message", "") or json.dumps(error)
        return str(error)
    except Exception:
        return exc.reason or f"HTTP {exc.code}"
