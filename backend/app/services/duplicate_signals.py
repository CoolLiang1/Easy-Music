from dataclasses import dataclass
from pathlib import Path
import hashlib
import re
import unicodedata


HASH_CHUNK_SIZE = 1024 * 1024


@dataclass(frozen=True)
class FileDuplicateSignal:
    size_bytes: int
    sha256: str


def collect_file_duplicate_signal(path: Path) -> FileDuplicateSignal | None:
    try:
        size_bytes = path.stat().st_size
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(HASH_CHUNK_SIZE):
                digest.update(chunk)
    except OSError:
        return None

    return FileDuplicateSignal(size_bytes=size_bytes, sha256=digest.hexdigest())


def build_normalized_metadata_key(
    *,
    title: str | None,
    artist: str | None,
    album: str | None,
    duration_seconds: int | None,
) -> str | None:
    normalized_title = _normalize_metadata_part(title)
    normalized_artist = _normalize_metadata_part(artist)
    normalized_album = _normalize_metadata_part(album)

    if not normalized_title and not normalized_artist and duration_seconds is None:
        return None

    duration_part = "" if duration_seconds is None else str(duration_seconds)
    return "|".join(
        (
            f"title={normalized_title}",
            f"artist={normalized_artist}",
            f"album={normalized_album}",
            f"duration={duration_part}",
        ),
    )


def _normalize_metadata_part(value: str | None) -> str:
    return normalize_metadata_text(value)


def normalize_metadata_text(value: str | None) -> str:
    if value is None:
        return ""

    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized
