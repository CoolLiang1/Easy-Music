from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.media.ffmpeg import SubprocessRunner, probe_media


@dataclass(frozen=True)
class MediaMetadata:
    duration_seconds: int | None
    format: str | None
    bitrate: int | None
    title: str | None
    artist: str | None
    album: str | None


def extract_metadata(
    source_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
) -> MediaMetadata:
    payload = probe_media(source_path, settings=settings, runner=runner)
    format_payload = payload.get("format")
    if not isinstance(format_payload, Mapping):
        format_payload = {}

    tags = format_payload.get("tags")
    if not isinstance(tags, Mapping):
        tags = {}

    return MediaMetadata(
        duration_seconds=_parse_duration(format_payload.get("duration")),
        format=_parse_string(format_payload.get("format_name")),
        bitrate=_parse_int(format_payload.get("bit_rate")),
        title=_find_tag(tags, "title"),
        artist=_find_tag(tags, "artist"),
        album=_find_tag(tags, "album"),
    )


def _parse_duration(value: Any) -> int | None:
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _find_tag(tags: Mapping[Any, Any], name: str) -> str | None:
    for key, value in tags.items():
        if isinstance(key, str) and key.lower() == name:
            return _parse_string(value)
    return None
