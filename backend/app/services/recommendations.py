import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.feedback_event import FeedbackEvent
from app.models.playback_event import PlaybackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.recommendation import (
    RecommendationExplanation,
    RecommendationExplanationPart,
    RecommendationExplanationTag,
    RecommendationRequest,
    RecommendationResult,
)
from app.services import playlists as playlist_service
from app.services.tracks import build_track_response


DEFAULT_RECOMMENDATION_LIMIT = 3
MAX_RECOMMENDATION_LIMIT = 3
TAG_MATCH_WEIGHTS = {
    "scenario": 3.0,
    "state": 2.0,
    "type": 2.0,
    "attribute": 1.0,
}
LIKED_BOOST = 1.0
ACTIVE_COOLDOWN_SOFT_PENALTY = 5.0
EXCLUDED_ATTRIBUTE_PENALTY = 4.0
RECENT_PLAYBACK_WINDOWS = (
    (timedelta(days=1), 4.0),
    (timedelta(days=7), 2.0),
    (timedelta(days=30), 1.0),
)
NOT_SUITABLE_CONTEXT_PENALTY = 4.0
RECENT_SKIP_RECOMMENDATION_PENALTY = 3.0
RECENT_SKIP_RECOMMENDATION_WINDOW = timedelta(days=7)
DISLIKE_FEEDBACK_PENALTY = 8.0
PLAYLIST_MEMBERSHIP_BOOST = 0.5
PLAYLIST_MEMBERSHIP_BOOST_CAP = 1.5
PLAYLIST_CONTEXT_BOOST = 1.5
PLAYLIST_CONTEXT_BOOST_CAP = 3.0
PLAYLIST_REASON_NAME_LIMIT = 3
TAG_REQUEST_FIELDS = {
    "scenario_tag_ids": "scenario",
    "state_tag_ids": "state",
    "type_tag_ids": "type",
    "attribute_tag_ids": "attribute",
    "exclude_attribute_tag_ids": "attribute",
}
TERM_STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "music",
    "of",
    "song",
    "songs",
    "the",
    "to",
}
TERM_PATTERN = re.compile(r"[\w]+", re.UNICODE)


@dataclass
class _ScoredTrack:
    track: Track
    score: float = 0.0
    matched: dict[str, list[RecommendationExplanationTag]] = field(default_factory=dict)
    penalties: list[RecommendationExplanationPart] = field(default_factory=list)
    boosts: list[RecommendationExplanationPart] = field(default_factory=list)
    feedback_impacts: list[RecommendationExplanationPart] = field(default_factory=list)
    avoidance_reasons: list[RecommendationExplanationPart] = field(default_factory=list)


@dataclass
class RecommendationContext:
    results: list[RecommendationResult]
    exclusions_considered: list[str] = field(default_factory=list)


def validate_recommendation_request_tags(
    db: Session,
    user: User,
    request: RecommendationRequest,
) -> str | None:
    for field_name, expected_group in TAG_REQUEST_FIELDS.items():
        tag_ids = _unique_ids(getattr(request, field_name))
        if not tag_ids:
            continue

        tags = list(
            db.scalars(
                select(Tag).where(
                    Tag.user_id == user.id,
                    Tag.id.in_(tag_ids),
                ),
            ),
        )
        if len(tags) != len(tag_ids):
            return "Recommendation tag not found for current user."
        if any(tag.group != expected_group for tag in tags):
            return f"Recommendation tag group must be {expected_group}."

    return None


def recommend_tracks(
    db: Session,
    user: User,
    request: RecommendationRequest,
    now: datetime | None = None,
) -> list[RecommendationResult]:
    return recommend_tracks_with_context(db, user, request, now=now).results


