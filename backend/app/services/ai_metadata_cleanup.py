"""Owner-reviewed AI clean-up of track titles and artists.

Titles of uploaded and imported tracks come from file names, which carry
platform noise and often hide the artist. The AI proposes a clean title and
the credited artist for a few tracks at a time; nothing is saved until the
owner accepts the changes in the Web review list. Safety rules:

* Suggestions are previews. Only ``apply_metadata_changes`` writes, and only
  to the owner's own tracks.
* An artist below ``ARTIST_MIN_CONFIDENCE`` is dropped: an empty artist is
  better than a wrong one. Only confident artists are pre-selected.
* ``tracks.ai_metadata_version`` records that the owner reviewed a track, so
  it is not offered again until the version is bumped.
* No web search: a live evaluation showed search snippets pushed the model
  towards the most popular song with the same name.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.track import Track
from app.schemas.ai import (
    AiMetadataBatchOutput,
    AiProviderStatus,
    MetadataChange,
    MetadataSuggestion,
)
from app.services.ai_json import complete_and_parse_json
from app.services.ai_provider import AiProviderService
from app.services.duplicate_signals import build_normalized_metadata_key

logger = logging.getLogger(__name__)

# Bump when the prompt changes enough that reviewed tracks should be offered
# again.
AI_METADATA_VERSION = 1
BATCH_SIZE = 5
# Reasoning models count hidden reasoning against max_tokens.
METADATA_MAX_TOKENS = 8192
ARTIST_MIN_CONFIDENCE = 0.5
ARTIST_PRESELECT_CONFIDENCE = 0.8
MAX_FIELD_LENGTH = 255
_TRUNCATED_ERROR_TYPE = "output_truncated"

_SYSTEM_INSTRUCTION = """\
You clean up metadata for a single owner's private music library. Each track's \
current title usually comes from a file name ripped from a video site. For \
each track return:

- title: the work's own name only. Remove upload noise: resolution and quality \
marks (4K, 1080P, 高音质, 无损, 修复), "Official Video/Audio/MV", lyrics or \
subtitle notes (歌词, 字幕), "完整版", track numbers, loop or duration notes \
("1小时循环"), hashtags, channel names, video ids, and the artist name. Keep \
meaningful version information: Live, Remix, Cover, piano or guitar version, \
"ver." suffixes and similar. Keep the original script and language; never \
translate (鳥の詩 stays 鳥の詩). Replace underscores with spaces. When the \
current title names a source work (anime, game, film) and the song title alone \
would be ambiguous, you may append it in full-width parentheses, for example \
"Rage Your Dream（头文字D）". If the title is already clean, return it unchanged.
- artist: the credited performer as music services list it. For instrumental \
game, film, or anime scores use the composer or the official credit (for \
example HOYO-MiX). For covers or fan arrangements, credit the cover performer \
only when identifiable. Use the artist's usual name in its original script \
(米津玄師, not a translation). Join several artists with ", ". If the track \
already has an artist, return it unchanged unless it is clearly not the \
performer.
- artist_confidence: 0.0 to 1.0, how sure you are the artist is right for \
this recording.

Return artist null when you cannot identify the artist with high confidence: \
generic titles shared by many songs, ambient or white noise, lofi streams, \
personal recordings, or unclear covers. A null artist is always better than a \
wrong one. Return every track_id exactly once and never invent track ids."""


@dataclass
class MetadataBatchResult:
    provider_status: AiProviderStatus
    suggestions: list[MetadataSuggestion] = field(default_factory=list)
    reviewed_track_ids: list[int] = field(default_factory=list)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.provider_status == AiProviderStatus.OK and self.error is None


def _needs_review():
    return or_(
        Track.ai_metadata_version.is_(None),
        Track.ai_metadata_version < AI_METADATA_VERSION,
    )


def _pending_statement(user_id: int, after_id: int | None):
    statement = select(Track).where(
        Track.user_id == user_id,
        Track.status == "ready",
        _needs_review(),
    )
    if after_id is not None:
        statement = statement.where(Track.id > after_id)
    return statement


def count_pending_tracks(db: Session, *, user_id: int, after_id: int | None = None) -> int:
    """Number of the owner's ready tracks not yet reviewed (after *after_id*)."""
    statement = select(func.count(Track.id)).where(
        Track.user_id == user_id,
        Track.status == "ready",
        _needs_review(),
    )
    if after_id is not None:
        statement = statement.where(Track.id > after_id)
    return db.scalar(statement) or 0


def suggest_next_batch(
    db: Session,
    provider: AiProviderService,
    *,
    user_id: int,
    after_id: int | None = None,
    batch_size: int = BATCH_SIZE,
) -> tuple[MetadataBatchResult, int | None, int]:
    """Propose clean metadata for the owner's next pending tracks.

    Returns the batch result, the last track id of the batch (the next
    cursor), and how many pending tracks remain after it. Saves nothing.
    """
    tracks = list(
        db.scalars(
            _pending_statement(user_id, after_id).order_by(Track.id).limit(max(1, batch_size)),
        ),
    )
    if not tracks:
        return MetadataBatchResult(provider_status=provider.status), None, 0

    status = provider.status
    if status != AiProviderStatus.OK:
        result = MetadataBatchResult(provider_status=status)
    else:
        result = _suggest(provider, tracks)
    next_after_id = tracks[-1].id
    remaining = count_pending_tracks(db, user_id=user_id, after_id=next_after_id)
    return result, next_after_id, remaining


