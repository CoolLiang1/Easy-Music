"""Batch AI auto-tagging.

Assigns existing catalogue tags to ready tracks without asking the owner to
confirm each suggestion. Safety rules:

* The AI only picks tag ids from the owner's own catalogue; it never creates
  tags, never selects tracks for playback, and never sees other users' data.
* Applied rows are stored with ``source="ai"`` and the AI confidence, so the
  recommendation service can weight them below owner-chosen tags.
* Owner tags (any other source) are never modified or removed.
* Each processed track records ``ai_tags_version``. A tag the owner removes
  afterwards therefore stays removed, because the track is not processed
  again until the version is bumped or a re-run is requested explicitly.
* A provider or parse failure changes nothing, so the batch can be retried.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import AI_TAG_SOURCE, TrackTag
from app.schemas.ai import AiAutoTagBatchOutput, AiProviderStatus
from app.services.ai_json import complete_and_parse_json
from app.services.ai_provider import AiProviderService
from app.services.ai_tag_suggestions import TAXONOMY_GUIDE_LINES

logger = logging.getLogger(__name__)

# Bump when the prompt or the apply rule changes enough that existing AI tags
# should be regenerated; the worker and the backfill command pick up tracks
# whose version is older.
AI_AUTO_TAGGING_VERSION = 1
DEFAULT_BATCH_SIZE = 10
# Smaller batches for the Web button so each request returns in reasonable time
# and progress updates often.
WEB_BATCH_SIZE = 5
MAX_AI_TAGS_PER_TRACK = 8
# The JSON for a 10-track batch is well under 1k tokens, but reasoning models
# count their hidden reasoning against max_tokens; use the request maximum.
AUTO_TAG_MAX_TOKENS = 8192
_TRUNCATED_ERROR_TYPE = "output_truncated"

_VALID_GROUPS = ("scene", "type", "feature")

_SYSTEM_INSTRUCTION = (
    "You tag tracks in a single owner's personal music library. Return strict "
    "JSON only. Use tag ids only from the supplied catalogue; never invent "
    "tag ids or track ids. Do not create new tags, do not choose tracks for "
    "playback, and do not use lyrics."
)


@dataclass
class AppliedTag:
    tag_id: int
    name: str
    group: str
    confidence: float


@dataclass
class AutoTagBatchResult:
    """Outcome of one provider call (or of a skipped call)."""

    provider_status: AiProviderStatus
    tagged_track_ids: list[int] = field(default_factory=list)
    applied: dict[int, list[AppliedTag]] = field(default_factory=dict)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.provider_status == AiProviderStatus.OK and self.error is None

    @property
    def applied_tag_count(self) -> int:
        return sum(len(tags) for tags in self.applied.values())


def list_tracks_needing_auto_tagging(
    db: Session,
    *,
    include_current: bool = False,
    limit: int | None = None,
    user_id: int | None = None,
) -> list[int]:
    """Return ids of ready tracks that have not been auto-tagged with the
    current rule version (or every ready track when *include_current*),
    optionally only those owned by *user_id*."""
    statement = select(Track.id).where(Track.status == "ready")
    if user_id is not None:
        statement = statement.where(Track.user_id == user_id)
    if not include_current:
        statement = statement.where(_needs_auto_tagging())
    statement = statement.order_by(Track.id)
    if limit is not None:
        statement = statement.limit(limit)
    return list(db.scalars(statement))


def count_tracks_needing_auto_tagging(db: Session, *, user_id: int) -> int:
    """Number of the owner's ready tracks not yet auto-tagged."""
    return db.scalar(
        select(func.count(Track.id)).where(
            Track.user_id == user_id,
            Track.status == "ready",
            _needs_auto_tagging(),
        ),
    ) or 0