def recommend_tracks_with_context(
    db: Session,
    user: User,
    request: RecommendationRequest,
    now: datetime | None = None,
) -> RecommendationContext:
    ranking_time = _as_naive_utc(now or datetime.now(timezone.utc))
    limit = min(request.limit or DEFAULT_RECOMMENDATION_LIMIT, MAX_RECOMMENDATION_LIMIT)
    tracks = list(
        db.scalars(
            select(Track)
            .where(Track.user_id == user.id, Track.status == "ready")
            .order_by(Track.created_at, Track.id),
        ),
    )
    if not tracks:
        return RecommendationContext(results=[])

    track_ids = [track.id for track in tracks]
    tags_by_id = _load_user_tags(db, user)
    track_tags = _load_track_tags(db, track_ids, tags_by_id)
    latest_playback = _load_latest_playback_events(db, user, track_ids)
    feedback_events = _load_recent_feedback_events(db, user, track_ids, ranking_time)
    requested_tag_ids = _requested_tag_ids(request)
    playlist_signals = _load_playlist_signals_by_track(db, user, track_ids)
    playlist_match_terms = _playlist_match_terms(request, tags_by_id)

    scored_tracks: list[_ScoredTrack] = []
    exclusions_considered: list[str] = []
    for track in tracks:
        cooldown_until = _as_naive_utc(track.cooldown_until)
        if (
            request.cooldown_mode == "strict"
            and cooldown_until is not None
            and cooldown_until > ranking_time
        ):
            exclusions_considered.append(
                f"{track.title} excluded by active cooldown.",
            )
            continue

        feedback_for_track = feedback_events.get(track.id, [])
        if _has_not_today_feedback(feedback_for_track, ranking_time):
            exclusions_considered.append(
                f"{track.title} excluded by not_today feedback for today.",
            )
            continue

        scored = _ScoredTrack(track=track)
        _score_tag_matches(scored, request, track_tags.get(track.id, set()), tags_by_id)
        _score_liked(scored)
        _score_active_cooldown(scored, cooldown_until, ranking_time, request.cooldown_mode)
        _score_playlist_signals(
            scored,
            playlist_signals.get(track.id, []),
            playlist_match_terms,
        )
        _score_excluded_attributes(
            scored,
            request.exclude_attribute_tag_ids,
            track_tags.get(track.id, set()),
            tags_by_id,
        )
        _score_recent_playback(scored, latest_playback.get(track.id), ranking_time)
        _score_feedback_penalties(scored, feedback_for_track, requested_tag_ids, ranking_time)
        scored_tracks.append(scored)

    scored_tracks.sort(key=lambda item: (-item.score, item.track.created_at, item.track.id))
    return RecommendationContext(
        results=[
            RecommendationResult(
                rank=index + 1,
                score=round(scored.score, 2),
                reason=_build_reason(scored),
                explanation=_build_explanation(scored),
                track=build_track_response(db, scored.track),
            )
            for index, scored in enumerate(scored_tracks[:limit])
        ],
        exclusions_considered=exclusions_considered,
    )


def _load_user_tags(db: Session, user: User) -> dict[int, Tag]:
    return {
        tag.id: tag
        for tag in db.scalars(
            select(Tag).where(Tag.user_id == user.id).order_by(Tag.created_at, Tag.id),
        )
    }


def _load_track_tags(
    db: Session,
    track_ids: list[int],
    tags_by_id: dict[int, Tag],
) -> dict[int, set[int]]:
    track_tags: dict[int, set[int]] = {}
    for track_tag in db.scalars(select(TrackTag).where(TrackTag.track_id.in_(track_ids))):
        if track_tag.tag_id in tags_by_id:
            track_tags.setdefault(track_tag.track_id, set()).add(track_tag.tag_id)
    return track_tags


def _load_latest_playback_events(
    db: Session,
    user: User,
    track_ids: list[int],
) -> dict[int, PlaybackEvent]:
    latest: dict[int, PlaybackEvent] = {}
    events = db.scalars(
        select(PlaybackEvent)
        .where(
            PlaybackEvent.user_id == user.id,
            PlaybackEvent.track_id.in_(track_ids),
        )
        .order_by(PlaybackEvent.occurred_at.desc(), PlaybackEvent.id.desc()),
    )
    for event in events:
        latest.setdefault(event.track_id, event)
    return latest