def apply_metadata_changes(
    db: Session,
    *,
    user_id: int,
    changes: Sequence[MetadataChange],
    reviewed_track_ids: Sequence[int],
) -> tuple[int, int]:
    """Save accepted changes and mark reviewed tracks.

    Tracks the owner does not own are ignored. Returns ``(updated, reviewed)``.
    """
    change_by_id = {change.track_id: change for change in changes}
    ids = set(change_by_id) | set(reviewed_track_ids)
    if not ids:
        return 0, 0
    tracks = list(
        db.scalars(select(Track).where(Track.user_id == user_id, Track.id.in_(ids))),
    )
    updated = 0
    for track in tracks:
        change = change_by_id.get(track.id)
        if change is not None and _apply_change(track, change):
            updated += 1
        track.ai_metadata_version = AI_METADATA_VERSION
    db.commit()
    logger.info("AI metadata clean-up updated %d track(s), reviewed %d.", updated, len(tracks))
    return updated, len(tracks)


# ---------------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------------


def _apply_change(track: Track, change: MetadataChange) -> bool:
    changed = False
    fields = change.model_fields_set
    if "title" in fields:
        title = _clean_value(change.title)
        if title and title != track.title:
            track.title = title
            changed = True
    if "artist" in fields:
        artist = _clean_value(change.artist)
        if artist != track.artist:
            track.artist = artist
            changed = True
    if changed:
        track.normalized_metadata_key = build_normalized_metadata_key(
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration_seconds=track.duration_seconds,
        )
    return changed


def _suggest(provider: AiProviderService, tracks: list[Track]) -> MetadataBatchResult:
    """One provider call for *tracks*; on truncation, retry each half."""
    ai_output, completion, parse_error = complete_and_parse_json(
        provider,
        _build_prompt(tracks),
        AiMetadataBatchOutput,
        system_instruction=_SYSTEM_INSTRUCTION,
        max_tokens=METADATA_MAX_TOKENS,
        temperature=0.1,
    )
    if ai_output is None:
        if completion.error_type == _TRUNCATED_ERROR_TYPE and len(tracks) > 1:
            middle = len(tracks) // 2
            combined = MetadataBatchResult(provider_status=AiProviderStatus.OK)
            for half in (tracks[:middle], tracks[middle:]):
                part = _suggest(provider, half)
                combined.suggestions.extend(part.suggestions)
                combined.reviewed_track_ids.extend(part.reviewed_track_ids)
                if not part.ok:
                    combined.provider_status = part.provider_status
                    combined.error = part.error
            return combined
        status = completion.provider_status
        if status == AiProviderStatus.OK:
            status = AiProviderStatus.ERROR
        return MetadataBatchResult(
            provider_status=status,
            error=parse_error or completion.error_message or "AI metadata clean-up failed.",
        )

    outputs = {item.track_id: item for item in ai_output.tracks}
    result = MetadataBatchResult(provider_status=AiProviderStatus.OK)
    for track in tracks:
        item = outputs.get(track.id)
        if item is None:
            continue  # not answered: leave it pending for a later review
        result.reviewed_track_ids.append(track.id)
        suggestion = _build_suggestion(track, item.title, item.artist, item.artist_confidence)
        if suggestion is not None:
            result.suggestions.append(suggestion)
    return result


def _build_suggestion(
    track: Track,
    title: str | None,
    artist: str | None,
    confidence: float,
) -> MetadataSuggestion | None:
    confidence = round(min(max(float(confidence), 0.0), 1.0), 3)
    suggested_title = _clean_value(title) or track.title
    suggested_artist = _clean_value(artist) if confidence >= ARTIST_MIN_CONFIDENCE else None

    title_changed = suggested_title != track.title
    artist_changed = suggested_artist is not None and suggested_artist != track.artist
    if not title_changed and not artist_changed:
        return None
    return MetadataSuggestion(
        track_id=track.id,
        current_title=track.title,
        current_artist=track.artist,
        suggested_title=suggested_title,
        suggested_artist=suggested_artist if artist_changed else track.artist,
        artist_confidence=confidence if suggested_artist is not None else 0.0,
        title_changed=title_changed,
        artist_changed=artist_changed,
        title_selected=title_changed,
        artist_selected=(
            artist_changed
            and not (track.artist or "").strip()
            and confidence >= ARTIST_PRESELECT_CONFIDENCE
        ),
    )


def _clean_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned[:MAX_FIELD_LENGTH] or None


def _build_prompt(tracks: list[Track]) -> str:
    lines = ["Tracks:"]
    for track in tracks:
        lines.append(f"- track_id: {track.id}")
        lines.append(f"  current_title: {track.title}")
        if track.artist:
            lines.append(f"  current_artist: {track.artist}")
        if track.album:
            lines.append(f"  album: {track.album}")
        if track.duration_seconds:
            minutes, seconds = divmod(int(track.duration_seconds), 60)
            lines.append(f"  duration: {minutes}:{seconds:02d}")
        if track.source_url:
            lines.append(f"  source_url: {track.source_url}")
    lines.append("")
    lines.append(
        'Return JSON shaped as {"tracks": [{"track_id": 1, "title": "...", '
        '"artist": "..." or null, "artist_confidence": 0.0}]}. '
        "Do not include prose outside JSON."
    )
    return "\n".join(lines)