def auto_tag_next_owner_batch(
    db: Session,
    provider: AiProviderService,
    *,
    user_id: int,
    min_confidence: float,
    batch_size: int = WEB_BATCH_SIZE,
) -> tuple[AutoTagBatchResult, int]:
    """Auto-tag the owner's next untagged batch for an on-demand request.

    Returns the batch result and how many of the owner's tracks still wait.
    Used by the Web "auto-tag" button, which calls it repeatedly so no single
    HTTP request has to cover the whole library.
    """
    track_ids = list_tracks_needing_auto_tagging(db, limit=batch_size, user_id=user_id)
    if not track_ids:
        result = AutoTagBatchResult(provider_status=provider.status)
    else:
        result = auto_tag_batch(db, provider, track_ids, min_confidence=min_confidence)
    return result, count_tracks_needing_auto_tagging(db, user_id=user_id)


def _needs_auto_tagging():
    return or_(
        Track.ai_tags_version.is_(None),
        Track.ai_tags_version < AI_AUTO_TAGGING_VERSION,
    )


def auto_tag_tracks(
    db: Session,
    provider: AiProviderService,
    track_ids: Sequence[int],
    *,
    min_confidence: float,
    batch_size: int = DEFAULT_BATCH_SIZE,
    on_batch: Callable[[list[int], AutoTagBatchResult], None] | None = None,
) -> list[AutoTagBatchResult]:
    """Auto-tag *track_ids* in chunks of *batch_size*, one provider call each.

    Stops early when the provider is disabled or unconfigured, since every
    further call would fail the same way.
    """
    size = max(1, batch_size)
    results: list[AutoTagBatchResult] = []
    ids = list(dict.fromkeys(track_ids))
    for start in range(0, len(ids), size):
        chunk = ids[start : start + size]
        result = auto_tag_batch(db, provider, chunk, min_confidence=min_confidence)
        results.append(result)
        if on_batch is not None:
            on_batch(chunk, result)
        if result.provider_status in (
            AiProviderStatus.DISABLED,
            AiProviderStatus.UNCONFIGURED,
        ):
            break
    return results


def auto_tag_batch(
    db: Session,
    provider: AiProviderService,
    track_ids: Sequence[int],
    *,
    min_confidence: float,
) -> AutoTagBatchResult:
    """Auto-tag one small batch of tracks.

    Tracks are grouped by owner so each provider call only sees one owner's
    tracks and catalogue. In the single-owner deployment this is one call.
    """
    status = provider.status
    if status != AiProviderStatus.OK:
        return AutoTagBatchResult(provider_status=status)

    tracks = list(
        db.scalars(
            select(Track)
            .where(Track.id.in_(list(track_ids)), Track.status == "ready")
            .order_by(Track.id),
        ),
    )
    if not tracks:
        return AutoTagBatchResult(provider_status=AiProviderStatus.OK)

    by_owner: dict[int, list[Track]] = {}
    for track in tracks:
        by_owner.setdefault(track.user_id, []).append(track)

    combined = AutoTagBatchResult(provider_status=AiProviderStatus.OK)
    for user_id, owner_tracks in by_owner.items():
        result = _auto_tag_owner_tracks(
            db,
            provider,
            user_id,
            owner_tracks,
            min_confidence=min_confidence,
        )
        combined.tagged_track_ids.extend(result.tagged_track_ids)
        combined.applied.update(result.applied)
        if not result.ok:
            combined.provider_status = result.provider_status
            combined.error = result.error
    return combined


# ---------------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------------


def _auto_tag_owner_tracks(
    db: Session,
    provider: AiProviderService,
    user_id: int,
    tracks: list[Track],
    *,
    min_confidence: float,
) -> AutoTagBatchResult:
    tags = list(
        db.scalars(
            select(Tag)
            .where(Tag.user_id == user_id, Tag.group.in_(_VALID_GROUPS))
            .order_by(Tag.group, Tag.created_at, Tag.id),
        ),
    )
    if not tags:
        return AutoTagBatchResult(
            provider_status=AiProviderStatus.OK,
            error="The tag catalogue is empty; create scene/type/feature tags first.",
        )
    tags_by_id = {tag.id: tag for tag in tags}
    return _tag_with_catalogue(
        db,
        provider,
        tracks,
        tags,
        tags_by_id,
        min_confidence=min_confidence,
    )


