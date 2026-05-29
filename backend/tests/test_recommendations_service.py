from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.db.base import Base
from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.recommendation import RecommendationRequest
from app.services.recommendations import recommend_tracks


NOW = datetime(2026, 5, 29, 8, 30, tzinfo=timezone.utc)


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


def create_track(
    db_session: Session,
    user: User,
    title: str,
    *,
    status: str = "ready",
    liked: bool = False,
    cooldown_until: datetime | None = None,
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist="Artist",
        album="Album",
        duration_seconds=180,
        content_type="song",
        original_file_path="originals/track.mp3",
        playback_file_path="playback/track.mp3",
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        status=status,
        liked=liked,
        cooldown_until=cooldown_until,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def create_tag(db_session: Session, user: User, group: str, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def assign_tags(db_session: Session, track: Track, *tags: Tag) -> None:
    for tag in tags:
        db_session.add(TrackTag(track_id=track.id, tag_id=tag.id))
    db_session.commit()


def add_playback_event(
    db_session: Session,
    user: User,
    track: Track,
    occurred_at: datetime,
) -> None:
    db_session.add(
        PlaybackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id=f"play-{track.id}-{occurred_at.isoformat()}",
            event_type="play",
            position_seconds=0,
            duration_seconds=180,
            occurred_at=occurred_at,
            client="android",
        ),
    )
    db_session.commit()


def add_feedback_event(
    db_session: Session,
    user: User,
    track: Track,
    feedback_type: str,
    occurred_at: datetime,
    *,
    scenario_tag_ids: list[int] | None = None,
    state_tag_ids: list[int] | None = None,
    type_tag_ids: list[int] | None = None,
    attribute_tag_ids: list[int] | None = None,
) -> None:
    db_session.add(
        FeedbackEvent(
            user_id=user.id,
            track_id=track.id,
            client_event_id=f"feedback-{track.id}-{feedback_type}-{occurred_at.isoformat()}",
            feedback_type=feedback_type,
            scenario_tag_ids=scenario_tag_ids,
            state_tag_ids=state_tag_ids,
            type_tag_ids=type_tag_ids,
            attribute_tag_ids=attribute_tag_ids,
            occurred_at=occurred_at,
            client="android",
        ),
    )
    db_session.commit()


def test_ranking_uses_ready_tracks_for_authenticated_user(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    other_user = create_user(db_session, username="other")
    focus = create_tag(db_session, user, "scenario", "Focus")
    visible = create_track(db_session, user, "Visible")
    processing = create_track(db_session, user, "Processing", status="processing")
    hidden = create_track(db_session, other_user, "Hidden")
    assign_tags(db_session, visible, focus)
    assign_tags(db_session, processing, focus)

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id]),
        now=NOW,
    )

    assert [result.track.title for result in results] == ["Visible"]
    assert hidden.title not in [result.track.title for result in results]


def test_tag_matches_rank_above_liked_but_contextless_track(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    scenario = create_tag(db_session, user, "scenario", "Focus")
    kind = create_tag(db_session, user, "type", "Instrumental")
    matching = create_track(db_session, user, "Context Match")
    liked_only = create_track(db_session, user, "Liked Only", liked=True)
    assign_tags(db_session, matching, scenario, kind)

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[scenario.id], type_tag_ids=[kind.id]),
        now=NOW,
    )

    assert [result.track.title for result in results[:2]] == ["Context Match", "Liked Only"]
    assert results[0].score > results[1].score
    assert "matched scenario tags: Focus" in results[0].reason
    assert "matched type tags: Instrumental" in results[0].reason
    assert "liked track boost" in results[1].reason


def test_excluded_attribute_penalty_changes_order(db_session: Session) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    noisy = create_tag(db_session, user, "attribute", "Noisy")
    clean_track = create_track(db_session, user, "Clean")
    noisy_track = create_track(db_session, user, "Noisy")
    assign_tags(db_session, clean_track, focus)
    assign_tags(db_session, noisy_track, focus, noisy)

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(
            scenario_tag_ids=[focus.id],
            exclude_attribute_tag_ids=[noisy.id],
        ),
        now=NOW,
    )

    assert [result.track.title for result in results[:2]] == ["Clean", "Noisy"]
    assert "excluded attribute penalty: Noisy" in results[1].reason


def test_future_cooldown_and_same_day_not_today_are_excluded(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    available = create_track(db_session, user, "Available")
    cooled_down = create_track(
        db_session,
        user,
        "Cooldown",
        cooldown_until=NOW + timedelta(days=1),
    )
    not_today = create_track(db_session, user, "Not Today")
    assign_tags(db_session, available, focus)
    assign_tags(db_session, cooled_down, focus)
    assign_tags(db_session, not_today, focus)
    add_feedback_event(db_session, user, not_today, "not_today", NOW)

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id]),
        now=NOW,
    )

    assert [result.track.title for result in results] == ["Available"]


def test_recent_playback_penalty_is_applied(db_session: Session) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    fresh = create_track(db_session, user, "Fresh")
    recent = create_track(db_session, user, "Recent")
    assign_tags(db_session, fresh, focus)
    assign_tags(db_session, recent, focus)
    add_playback_event(db_session, user, recent, NOW - timedelta(hours=2))

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id]),
        now=NOW,
    )

    assert [result.track.title for result in results[:2]] == ["Fresh", "Recent"]
    assert "recently played penalty" in results[1].reason


def test_not_suitable_context_overlap_penalizes_track(db_session: Session) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    candidate = create_track(db_session, user, "Candidate")
    penalized = create_track(db_session, user, "Penalized")
    assign_tags(db_session, candidate, focus)
    assign_tags(db_session, penalized, focus)
    add_feedback_event(
        db_session,
        user,
        penalized,
        "not_suitable_for_context",
        NOW - timedelta(days=2),
        scenario_tag_ids=[focus.id],
    )

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id]),
        now=NOW,
    )

    assert [result.track.title for result in results[:2]] == ["Candidate", "Penalized"]
    assert "not suitable for this context penalty" in results[1].reason


def test_recent_skip_recommendation_penalty_is_applied(db_session: Session) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    candidate = create_track(db_session, user, "Candidate")
    skipped = create_track(db_session, user, "Skipped")
    assign_tags(db_session, candidate, focus)
    assign_tags(db_session, skipped, focus)
    add_feedback_event(
        db_session,
        user,
        skipped,
        "skip_recommendation",
        NOW - timedelta(days=1),
    )

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id]),
        now=NOW,
    )

    assert [result.track.title for result in results[:2]] == ["Candidate", "Skipped"]
    assert "recent recommendation skip penalty" in results[1].reason


def test_returns_at_most_three_without_placeholders(db_session: Session) -> None:
    user = create_user(db_session)
    focus = create_tag(db_session, user, "scenario", "Focus")
    for index in range(5):
        track = create_track(db_session, user, f"Track {index}")
        assign_tags(db_session, track, focus)

    results = recommend_tracks(
        db_session,
        user,
        RecommendationRequest(scenario_tag_ids=[focus.id], limit=10),
        now=NOW,
    )

    assert len(results) == 3
    assert [result.rank for result in results] == [1, 2, 3]


def test_returns_available_results_when_fewer_than_three_ready_tracks(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Only Ready")

    results = recommend_tracks(db_session, user, RecommendationRequest(), now=NOW)

    assert len(results) == 1
    assert results[0].track.title == "Only Ready"
    assert results[0].reason == "no requested tag matches."
