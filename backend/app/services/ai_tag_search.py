"""Search context for AI tag suggestions.

This module is intentionally scoped to ``POST /api/ai/tracks/{track_id}/suggest-tags``.
It is not an AI organization flow and it does not apply tags.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
import os
from typing import Protocol
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.ai_tag_search_cache import AiTagSearchCache
from app.models.track import Track
from app.schemas.ai import TagSearchContextItem
from app.services.ai_tag_search_client import TagSearchClientResult

_VALID_PROVIDER = "tavily"


class _TagSearchClient(Protocol):
    def search(self, query: str, *, max_results: int) -> TagSearchClientResult:
        ...


@dataclass(frozen=True)
class TagSearchContext:
    query: str = ""
    status: str = "disabled"
    results: list[TagSearchContextItem] = field(default_factory=list)
    error_message: str = ""


class AiTagSearchService:
    def __init__(
        self,
        settings: Settings,
        *,
        client: _TagSearchClient | None = None,
        now: datetime | None = None,
    ):
        self._settings = settings
        self._client = client
        self._now = now

    def search_for_track(self, db: Session, track: Track) -> TagSearchContext:
        query = build_track_search_query(track)
        if not query:
            return TagSearchContext(status="no_query")

        status = self._configuration_status
        if status != "ok":
            return TagSearchContext(query=query, status=status)

        cached = self._load_cached_safely(db, query)
        if cached is not None:
            return cached

        if self._client is None:
            context = TagSearchContext(
                query=query,
                status="error",
                error_message="AI tag search client is not configured.",
            )
            self._store_cache_safely(db, context)
            return context

        client_result = self._client.search(
            query,
            max_results=self._settings.ai_tag_search_max_results,
        )
        context = TagSearchContext(
            query=query,
            status=client_result.status,
            results=[
                TagSearchContextItem(
                    title=item.title,
                    snippet=item.snippet,
                    url=item.url,
                )
                for item in client_result.results[: self._settings.ai_tag_search_max_results]
            ],
            error_message=client_result.error_message,
        )
        self._store_cache_safely(db, context)
        return context

    @property
    def _configuration_status(self) -> str:
        if not self._settings.ai_tag_search_enabled:
            return "disabled"
        if self._settings.ai_tag_search_provider.strip().lower() != _VALID_PROVIDER:
            return "unconfigured"
        if (
            not self._settings.ai_tag_search_api_key
            or not self._settings.ai_tag_search_base_url
        ):
            return "unconfigured"
        return "ok"

    def _load_cached(self, db: Session, query: str) -> TagSearchContext | None:
        if self._settings.ai_tag_search_cache_days <= 0:
            return None
        row = db.scalar(
            select(AiTagSearchCache).where(
                AiTagSearchCache.provider == _VALID_PROVIDER,
                AiTagSearchCache.query == query,
            ),
        )
        if row is None:
            return None
        searched_at = _as_aware_utc(row.searched_at)
        if self._clock() - searched_at > timedelta(
            days=self._settings.ai_tag_search_cache_days,
        ):
            return None
        return TagSearchContext(
            query=query,
            status=row.status,
            results=[
                TagSearchContextItem(
                    title=str(item.get("title") or ""),
                    snippet=str(item.get("snippet") or ""),
                    url=str(item.get("url") or ""),
                )
                for item in (row.results_json or [])
                if isinstance(item, dict)
            ],
        )

    def _load_cached_safely(
        self,
        db: Session,
        query: str,
    ) -> TagSearchContext | None:
        try:
            return self._load_cached(db, query)
        except Exception:
            db.rollback()
            return None

    def _store_cache(self, db: Session, context: TagSearchContext) -> None:
        if self._settings.ai_tag_search_cache_days <= 0 or not context.query:
            return
        row = db.scalar(
            select(AiTagSearchCache).where(
                AiTagSearchCache.provider == _VALID_PROVIDER,
                AiTagSearchCache.query == context.query,
            ),
        )
        if row is None:
            row = AiTagSearchCache(
                provider=_VALID_PROVIDER,
                query=context.query,
                status=context.status,
                results_json=_serialize_results(context.results),
                searched_at=self._clock(),
            )
            db.add(row)
        else:
            row.status = context.status
            row.results_json = _serialize_results(context.results)
            row.searched_at = self._clock()
        db.commit()

    def _store_cache_safely(self, db: Session, context: TagSearchContext) -> None:
        try:
            self._store_cache(db, context)
        except Exception:
            db.rollback()

    def _clock(self) -> datetime:
        return self._now or datetime.now(UTC)


def build_track_search_query(track: Track) -> str:
    parts = [
        track.title,
        track.artist,
        track.album,
        _basename_without_extension(track.original_file_path),
        _source_hint(track.source_url),
        "music",
    ]
    seen: set[str] = set()
    clean: list[str] = []
    for part in parts:
        value = " ".join(str(part or "").split())
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean.append(value)
    return _truncate_query(" ".join(clean))


def _basename_without_extension(path: str | None) -> str:
    if not path:
        return ""
    basename = os.path.basename(path)
    stem, _ = os.path.splitext(basename)
    return stem or basename


def _source_hint(source_url: str | None) -> str:
    if not source_url:
        return ""
    parsed = urlparse(source_url)
    if parsed.netloc:
        path = parsed.path.strip("/")
        return f"{parsed.netloc} {path}".strip()
    return source_url


def _truncate_query(query: str) -> str:
    if len(query) <= 300:
        return query
    return query[:300].rsplit(" ", 1)[0]


def _serialize_results(results: list[TagSearchContextItem]) -> list[dict[str, str]]:
    return [
        {
            "title": item.title,
            "snippet": item.snippet,
            "url": item.url,
        }
        for item in results
    ]


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
