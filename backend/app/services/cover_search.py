"""Owner-reviewed cover lookup through the public iTunes Search API.

The only place Easy Music downloads anything from an external site, agreed by
the owner on 2026-11-06. Rules:

* Off unless ``COVER_SEARCH_ENABLED`` is true. Only a track's title and
  artist are sent to Apple; nothing else leaves the server.
* Tracks without an artist are not searched: a title alone matched the most
  popular song of that name in testing.
* Suggestions are previews. ``apply_cover_choices`` downloads an accepted
  image only from Apple's artwork CDN (HTTPS, ``*.mzstatic.com``, no
  redirects, size-capped, JPEG/PNG signature checked) and only for the
  owner's tracks that still have no cover. Owner-uploaded covers are never
  replaced.
* ``tracks.cover_search_version`` marks searched tracks. The automatic run
  searches each track once per version; the owner can search a coverless
  track again by id at any time.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.media.storage import MediaStorage
from app.models.track import Track

logger = logging.getLogger(__name__)

COVER_SEARCH_VERSION = 1
BATCH_SIZE = 3
MAX_PENDING_LISTED = 2000
# JP first: the owner's library is mostly anime/J-pop; US covers the rest.
SEARCH_COUNTRIES = ("JP", "US")
SEARCH_URL = "https://itunes.apple.com/search"
# Apple documents roughly 20 calls per minute per client.
MIN_SECONDS_BETWEEN_CALLS = 3.2
ARTWORK_SIZE = "600x600bb"
MAX_ARTWORK_BYTES = 5 * 1024 * 1024
ARTWORK_HOST_SUFFIX = ".mzstatic.com"
USER_AGENT = "EasyMusic/1.0 (self-hosted music library)"
TIMEOUT_SECONDS = 15

# Releases whose artwork usually differs from the original recording.
_VARIANT_WORDS = (
    "live", "reimagined", "remix", "karaoke", "instrumental", "acoustic", "cover",
    "ensemble", "orchestra", "piano ver", "music box", "orgel", "オルゴール",
    "カラオケ", "off vocal", "tv size", "8-bit", "lullaby", "tribute",
)

MATCH = "match"
UNCERTAIN = "uncertain"


class CoverSearchClient(Protocol):
    def search(self, term: str, country: str) -> list[dict[str, Any]]: ...


@dataclass
class CoverCandidate:
    artwork_url: str
    track_name: str
    artist_name: str
    collection_name: str
    confidence: str  # MATCH or UNCERTAIN


@dataclass
class CoverSuggestion:
    track_id: int
    candidate: CoverCandidate


@dataclass
class CoverBatchResult:
    status: str  # "ok", "disabled", "error"
    suggestions: list[CoverSuggestion] = field(default_factory=list)
    reviewed_track_ids: list[int] = field(default_factory=list)
    error: str | None = None


class CoverSearchUnavailableError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# iTunes client
# ---------------------------------------------------------------------------


class ItunesCoverSearchClient:
    """Minimal iTunes Search API client with a process-wide rate limit."""

    _lock = threading.Lock()
    _last_call = 0.0

    def __init__(self, *, sleep=time.sleep, clock=time.monotonic) -> None:
        self._sleep = sleep
        self._clock = clock

    def search(self, term: str, country: str) -> list[dict[str, Any]]:
        query = urllib.parse.urlencode(
            {"term": term, "media": "music", "entity": "song", "limit": 10, "country": country},
        )
        request = urllib.request.Request(f"{SEARCH_URL}?{query}", headers={"User-Agent": USER_AGENT})
        with ItunesCoverSearchClient._lock:
            wait = ItunesCoverSearchClient._last_call + MIN_SECONDS_BETWEEN_CALLS - self._clock()
            if wait > 0:
                self._sleep(wait)
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                raise CoverSearchUnavailableError(f"iTunes search failed: {exc}") from exc
            finally:
                ItunesCoverSearchClient._last_call = self._clock()
        results = payload.get("results") if isinstance(payload, dict) else None
        return [item for item in results or [] if isinstance(item, dict)]


# ---------------------------------------------------------------------------
# matching
# ---------------------------------------------------------------------------


def find_cover(title: str, artist: str, client: CoverSearchClient) -> CoverCandidate | None:
    """Best cover for one track, or None. Raises CoverSearchUnavailableError."""
    artists = _artist_parts(artist)
    if not artists or not _norm(title):
        return None
    term = f"{artist.split(',')[0].strip()} {_strip_brackets(title)}".strip()
    best: tuple[int, CoverCandidate] | None = None
    for country in SEARCH_COUNTRIES:
        for result in client.search(term, country):
            scored = _score(result, title, artists)
            if scored is not None and (best is None or scored[0] > best[0]):
                best = scored
        if best is not None and best[1].confidence == MATCH:
            break
    return best[1] if best else None


def _score(result: dict[str, Any], title: str, artists: list[str]) -> tuple[int, CoverCandidate] | None:
    artwork = _artwork_url(result.get("artworkUrl100"))
    if artwork is None:
        return None
    track_name = str(result.get("trackName") or "")
    artist_name = str(result.get("artistName") or "")
    collection = str(result.get("collectionName") or "")

    want, got = _norm(_strip_brackets(title)), _norm(_strip_brackets(track_name))
    if not want or not got:
        return None
    shorter, longer = sorted((want, got), key=len)
    if want == got:
        title_points = 4
    elif shorter in longer and len(shorter) >= 0.6 * len(longer):
        # "Infinity" inside "To the Infinity Castle" is a different song.
        title_points = 2
    else:
        return None  # a different song

    got_artist = _norm(artist_name)
    artist_ok = any(part in got_artist or got_artist in part for part in artists if part)
    title_has_variant = _has_variant(title)
    variant = not title_has_variant and _has_variant(f"{track_name} {collection}")

    points = title_points + (3 if artist_ok else 0) - (2 if variant else 0)
    confidence = MATCH if (artist_ok and title_points == 4 and not variant) else UNCERTAIN
    return points, CoverCandidate(
        artwork_url=artwork,
        track_name=track_name,
        artist_name=artist_name,
        collection_name=collection,
        confidence=confidence,
    )


def _artwork_url(value: Any) -> str | None:
    if not isinstance(value, str) or not _is_allowed_artwork_url(value):
        return None
    return re.sub(r"/\d+x\d+bb\.(jpg|png)$", f"/{ARTWORK_SIZE}.jpg", value)


def _is_allowed_artwork_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and host.endswith(ARTWORK_HOST_SUFFIX) and not parsed.username


def _artist_parts(artist: str) -> list[str]:
    return [part for part in (_norm(p) for p in re.split(r"[,、&/]| feat\.? ", artist or "")) if part]


def _strip_brackets(text: str) -> str:
    return re.sub(r"[（(\[【][^）)\]】]*[）)\]】]", " ", text or "").strip()


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", text or "").casefold())


def _has_variant(text: str) -> bool:
    folded = unicodedata.normalize("NFKC", text or "").casefold()
    for word in _VARIANT_WORDS:
        if word.isascii():
            # Whole words only, so "Alive" is not a live version.
            if re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", folded):
                return True
        elif word in folded:
            return True
    return False


# ---------------------------------------------------------------------------
# review flow
# ---------------------------------------------------------------------------


def _needs_search():
    return or_(Track.cover_search_version.is_(None), Track.cover_search_version < COVER_SEARCH_VERSION)


def _coverless_filter(user_id: int):
    return (Track.user_id == user_id, Track.status == "ready", Track.cover_path.is_(None))


def _searchable_filter(user_id: int):
    return (*_coverless_filter(user_id), Track.artist.is_not(None), func.trim(Track.artist) != "")


def _pending_filter(user_id: int):
    return (*_searchable_filter(user_id), _needs_search())


def is_searched(track: Track) -> bool:
    return track.cover_search_version is not None and track.cover_search_version >= COVER_SEARCH_VERSION


def list_coverless_tracks(db: Session, *, user_id: int, limit: int = MAX_PENDING_LISTED) -> list[Track]:
    """Every ready track of the owner that still has no cover, searched or not."""
    return list(db.scalars(select(Track).where(*_coverless_filter(user_id)).order_by(Track.id).limit(limit)))


def count_coverless_tracks(db: Session, *, user_id: int) -> int:
    return db.scalar(select(func.count(Track.id)).where(*_coverless_filter(user_id))) or 0


def count_pending_tracks(db: Session, *, user_id: int, after_id: int | None = None) -> int:
    statement = select(func.count(Track.id)).where(*_pending_filter(user_id))
    if after_id is not None:
        statement = statement.where(Track.id > after_id)
    return db.scalar(statement) or 0


def count_tracks_without_artist(db: Session, *, user_id: int) -> int:
    """Coverless ready tracks that are skipped because they have no artist."""
    return db.scalar(
        select(func.count(Track.id)).where(
            Track.user_id == user_id,
            Track.status == "ready",
            Track.cover_path.is_(None),
            or_(Track.artist.is_(None), func.trim(Track.artist) == ""),
        ),
    ) or 0


def search_next_batch(
    db: Session,
    client: CoverSearchClient | None,
    *,
    user_id: int,
    after_id: int | None = None,
    batch_size: int = BATCH_SIZE,
) -> tuple[CoverBatchResult, int | None, int]:
    """Look up covers for the owner's next pending tracks. Saves nothing."""
    statement = select(Track).where(*_pending_filter(user_id))
    if after_id is not None:
        statement = statement.where(Track.id > after_id)
    tracks = list(db.scalars(statement.order_by(Track.id).limit(max(1, batch_size))))
    if client is None:
        return CoverBatchResult(status="disabled"), None, 0
    if not tracks:
        return CoverBatchResult(status="ok"), None, 0

    result = _search_tracks(tracks, client)
    if result.status == "error" and not result.reviewed_track_ids:
        return result, after_id, count_pending_tracks(db, user_id=user_id, after_id=after_id)
    next_after_id = result.reviewed_track_ids[-1] if result.reviewed_track_ids else tracks[-1].id
    remaining = count_pending_tracks(db, user_id=user_id, after_id=next_after_id)
    return result, next_after_id, remaining