def _tag_with_catalogue(
    db: Session,
    provider: AiProviderService,
    tracks: list[Track],
    tags: list[Tag],
    tags_by_id: dict[int, Tag],
    *,
    min_confidence: float,
) -> AutoTagBatchResult:
    """One provider call for *tracks*; on truncation, retry each half.

    Reasoning models can spend the whole output budget before writing any
    JSON. Smaller prompts need less reasoning, so a truncated batch is split
    until it succeeds or a single track still truncates.
    """
    track_ids = [track.id for track in tracks]
    owner_tag_ids, has_ai_rows = _load_existing_rows(db, track_ids)

    prompt = _build_prompt(tracks, tags, tags_by_id, owner_tag_ids)
    ai_output, completion, parse_error = complete_and_parse_json(
        provider,
        prompt,
        AiAutoTagBatchOutput,
        system_instruction=_SYSTEM_INSTRUCTION,
        max_tokens=AUTO_TAG_MAX_TOKENS,
        temperature=0.2,
    )
    if ai_output is None:
        if completion.error_type == _TRUNCATED_ERROR_TYPE and len(tracks) > 1:
            middle = len(tracks) // 2
            combined = AutoTagBatchResult(provider_status=AiProviderStatus.OK)
            for half in (tracks[:middle], tracks[middle:]):
                part = _tag_with_catalogue(
                    db,
                    provider,
                    half,
                    tags,
                    tags_by_id,
                    min_confidence=min_confidence,
                )
                combined.tagged_track_ids.extend(part.tagged_track_ids)
                combined.applied.update(part.applied)
                if not part.ok:
                    combined.provider_status = part.provider_status
                    combined.error = part.error
            return combined
        status = completion.provider_status
        if status == AiProviderStatus.OK:
            status = AiProviderStatus.ERROR
        return AutoTagBatchResult(
            provider_status=status,
            error=parse_error or completion.error_message or "AI auto-tagging failed.",
        )

    proposed = _collect_proposals(ai_output, set(track_ids), tags_by_id, min_confidence)

    result = AutoTagBatchResult(provider_status=AiProviderStatus.OK)
    for track in tracks:
        if has_ai_rows.get(track.id):
            db.execute(
                delete(TrackTag).where(
                    TrackTag.track_id == track.id,
                    TrackTag.source == AI_TAG_SOURCE,
                ),
            )
        applied: list[AppliedTag] = []
        ranked = sorted(proposed.get(track.id, {}).items(), key=lambda item: -item[1])
        for tag_id, confidence in ranked:
            if tag_id in owner_tag_ids.get(track.id, set()):
                continue
            if len(applied) >= MAX_AI_TAGS_PER_TRACK:
                break
            tag = tags_by_id[tag_id]
            db.add(
                TrackTag(
                    track_id=track.id,
                    tag_id=tag_id,
                    confidence=confidence,
                    source=AI_TAG_SOURCE,
                ),
            )
            applied.append(
                AppliedTag(tag_id=tag_id, name=tag.name, group=tag.group, confidence=confidence),
            )
        track.ai_tags_version = AI_AUTO_TAGGING_VERSION
        result.tagged_track_ids.append(track.id)
        result.applied[track.id] = applied

    db.commit()
    logger.info(
        "AI auto-tagged %d track(s) with %d tag(s).",
        len(result.tagged_track_ids),
        result.applied_tag_count,
    )
    return result