def _load_recent_feedback_events(
    db: Session,
    user: User,
    track_ids: list[int],
    now: datetime,
) -> dict[int, list[FeedbackEvent]]:
    since = now - timedelta(days=30)
    events_by_track: dict[int, list[FeedbackEvent]] = {}
    events = db.scalars(
        select(FeedbackEvent)
        .where(
            FeedbackEvent.user_id == user.id,
            FeedbackEvent.track_id.in_(track_ids),
            FeedbackEvent.occurred_at >= since,
        )
        .order_by(FeedbackEvent.occurred_at.desc(), FeedbackEvent.id.desc()),
    )
    for event in events:
        events_by_track.setdefault(event.track_id, []).append(event)
    return events_by_track


def _load_playlist_signals_by_track(
    db: Session,
    user: User,
    track_ids: list[int],
) -> dict[int, list[playlist_service.PlaylistTrackSignal]]:
    track_id_set = set(track_ids)
    signals_by_track: dict[int, list[playlist_service.PlaylistTrackSignal]] = {}
    for signal in playlist_service.list_playlist_track_signals(db, user):
        if signal.track_id in track_id_set:
            signals_by_track.setdefault(signal.track_id, []).append(signal)
    return signals_by_track


def _score_tag_matches(
    scored: _ScoredTrack,
    request: RecommendationRequest,
    track_tag_ids: set[int],
    tags_by_id: dict[int, Tag],
) -> None:
    request_groups = {
        "scenario": request.scenario_tag_ids,
        "state": request.state_tag_ids,
        "type": request.type_tag_ids,
        "attribute": request.attribute_tag_ids,
    }
    for group, requested_ids in request_groups.items():
        matching_ids = [
            tag_id
            for tag_id in _unique_ids(requested_ids)
            if tag_id in track_tag_ids
            and tag_id in tags_by_id
            and tags_by_id[tag_id].group == group
        ]
        if not matching_ids:
            continue

        scored.score += TAG_MATCH_WEIGHTS[group] * len(matching_ids)
        scored.matched[group] = [
            RecommendationExplanationTag(
                id=tag_id,
                name=tags_by_id[tag_id].name,
                group=group,
            )
            for tag_id in matching_ids
        ]


def _score_liked(scored: _ScoredTrack) -> None:
    if scored.track.liked:
        scored.score += LIKED_BOOST
        scored.boosts.append(
            RecommendationExplanationPart(
                label="liked track boost",
                score_delta=LIKED_BOOST,
            ),
        )


def _score_active_cooldown(
    scored: _ScoredTrack,
    cooldown_until: datetime | None,
    now: datetime,
    cooldown_mode: str,
) -> None:
    if cooldown_mode != "soft":
        return
    if cooldown_until is None or cooldown_until <= now:
        return

    scored.score -= ACTIVE_COOLDOWN_SOFT_PENALTY
    part = RecommendationExplanationPart(
        label="active cooldown soft penalty",
        score_delta=-ACTIVE_COOLDOWN_SOFT_PENALTY,
    )
    scored.penalties.append(part)
    scored.feedback_impacts.append(part)
    scored.avoidance_reasons.append(
        RecommendationExplanationPart(
            label="active cooldown retained by soft mode",
            score_delta=-ACTIVE_COOLDOWN_SOFT_PENALTY,
        ),
    )


def _score_playlist_signals(
    scored: _ScoredTrack,
    signals: list[playlist_service.PlaylistTrackSignal],
    match_terms: set[str],
) -> None:
    if not signals:
        return

    membership_delta = min(
        PLAYLIST_MEMBERSHIP_BOOST * len(signals),
        PLAYLIST_MEMBERSHIP_BOOST_CAP,
    )
    scored.score += membership_delta
    scored.boosts.append(
        RecommendationExplanationPart(
            label=f"playlist membership boost: {_format_playlist_names(signals)}",
            score_delta=membership_delta,
        ),
    )

    matching_signals = [
        signal for signal in signals if _playlist_signal_matches(signal, match_terms)
    ]
    if not matching_signals:
        return

    context_delta = min(
        PLAYLIST_CONTEXT_BOOST * len(matching_signals),
        PLAYLIST_CONTEXT_BOOST_CAP,
    )
    scored.score += context_delta
    scored.boosts.append(
        RecommendationExplanationPart(
            label=f"playlist context boost: {_format_playlist_names(matching_signals)}",
            score_delta=context_delta,
        ),
    )


