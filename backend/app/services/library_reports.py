from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.playback_event import PlaybackEvent
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.duplicate import DuplicateCandidateGroupResponse, DuplicateCandidateTrack
from app.schemas.library_report import (
    LibraryOrganizationReport,
    LibraryReportTrack,
    LibraryReportTrackIssue,
)
from app.services import duplicates as duplicate_service


RARELY_PLAYED_THRESHOLD_DAYS = 30


def build_library_organization_report(
    db: Session,
    user: User,
    *,
    now: datetime | None = None,
) -> LibraryOrganizationReport:
    generated_at = now or datetime.now(UTC)
    tracks = _load_user_tracks(db, user)
    playback_stats = _load_playback_stats(db, user)
    duplicate_groups = _build_duplicate_group_responses(db, user)

    ready_tracks = [track for track in tracks if track.status == "ready"]
    untagged_track_ids = _load_untagged_ready_track_ids(db, user)
    rarely_played_cutoff = generated_at - timedelta(days=RARELY_PLAYED_THRESHOLD_DAYS)

    return LibraryOrganizationReport(
        generated_at=generated_at,
        untagged_ready_tracks=[
            _build_track_summary(track, playback_stats)
            for track in ready_tracks
            if track.id in untagged_track_ids
        ],
        missing_metadata_tracks=[
            LibraryReportTrackIssue(
                track=_build_track_summary(track, playback_stats),
                reasons=_missing_metadata_reasons(track),
            )
            for track in ready_tracks
            if _missing_metadata_reasons(track)
        ],
        processing_tracks=[
            LibraryReportTrackIssue(
                track=_build_track_summary(track, playback_stats),
                reasons=[_processing_reason(track)],
            )
            for track in tracks
            if track.status in {"processing", "uploaded", "uploading", "failed"}
        ],
        duplicate_groups=duplicate_groups,
        never_played_ready_tracks=[
            _build_track_summary(track, playback_stats)
            for track in ready_tracks
            if track.id not in playback_stats
        ],
        rarely_played_ready_tracks=[
            _build_track_summary(track, playback_stats)
            for track in ready_tracks
            if _is_rarely_played(track, playback_stats, rarely_played_cutoff)
        ],
        stale_cooldown_tracks=[
            LibraryReportTrackIssue(
                track=_build_track_summary(track, playback_stats),
                reasons=["Cooldown has already expired."],
            )
            for track in ready_tracks
            if track.cooldown_until is not None
            and _as_utc(track.cooldown_until) < _as_utc(generated_at)
        ],
    )


def _load_user_tracks(db: Session, user: User) -> list[Track]:
    return list(
        db.scalars(
            select(Track)
            .where(Track.user_id == user.id)
            .order_by(Track.created_at, Track.id),
        ),
    )


def _load_untagged_ready_track_ids(db: Session, user: User) -> set[int]:
    rows = db.execute(
        select(Track.id)
        .outerjoin(TrackTag, TrackTag.track_id == Track.id)
        .where(Track.user_id == user.id, Track.status == "ready")
        .group_by(Track.id)
        .having(func.count(TrackTag.tag_id) == 0),
    )
    return {row[0] for row in rows}


def _load_playback_stats(db: Session, user: User) -> dict[int, tuple[datetime | None, int]]:
    rows = db.execute(
        select(
            PlaybackEvent.track_id,
            func.max(PlaybackEvent.occurred_at),
            func.count(PlaybackEvent.id),
        )
        .where(PlaybackEvent.user_id == user.id)
        .group_by(PlaybackEvent.track_id),
    )
    return {
        track_id: (last_played_at, playback_count)
        for track_id, last_played_at, playback_count in rows
    }


def _build_track_summary(
    track: Track,
    playback_stats: dict[int, tuple[datetime | None, int]],
) -> LibraryReportTrack:
    last_played_at, playback_count = playback_stats.get(track.id, (None, 0))
    return LibraryReportTrack(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        content_type=track.content_type,
        status=track.status,
        updated_at=track.updated_at,
        last_played_at=last_played_at,
        playback_count=playback_count,
    )


def _missing_metadata_reasons(track: Track) -> list[str]:
    reasons: list[str] = []
    if not track.title.strip():
        reasons.append("Missing title.")
    if not track.artist:
        reasons.append("Missing artist.")
    if not track.album:
        reasons.append("Missing album.")
    if track.duration_seconds is None:
        reasons.append("Missing duration.")
    if not track.cover_path:
        reasons.append("Missing cover.")
    return reasons


def _processing_reason(track: Track) -> str:
    if track.status == "failed":
        return "Processing failed."
    if track.status == "processing":
        return "Backend processing is still running."
    return f"Track status is {track.status}."


def _is_rarely_played(
    track: Track,
    playback_stats: dict[int, tuple[datetime | None, int]],
    cutoff: datetime,
) -> bool:
    stats = playback_stats.get(track.id)
    if stats is None:
        return False

    last_played_at, _playback_count = stats
    return last_played_at is not None and _as_utc(last_played_at) < _as_utc(cutoff)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)

    return value.astimezone(UTC)


def _build_duplicate_group_responses(
    db: Session,
    user: User,
) -> list[DuplicateCandidateGroupResponse]:
    groups = duplicate_service.find_duplicate_candidates(db, user)
    track_ids = sorted({track_id for group in groups for track_id in group.candidate_track_ids})
    tracks_by_id = _load_tracks_by_id(db, user, track_ids)

    return [
        DuplicateCandidateGroupResponse(
            group_id=group.group_id,
            match_type=group.match_type,
            confidence=group.confidence,
            reason=group.reason,
            candidate_track_ids=group.candidate_track_ids,
            candidates=[
                _build_duplicate_candidate(tracks_by_id[track_id])
                for track_id in group.candidate_track_ids
                if track_id in tracks_by_id
            ],
        )
        for group in groups
    ]


def _load_tracks_by_id(db: Session, user: User, track_ids: list[int]) -> dict[int, Track]:
    if not track_ids:
        return {}

    tracks = db.scalars(
        select(Track).where(Track.user_id == user.id, Track.id.in_(track_ids)),
    )
    return {track.id: track for track in tracks}


def _build_duplicate_candidate(track: Track) -> DuplicateCandidateTrack:
    return DuplicateCandidateTrack(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        content_type=track.content_type,
        status=track.status,
    )
