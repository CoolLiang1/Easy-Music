"""Tests for suggest-tags search context and cache behavior."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.models.ai_tag_search_cache import AiTagSearchCache
from app.models.track import Track
from app.services.ai_tag_search import AiTagSearchService, build_track_search_query
from app.services.ai_tag_search_client import TagSearchClientResult, TagSearchResult


class _FakeSearchClient:
    def __init__(self, result: TagSearchClientResult):
        self.result = result
        self.calls: list[tuple[str, int]] = []

    def search(self, query: str, *, max_results: int) -> TagSearchClientResult:
        self.calls.append((query, max_results))
        return self.result


def _settings(**overrides) -> Settings:
    defaults = {
        "ai_tag_search_enabled": False,
        "ai_tag_search_provider": "tavily",
        "ai_tag_search_api_key": "",
        "ai_tag_search_base_url": "https://api.tavily.com",
        "ai_tag_search_max_results": 5,
        "ai_tag_search_cache_days": 30,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _db_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def _track(**overrides) -> Track:
    defaults = {
        "id": 1,
        "user_id": 1,
        "title": "Lemon",
        "artist": "Kenshi Yonezu",
        "album": "Stray Sheep",
        "content_type": "song",
        "original_file_path": "originals/Lemon.mp3",
        "source_url": "https://music.example.test/tracks/lemon",
    }
    defaults.update(overrides)
    return Track(**defaults)


def test_build_track_search_query_uses_metadata_filename_and_source_url() -> None:
    query = build_track_search_query(_track())

    assert "Lemon" in query
    assert "Kenshi Yonezu" in query
    assert "Stray Sheep" in query
    assert "music.example.test tracks/lemon" in query
    assert "originals" not in query
    assert query.endswith("music")


def test_search_disabled_does_not_call_client() -> None:
    client = _FakeSearchClient(TagSearchClientResult(status="ok"))
    service = AiTagSearchService(_settings(ai_tag_search_enabled=False), client=client)

    with _db_session() as db:
        context = service.search_for_track(db, _track())

    assert context.status == "disabled"
    assert client.calls == []


def test_search_unconfigured_without_api_key_does_not_call_client() -> None:
    client = _FakeSearchClient(TagSearchClientResult(status="ok"))
    service = AiTagSearchService(
        _settings(ai_tag_search_enabled=True, ai_tag_search_api_key=""),
        client=client,
    )

    with _db_session() as db:
        context = service.search_for_track(db, _track())

    assert context.status == "unconfigured"
    assert client.calls == []


def test_search_stores_and_reuses_cached_normalized_results() -> None:
    client = _FakeSearchClient(
        TagSearchClientResult(
            status="ok",
            results=[
                TagSearchResult(
                    title="Lemon song",
                    snippet="A drama theme song by Kenshi Yonezu.",
                    url="https://example.test/lemon",
                )
            ],
        )
    )
    settings = _settings(
        ai_tag_search_enabled=True,
        ai_tag_search_api_key="tvly-test",
        ai_tag_search_max_results=3,
    )
    service = AiTagSearchService(
        settings,
        client=client,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    with _db_session() as db:
        first = service.search_for_track(db, _track())
        second = service.search_for_track(db, _track())
        rows = list(db.query(AiTagSearchCache).all())

    assert first.status == "ok"
    assert second.status == "ok"
    assert second.results[0].title == "Lemon song"
    assert client.calls == [("Lemon Kenshi Yonezu Stray Sheep music.example.test tracks/lemon music", 3)]
    assert len(rows) == 1
    assert rows[0].results_json == [
        {
            "title": "Lemon song",
            "snippet": "A drama theme song by Kenshi Yonezu.",
            "url": "https://example.test/lemon",
        }
    ]


def test_expired_cache_refreshes_from_client() -> None:
    settings = _settings(
        ai_tag_search_enabled=True,
        ai_tag_search_api_key="tvly-test",
        ai_tag_search_cache_days=1,
    )
    client = _FakeSearchClient(
        TagSearchClientResult(
            status="ok",
            results=[TagSearchResult(title="Fresh", snippet="Fresh result", url="")],
        )
    )
    with _db_session() as db:
        db.add(
            AiTagSearchCache(
                provider="tavily",
                query=build_track_search_query(_track()),
                status="ok",
                results_json=[{"title": "Old", "snippet": "Old result", "url": ""}],
                searched_at=datetime(2026, 6, 20, tzinfo=UTC),
            )
        )
        db.commit()

        service = AiTagSearchService(
            settings,
            client=client,
            now=datetime(2026, 6, 29, tzinfo=UTC),
        )
        context = service.search_for_track(db, _track())

    assert context.results[0].title == "Fresh"
    assert len(client.calls) == 1
