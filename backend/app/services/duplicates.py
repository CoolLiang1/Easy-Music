from collections import defaultdict
from collections.abc import Iterable
import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.track import Track
from app.models.user import User
from app.schemas.duplicate import DuplicateCandidateGroup
from app.services.duplicate_signals import normalize_metadata_text


METADATA_DURATION_THRESHOLD_SECONDS = 2
READY_STATUS = "ready"


def find_duplicate_candidates(db: Session, user: User) -> list[DuplicateCandidateGroup]:
    tracks = _load_ready_tracks(db, user)
    groups: list[DuplicateCandidateGroup] = []
    exact_candidate_sets: set[frozenset[int]] = set()

    for group in _build_exact_hash_groups(
        tracks,
        signal_name="original_file_sha256",
        source_label="original file SHA-256",
        group_source="original",
    ):
        exact_candidate_sets.add(frozenset(group.candidate_track_ids))
        groups.append(group)

    for group in _build_exact_hash_groups(
        tracks,
        signal_name="playback_file_sha256",
        source_label="playback file SHA-256",
        group_source="playback",
    ):
        candidate_set = frozenset(group.candidate_track_ids)
        if candidate_set in exact_candidate_sets:
            continue
        exact_candidate_sets.add(candidate_set)
        groups.append(group)

    for group in _build_metadata_duration_groups(tracks):
        if frozenset(group.candidate_track_ids) in exact_candidate_sets:
            continue
        groups.append(group)

    return sorted(groups, key=lambda group: (group.match_type, group.group_id))


def _load_ready_tracks(db: Session, user: User) -> list[Track]:
    return list(
        db.scalars(
            select(Track)
            .where(Track.user_id == user.id, Track.status == READY_STATUS)
            .order_by(Track.created_at, Track.id),
        ),
    )


def _build_exact_hash_groups(
    tracks: Iterable[Track],
    *,
    signal_name: str,
    source_label: str,
    group_source: str,
) -> list[DuplicateCandidateGroup]:
    tracks_by_hash: dict[str, list[Track]] = defaultdict(list)
    for track in tracks:
        signal = getattr(track, signal_name)
        if signal:
            tracks_by_hash[signal].append(track)

    groups: list[DuplicateCandidateGroup] = []
    for signal, matching_tracks in tracks_by_hash.items():
        if len(matching_tracks) < 2:
            continue

        track_ids = _sorted_track_ids(matching_tracks)
        groups.append(
            DuplicateCandidateGroup(
                group_id=f"exact_file:{group_source}:{signal}",
                match_type="exact_file",
                confidence=1.0,
                reason=f"Tracks share the same {source_label}.",
                candidate_track_ids=track_ids,
            ),
        )

    return groups


def _build_metadata_duration_groups(tracks: Iterable[Track]) -> list[DuplicateCandidateGroup]:
    candidates_by_metadata: dict[tuple[str, str], list[Track]] = defaultdict(list)
    for track in tracks:
        title = normalize_metadata_text(track.title)
        artist = normalize_metadata_text(track.artist)
        if not title or not artist or track.duration_seconds is None:
            continue

        candidates_by_metadata[(title, artist)].append(track)

    groups: list[DuplicateCandidateGroup] = []
    for (title, artist), matching_tracks in candidates_by_metadata.items():
        if len(matching_tracks) < 2:
            continue

        for component in _duration_windows(matching_tracks):
            if len(component) < 2:
                continue

            track_ids = _sorted_track_ids(component)
            min_duration = min(track.duration_seconds or 0 for track in component)
            max_duration = max(track.duration_seconds or 0 for track in component)
            stable_key = _stable_group_hash(
                "metadata_duration",
                title,
                artist,
                str(min_duration),
                str(max_duration),
                ",".join(str(track_id) for track_id in track_ids),
            )
            groups.append(
                DuplicateCandidateGroup(
                    group_id=f"metadata_duration:{stable_key}",
                    match_type="metadata_duration",
                    confidence=0.8,
                    reason=(
                        "Tracks have matching normalized title and artist with "
                        f"duration within {METADATA_DURATION_THRESHOLD_SECONDS} seconds."
                    ),
                    candidate_track_ids=track_ids,
                ),
            )

    return groups


def _duration_windows(tracks: list[Track]) -> list[list[Track]]:
    sorted_tracks = sorted(tracks, key=lambda track: (track.duration_seconds or 0, track.id))
    windows: list[list[Track]] = []
    index = 0

    while index < len(sorted_tracks):
        start_track = sorted_tracks[index]
        if start_track.duration_seconds is None:
            index += 1
            continue

        window = [start_track]
        next_index = index + 1
        while next_index < len(sorted_tracks):
            candidate = sorted_tracks[next_index]
            if candidate.duration_seconds is None:
                next_index += 1
                continue

            duration_delta = candidate.duration_seconds - start_track.duration_seconds
            if duration_delta > METADATA_DURATION_THRESHOLD_SECONDS:
                break

            window.append(candidate)
            next_index += 1

        if len(window) >= 2:
            windows.append(window)
            index = next_index
        else:
            index += 1

    return windows


def _sorted_track_ids(tracks: Iterable[Track]) -> list[int]:
    return sorted(track.id for track in tracks)


def _stable_group_hash(*parts: str) -> str:
    payload = "\0".join(parts).encode()
    return hashlib.sha256(payload).hexdigest()[:16]