def _score_excluded_attributes(
    scored: _ScoredTrack,
    excluded_attribute_tag_ids: list[int],
    track_tag_ids: set[int],
    tags_by_id: dict[int, Tag],
) -> None:
    matching_ids = [
        tag_id
        for tag_id in _unique_ids(excluded_attribute_tag_ids)
        if tag_id in track_tag_ids
        and tag_id in tags_by_id
        and tags_by_id[tag_id].group == "attribute"
    ]
    if not matching_ids:
        return

    scored.score -= EXCLUDED_ATTRIBUTE_PENALTY * len(matching_ids)
    tag_names = ", ".join(tags_by_id[tag_id].name for tag_id in matching_ids)
    scored.penalties.append(
        RecommendationExplanationPart(
            label=f"excluded attribute penalty: {tag_names}",
            score_delta=-(EXCLUDED_ATTRIBUTE_PENALTY * len(matching_ids)),
        ),
    )
    scored.avoidance_reasons.append(
        RecommendationExplanationPart(
            label=f"matched excluded attributes: {tag_names}",
            score_delta=-(EXCLUDED_ATTRIBUTE_PENALTY * len(matching_ids)),
        ),
    )


def _score_recent_playback(
    scored: _ScoredTrack,
    playback_event: PlaybackEvent | None,
    now: datetime,
) -> None:
    if playback_event is None:
        return

    occurred_at = _as_naive_utc(playback_event.occurred_at)
    if occurred_at is None:
        return

    age = now - occurred_at
    for window, penalty in RECENT_PLAYBACK_WINDOWS:
        if timedelta(0) <= age <= window:
            scored.score -= penalty
            scored.penalties.append(
                RecommendationExplanationPart(
                    label="recently played penalty",
                    score_delta=-penalty,
                ),
            )
            return


def _score_feedback_penalties(
    scored: _ScoredTrack,
    feedback_events: list[FeedbackEvent],
    requested_tag_ids: set[int],
    now: datetime,
) -> None:
    applied_not_suitable = False
    applied_skip = False
    applied_dislike = False

    for event in feedback_events:
        occurred_at = _as_naive_utc(event.occurred_at)
        if occurred_at is None:
            continue

        if not applied_dislike and event.feedback_type == "dislike":
            scored.score -= DISLIKE_FEEDBACK_PENALTY
            part = RecommendationExplanationPart(
                label="dislike feedback penalty",
                score_delta=-DISLIKE_FEEDBACK_PENALTY,
            )
            scored.penalties.append(part)
            scored.feedback_impacts.append(part)
            scored.avoidance_reasons.append(part)
            applied_dislike = True

        if (
            not applied_not_suitable
            and event.feedback_type == "not_suitable_for_context"
            and _feedback_context_ids(event) & requested_tag_ids
        ):
            scored.score -= NOT_SUITABLE_CONTEXT_PENALTY
            part = RecommendationExplanationPart(
                label="not suitable for this context penalty",
                score_delta=-NOT_SUITABLE_CONTEXT_PENALTY,
            )
            scored.penalties.append(part)
            scored.feedback_impacts.append(part)
            applied_not_suitable = True

        if (
            not applied_skip
            and event.feedback_type == "skip_recommendation"
            and timedelta(0) <= now - occurred_at <= RECENT_SKIP_RECOMMENDATION_WINDOW
        ):
            scored.score -= RECENT_SKIP_RECOMMENDATION_PENALTY
            part = RecommendationExplanationPart(
                label="recent recommendation skip penalty",
                score_delta=-RECENT_SKIP_RECOMMENDATION_PENALTY,
            )
            scored.penalties.append(part)
            scored.feedback_impacts.append(part)
            applied_skip = True


