from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.revived import RevivedTrackCandidate, RevivedTracksResponse
from app.services.tracks import build_track_response


LONG_UNPLAYED_THRESHOLD_DAYS = 30
NEGATIVE_FEEDBACK_SUPPRESSION_DAYS = 30
MAX_REVIVED_CANDIDATES = 12

STRONG_NEGATIVE_FEEDBACK_TYPES = {
    "dislike",
    "tired",
    "not_suitable_for_context",
    "skip_recommendation",
}


def find_recently_revived_tracks(
    db: Session,
    user: User,
    *,
    now: datetime | None = None,
    limit: int = MAX_REVIVED_CANDIDATES,
) -> RevivedTracksResponse:
    generated_at = _as_utc(now or datetime.now(UTC))
    ready_tracks = _load_ready_tracks(db, user)
    if not ready_tracks:
        return RevivedTracksResponse(
            generated_at=generated_at,
            long_unplayed_threshold_days=LONG_UNPLAYED_THRESHOLD_DAYS,
            candidates=[],
        )

    track_ids = [track.id for track in ready_tracks]
    playback_stats = _load_playback_stats(db, user, track_ids)
    recent_feedback = _load_recent_feedback_events(db, user, track_ids, generated_at)
    tags_by_track_id = _load_track_tag_names(db, user, track_ids)

    cutoff = generated_at - timedelta(days=LONG_UNPLAYED_THRESHOLD_DAYS)
    candidates: list[RevivedTrackCandidate] = []

    for track in ready_tracks:
        if _is_suppressed(track, recent_feedback.get(track.id, []), generated_at):
            continue

        last_played_at, playback_count = playback_stats.get(track.id, (None, 0))
        last_played_utc = _as_utc(last_played_at) if last_played_at is not None else None
        days_since_last_played = (
            max(0, (generated_at - last_played_utc).days)
            if last_played_utc is not None
            else None
        )

        if last_played_utc is not None and last_played_utc >= cutoff:
            continue

        reason = _build_reason(
            last_played_at=last_played_utc,
            days_since_last_played=days_since_last_played,
            tag_names=tags_by_track_id.get(track.id, []),
        )
        candidates.append(
            RevivedTrackCandidate(
                track=build_track_response(db, track),
                last_played_at=last_played_utc,
                playback_count=playback_count,
                days_since_last_played=days_since_last_played,
                reason=reason,
                tag_summary=tags_by_track_id.get(track.id, []),
            ),
        )

    candidates.sort(
        key=lambda candidate: (
            candidate.last_played_at is None,
            -(candidate.days_since_last_played or 0),
            candidate.track.created_at,
            candidate.track.id,
        ),
    )

    return RevivedTracksResponse(
        generated_at=generated_at,
        long_unplayed_threshold_days=LONG_UNPLAYED_THRESHOLD_DAYS,
        candidates=candidates[:limit],
    )


def _load_ready_tracks(db: Session, user: User) -> list[Track]:
    return list(
        db.scalars(
            select(Track)
            .where(Track.user_id == user.id, Track.status == "ready")
            .order_by(Track.created_at, Track.id),
        ),
    )


def _load_playback_stats(
    db: Session,
    user: User,
    track_ids: list[int],
) -> dict[int, tuple[datetime | None, int]]:
    rows = db.execute(
        select(
            PlaybackEvent.track_id,
            func.max(PlaybackEvent.occurred_at),
            func.count(PlaybackEvent.id),
        )
        .where(
            PlaybackEvent.user_id == user.id,
            PlaybackEvent.track_id.in_(track_ids),
        )
        .group_by(PlaybackEvent.track_id),
    )
    return {
        track_id: (last_played_at, playback_count)
        for track_id, last_played_at, playback_count in rows
    }


def _load_recent_feedback_events(
    db: Session,
    user: User,
    track_ids: list[int],
    now: datetime,
) -> dict[int, list[FeedbackEvent]]:
    since = now - timedelta(days=NEGATIVE_FEEDBACK_SUPPRESSION_DAYS)
    rows = db.scalars(
        select(FeedbackEvent)
        .where(
            FeedbackEvent.user_id == user.id,
            FeedbackEvent.track_id.in_(track_ids),
            FeedbackEvent.occurred_at >= since,
        )
        .order_by(FeedbackEvent.occurred_at.desc(), FeedbackEvent.id.desc()),
    )

    events_by_track: dict[int, list[FeedbackEvent]] = {}
    for event in rows:
        events_by_track.setdefault(event.track_id, []).append(event)
    return events_by_track


def _load_track_tag_names(
    db: Session,
    user: User,
    track_ids: list[int],
) -> dict[int, list[str]]:
    rows = db.execute(
        select(TrackTag.track_id, Tag.name)
        .join(Tag, Tag.id == TrackTag.tag_id)
        .where(
            Tag.user_id == user.id,
            TrackTag.track_id.in_(track_ids),
        )
        .order_by(Tag.group, Tag.name, Tag.id),
    )

    tags_by_track_id: dict[int, list[str]] = {}
    for track_id, tag_name in rows:
        tags_by_track_id.setdefault(track_id, []).append(tag_name)
    return tags_by_track_id


def _is_suppressed(
    track: Track,
    feedback_events: list[FeedbackEvent],
    now: datetime,
) -> bool:
    cooldown_until = _as_utc(track.cooldown_until)
    if cooldown_until is not None and cooldown_until > now:
        return True

    for event in feedback_events:
        occurred_at = _as_utc(event.occurred_at)
        if event.feedback_type == "not_today" and occurred_at.date() == now.date():
            return True

        if event.feedback_type in STRONG_NEGATIVE_FEEDBACK_TYPES:
            return True

    return False


def _build_reason(
    *,
    last_played_at: datetime | None,
    days_since_last_played: int | None,
    tag_names: list[str],
) -> str:
    tags = ", ".join(tag_names[:3])
    tag_suffix = f" Tagged {tags}." if tags else ""

    if last_played_at is None:
        return f"Never played, so it is included after long-unplayed tracks.{tag_suffix}"

    days = days_since_last_played or 0
    return f"Last played {days} days ago, past the revived threshold.{tag_suffix}"


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