def search_tracks_by_id(
    db: Session,
    client: CoverSearchClient | None,
    *,
    user_id: int,
    track_ids: Sequence[int],
    batch_size: int = BATCH_SIZE,
) -> CoverBatchResult:
    """Search the given coverless tracks again, searched before or not. Saves nothing.

    Other users' tracks, tracks that have a cover, and tracks without an
    artist are ignored.
    """
    if client is None:
        return CoverBatchResult(status="disabled")
    wanted = list(dict.fromkeys(track_ids))[: max(1, batch_size)]
    if not wanted:
        return CoverBatchResult(status="ok")
    tracks = list(
        db.scalars(select(Track).where(*_searchable_filter(user_id), Track.id.in_(wanted)).order_by(Track.id)),
    )
    return _search_tracks(tracks, client)


def _search_tracks(tracks: Sequence[Track], client: CoverSearchClient) -> CoverBatchResult:
    result = CoverBatchResult(status="ok")
    for track in tracks:
        try:
            candidate = find_cover(track.title, track.artist or "", client)
        except CoverSearchUnavailableError as exc:
            logger.warning("Cover search failed for track %s: %s", track.id, exc)
            result.status = "error"
            result.error = "iTunes 搜索暂时不可用，请稍后重试。"
            break  # keep earlier tracks of this batch; retry the rest later
        result.reviewed_track_ids.append(track.id)
        if candidate is not None:
            result.suggestions.append(CoverSuggestion(track_id=track.id, candidate=candidate))
    return result