def _has_not_today_feedback(feedback_events: list[FeedbackEvent], now: datetime) -> bool:
    return any(
        event.feedback_type == "not_today"
        and _as_naive_utc(event.occurred_at) is not None
        and _as_naive_utc(event.occurred_at).date() == now.date()
        for event in feedback_events
    )


def _requested_tag_ids(request: RecommendationRequest) -> set[int]:
    tag_ids: set[int] = set()
    for ids in (
        request.scenario_tag_ids,
        request.state_tag_ids,
        request.type_tag_ids,
        request.attribute_tag_ids,
    ):
        tag_ids.update(_unique_ids(ids))
    return tag_ids


def _playlist_match_terms(
    request: RecommendationRequest,
    tags_by_id: dict[int, Tag],
) -> set[str]:
    terms: set[str] = set()
    if request.raw_text:
        terms.update(_extract_terms(request.raw_text))

    for tag_id in _requested_tag_ids(request):
        tag = tags_by_id.get(tag_id)
        if tag is None:
            continue
        terms.update(_extract_terms(tag.name))

    return terms


def _playlist_signal_matches(
    signal: playlist_service.PlaylistTrackSignal,
    match_terms: set[str],
) -> bool:
    if not match_terms:
        return False

    playlist_text = " ".join(
        part
        for part in (signal.playlist_name, signal.playlist_description or "")
        if part
    )
    playlist_terms = _extract_terms(playlist_text)
    if playlist_terms & match_terms:
        return True

    normalized_text = playlist_text.casefold()
    return any(" " in term and term in normalized_text for term in match_terms)


def _extract_terms(value: str) -> set[str]:
    normalized = value.casefold()
    terms = {
        token
        for token in TERM_PATTERN.findall(normalized)
        if len(token) >= 2 and token not in TERM_STOPWORDS
    }
    stripped = normalized.strip()
    if " " in stripped and len(stripped) >= 2:
        terms.add(stripped)
    return terms


def _format_playlist_names(
    signals: list[playlist_service.PlaylistTrackSignal],
) -> str:
    names = list(dict.fromkeys(signal.playlist_name for signal in signals))
    displayed = names[:PLAYLIST_REASON_NAME_LIMIT]
    suffix = (
        f", +{len(names) - PLAYLIST_REASON_NAME_LIMIT} more"
        if len(names) > PLAYLIST_REASON_NAME_LIMIT
        else ""
    )
    return ", ".join(displayed) + suffix


def _feedback_context_ids(event: FeedbackEvent) -> set[int]:
    tag_ids: set[int] = set()
    for ids in (
        event.scenario_tag_ids,
        event.state_tag_ids,
        event.type_tag_ids,
        event.attribute_tag_ids,
    ):
        tag_ids.update(_unique_ids(ids))
    return tag_ids


def _build_reason(scored: _ScoredTrack) -> str:
    parts: list[str] = []
    for group in ("scenario", "state", "type", "attribute"):
        tags = scored.matched.get(group)
        if tags:
            parts.append(f"matched {group} tags: {', '.join(tag.name for tag in tags)}")

    parts.extend(part.label for part in scored.boosts)
    parts.extend(part.label for part in scored.penalties)
    if not parts:
        parts.append("no requested tag matches")

    return "; ".join(parts) + "."


def _build_explanation(scored: _ScoredTrack) -> RecommendationExplanation:
    return RecommendationExplanation(
        matched_tags=scored.matched,
        boosts=scored.boosts,
        penalties=scored.penalties,
        feedback_impacts=scored.feedback_impacts,
        avoidance_reasons=scored.avoidance_reasons,
    )


def _unique_ids(tag_ids: list[int] | None) -> list[int]:
    if not tag_ids:
        return []
    return list(dict.fromkeys(tag_ids))


def _as_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