def _load_existing_rows(
    db: Session,
    track_ids: list[int],
) -> tuple[dict[int, set[int]], dict[int, bool]]:
    """Return owner-chosen tag ids per track and whether AI rows exist.

    Column tuples, not ORM rows, so the later bulk delete and re-insert of
    the same primary keys cannot clash with objects in the identity map.
    """
    owner_tag_ids: dict[int, set[int]] = {}
    has_ai_rows: dict[int, bool] = {}
    rows = db.execute(
        select(TrackTag.track_id, TrackTag.tag_id, TrackTag.source).where(
            TrackTag.track_id.in_(track_ids),
        ),
    )
    for track_id, tag_id, source in rows:
        if source == AI_TAG_SOURCE:
            has_ai_rows[track_id] = True
        else:
            owner_tag_ids.setdefault(track_id, set()).add(tag_id)
    return owner_tag_ids, has_ai_rows


def _collect_proposals(
    ai_output: AiAutoTagBatchOutput,
    batch_track_ids: set[int],
    tags_by_id: dict[int, Tag],
    min_confidence: float,
) -> dict[int, dict[int, float]]:
    proposed: dict[int, dict[int, float]] = {}
    for item in ai_output.tracks:
        if item.track_id not in batch_track_ids:
            continue  # invented or out-of-batch track id
        for suggestion in item.tags:
            if suggestion.tag_id not in tags_by_id:
                continue  # invented or foreign tag id
            confidence = round(min(max(suggestion.confidence, 0.0), 1.0), 3)
            if confidence < min_confidence:
                continue
            per_track = proposed.setdefault(item.track_id, {})
            per_track[suggestion.tag_id] = max(per_track.get(suggestion.tag_id, 0.0), confidence)
    return proposed


def _build_prompt(
    tracks: list[Track],
    tags: list[Tag],
    tags_by_id: dict[int, Tag],
    owner_tag_ids: dict[int, set[int]],
) -> str:
    lines: list[str] = ["Tag catalogue — use ONLY these tag ids:"]
    for tag in tags:
        lines.append(f"  [{tag.group}] id:{tag.id} {tag.name}")
    lines.append("")
    lines.extend(TAXONOMY_GUIDE_LINES)
    lines.append("")
    lines.append("Tracks:")
    for track in tracks:
        lines.append(f"- track_id: {track.id}")
        lines.append(f"  title: {track.title}")
        if track.artist:
            lines.append(f"  artist: {track.artist}")
        if track.album:
            lines.append(f"  album: {track.album}")
        if track.duration_seconds:
            minutes, seconds = divmod(int(track.duration_seconds), 60)
            lines.append(f"  duration: {minutes}:{seconds:02d}")
        lines.append(f"  content_type: {track.content_type}")
        if track.source_url:
            lines.append(f"  source_url: {track.source_url}")
        if track.original_file_path:
            basename = os.path.basename(track.original_file_path)
            if basename:
                lines.append(f"  original_filename: {basename}")
        owner_names = [
            f"[{tags_by_id[tag_id].group}] {tags_by_id[tag_id].name}"
            for tag_id in sorted(owner_tag_ids.get(track.id, set()))
            if tag_id in tags_by_id
        ]
        if owner_names:
            lines.append(f"  owner_tags: {', '.join(owner_names)}")
    lines.append("")
    lines.append(
        "For each track, choose the catalogue tags that fit it. owner_tags were "
        "chosen by the owner: treat them as correct context and do not repeat "
        "them. Pick a scene tag only when the music clearly suits that "
        "listening situation. Give each tag a confidence from 0.0 to 1.0 that "
        "reflects how sure you are from this metadata alone; use a value below "
        "0.5 when you are guessing. Return every track_id exactly once, with an "
        "empty tags list when nothing fits."
    )
    lines.append(
        'Return JSON shaped as {"tracks": [{"track_id": 1, "tags": '
        '[{"tag_id": 2, "confidence": 0.8}]}]}. Do not include prose outside JSON.'
    )
    return "\n".join(lines)
