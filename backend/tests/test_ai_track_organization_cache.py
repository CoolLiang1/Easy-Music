"""Tests for V2.5 AI track organization cache models and lookup helpers."""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.db.base import Base
from app.models.track import Track
from app.models.track_ai_organization import TrackAiAnalysis, TrackAiResearch
from app.models.user import User
from app.services.ai_track_organization_cache import (
    create_analysis_record,
    create_research_record,
    get_latest_analysis,
    get_latest_research,
    get_latest_usable_research,
)


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def create_track(db_session: Session, user: User, title: str = "Track") -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist="Artist",
        album="Album",
        duration_seconds=180,
        content_type="song",
        original_file_path=f"originals/{title}.mp3",
        playback_file_path=f"playback/{title}.mp3",
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        status="ready",
        liked=False,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_metadata_creates_research_and_analysis_cache_tables(
    db_session: Session,
) -> None:
    table_names = set(inspect(db_session.bind).get_table_names())

    assert "track_ai_research" in table_names
    assert "track_ai_analysis" in table_names
    assert "track_ai_organization_apply_events" not in table_names


def test_create_research_stores_normalized_snippets_without_page_bodies(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    now = datetime(2026, 6, 28, tzinfo=timezone.utc)

    research = create_research_record(
        db_session,
        user=user,
        track=track,
        query="Artist Track",
        provider="tavily-compatible",
        status="ok",
        results=[
            {
                "title": "Track result",
                "snippet": "Short search snippet.",
                "url": "https://example.test/track",
            }
        ],
        error_message=None,
        fetched_at=now,
        expires_at=now + timedelta(days=30),
    )

    saved = db_session.get(TrackAiResearch, research.id)
    assert saved is not None
    assert saved.user_id == user.id
    assert saved.track_id == track.id
    assert saved.results_json == [
        {
            "title": "Track result",
            "snippet": "Short search snippet.",
            "url": "https://example.test/track",
        }
    ]
    assert "raw_content" not in saved.results_json[0]
    assert "page_body" not in saved.results_json[0]


def test_latest_usable_research_is_owner_and_track_scoped(
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    owner_track = create_track(db_session, owner, title="Owner")
    other_track = create_track(db_session, other, title="Other")
    now = datetime(2026, 6, 28, tzinfo=timezone.utc)

    owner_research = create_research_record(
        db_session,
        user=owner,
        track=owner_track,
        query="owner query",
        provider="tavily-compatible",
        status="ok",
        results=[{"title": "Owner", "snippet": "Visible", "url": ""}],
        error_message=None,
        fetched_at=now,
        expires_at=now + timedelta(days=30),
    )
    create_research_record(
        db_session,
        user=other,
        track=other_track,
        query="other query",
        provider="tavily-compatible",
        status="ok",
        results=[{"title": "Other", "snippet": "Hidden", "url": ""}],
        error_message=None,
        fetched_at=now + timedelta(minutes=1),
        expires_at=now + timedelta(days=30),
    )

    latest = get_latest_usable_research(
        db_session,
        user=owner,
        track=owner_track,
        now=now,
    )

    assert latest is not None
    assert latest.id == owner_research.id
    assert latest.results_json[0]["title"] == "Owner"


def test_latest_usable_research_ignores_expired_and_error_records(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user)
    now = datetime(2026, 6, 28, tzinfo=timezone.utc)
    reusable = create_research_record(
        db_session,
        user=user,
        track=track,
        query="old usable",
        provider="tavily-compatible",
        status="ok",
        results=[{"title": "Reusable", "snippet": "Still valid", "url": ""}],
        error_message=None,
        fetched_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=1),
    )
    create_research_record(
        db_session,
        user=user,
        track=track,
        query="latest expired",
        provider="tavily-compatible",
        status="ok",
        results=[{"title": "Expired", "snippet": "Too old", "url": ""}],
        error_message=None,
        fetched_at=now,
        expires_at=now - timedelta(seconds=1),
    )
    create_research_record(
        db_session,
        user=user,
        track=track,
        query="latest error",
        provider="tavily-compatible",
        status="error",
        results=[],
        error_message="Search provider failed.",
        fetched_at=now + timedelta(minutes=1),
        expires_at=now + timedelta(days=30),
    )

    latest = get_latest_research(db_session, user=user, track=track)
    usable = get_latest_usable_research(db_session, user=user, track=track, now=now)

    assert latest is not None
    assert latest.status == "error"
    assert usable is not None
    assert usable.id == reusable.id


def test_analysis_records_store_suggestions_and_latest_lookup_is_scoped(
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other = create_user(db_session, username="other")
    owner_track = create_track(db_session, owner, title="Owner")
    other_track = create_track(db_session, other, title="Other")
    now = datetime(2026, 6, 28, tzinfo=timezone.utc)
    research = create_research_record(
        db_session,
        user=owner,
        track=owner_track,
        query="owner query",
        provider="tavily-compatible",
        status="ok",
        results=[],
        error_message=None,
        fetched_at=now,
        expires_at=now + timedelta(days=30),
    )

    first = create_analysis_record(
        db_session,
        user=owner,
        track=owner_track,
        research=research,
        provider="openai-compatible",
        model="gpt-test",
        status="ok",
        summary="First pass.",
        confidence=0.7,
        existing_tag_suggestions=[{"tag_id": 1, "confidence": 0.8, "reason": "Fits."}],
        new_tag_suggestions=[{"name": "Night", "group": "scene", "confidence": 0.6}],
        playlist_suggestions=[{"playlist_id": 1, "confidence": 0.5}],
        error_message=None,
    )
    latest_owner = create_analysis_record(
        db_session,
        user=owner,
        track=owner_track,
        research=research,
        provider="openai-compatible",
        model="gpt-test",
        status="ok",
        summary="Latest pass.",
        confidence=0.9,
        existing_tag_suggestions=[],
        new_tag_suggestions=[],
        playlist_suggestions=[],
        error_message=None,
    )
    create_analysis_record(
        db_session,
        user=other,
        track=other_track,
        research=None,
        provider="openai-compatible",
        model="gpt-test",
        status="ok",
        summary="Hidden pass.",
        confidence=0.9,
        existing_tag_suggestions=[],
        new_tag_suggestions=[],
        playlist_suggestions=[],
        error_message=None,
    )

    saved_first = db_session.get(TrackAiAnalysis, first.id)
    latest = get_latest_analysis(db_session, user=owner, track=owner_track)

    assert saved_first is not None
    assert saved_first.research_id == research.id
    assert saved_first.existing_tag_suggestions_json[0]["tag_id"] == 1
    assert latest is not None
    assert latest.id == latest_owner.id
    assert latest.summary == "Latest pass."