ArtworkDownloader = Any  # callable(url: str) -> bytes


def apply_cover_choices(
    db: Session,
    storage: MediaStorage,
    *,
    user_id: int,
    choices: Sequence[tuple[int, str]],
    reviewed_track_ids: Sequence[int],
    downloader: ArtworkDownloader | None = None,
) -> tuple[int, int, int]:
    """Download accepted covers and mark reviewed tracks.

    Returns ``(updated, failed, reviewed)``. A failed download leaves the track
    unmarked so it is offered again.
    """
    download = downloader or download_artwork
    choice_by_id = {track_id: url for track_id, url in choices}
    ids = set(choice_by_id) | set(reviewed_track_ids)
    if not ids:
        return 0, 0, 0
    tracks = list(db.scalars(select(Track).where(Track.user_id == user_id, Track.id.in_(ids))))
    updated = failed = reviewed = 0
    for track in tracks:
        url = choice_by_id.get(track.id)
        if url is not None and not track.cover_path:
            if not _save_artwork(track, url, storage, download):
                failed += 1
                continue
            updated += 1
        track.cover_search_version = COVER_SEARCH_VERSION
        reviewed += 1
    db.commit()
    logger.info("Cover search applied %d cover(s), %d failed, %d reviewed.", updated, failed, reviewed)
    return updated, failed, reviewed


def _save_artwork(track: Track, url: str, storage: MediaStorage, download) -> bool:
    if not _is_allowed_artwork_url(url):
        logger.warning("Rejected cover URL outside the artwork CDN for track %s.", track.id)
        return False
    try:
        data = download(url)
    except Exception:  # noqa: BLE001 - one bad image must not stop the batch
        logger.warning("Cover download failed for track %s.", track.id, exc_info=True)
        return False
    suffix = _image_suffix(data)
    if suffix is None:
        logger.warning("Downloaded cover for track %s is not a JPEG or PNG.", track.id)
        return False
    destination: Path = storage.cover_image_path(track.user_id, track.id, suffix)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    track.cover_path = storage.relative_media_path(destination)
    return True


def _image_suffix(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    return None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:  # noqa: D401
        return None


def download_artwork(url: str) -> bytes:
    """Fetch one image from Apple's artwork CDN without following redirects."""
    if not _is_allowed_artwork_url(url):
        raise ValueError("cover URL is not on the artwork CDN")
    opener = urllib.request.build_opener(_NoRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise ValueError(f"unexpected status {response.status}")
        data = response.read(MAX_ARTWORK_BYTES + 1)
    if len(data) > MAX_ARTWORK_BYTES:
        raise ValueError("cover image is too large")
    return data
