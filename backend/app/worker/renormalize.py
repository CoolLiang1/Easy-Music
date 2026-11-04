"""Regenerate playback MP3s so existing tracks get loudness normalization.

Usage (inside the api or worker container):

    python -m app.worker.renormalize --dry-run
    python -m app.worker.renormalize
    python -m app.worker.renormalize --track-id 42
    python -m app.worker.renormalize --all

Only playback files are rewritten. Original files, metadata, tags, covers,
and playback history are left unchanged.
"""

import argparse
import time

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.media.storage import MediaStorage
from app.services.processing import (
    TrackProcessingError,
    list_tracks_needing_loudness_normalization,
    regenerate_track_playback,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--track-id", type=int, help="Regenerate one track only.")
    target.add_argument(
        "--all",
        action="store_true",
        help="Regenerate every ready track, including already normalized ones.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the tracks that would be regenerated without changing files.",
    )
    args = parser.parse_args(argv)

    if not get_settings().playback_loudness_normalization:
        print("PLAYBACK_LOUDNESS_NORMALIZATION is disabled; nothing to do.")
        return 1

    with SessionLocal() as db:
        return run(db, MediaStorage(), track_id=args.track_id, include_current=args.all, dry_run=args.dry_run)


def run(
    db: Session,
    storage: MediaStorage,
    *,
    track_id: int | None = None,
    include_current: bool = False,
    dry_run: bool = False,
    regenerate=regenerate_track_playback,
) -> int:
    if track_id is not None:
        track_ids = [track_id]
    else:
        track_ids = list_tracks_needing_loudness_normalization(db, include_current=include_current)

    if not track_ids:
        print("No tracks need loudness normalization.")
        return 0

    if dry_run:
        print(f"{len(track_ids)} track(s) would be regenerated: {', '.join(map(str, track_ids))}")
        return 0

    failed: list[int] = []
    for index, current_id in enumerate(track_ids, start=1):
        started = time.monotonic()
        try:
            track = regenerate(db, current_id, storage)
        except TrackProcessingError as exc:
            failed.append(current_id)
            cause = exc.__cause__ or exc
            print(f"[{index}/{len(track_ids)}] track {current_id}: FAILED ({cause})")
            continue
        elapsed = time.monotonic() - started
        print(
            f"[{index}/{len(track_ids)}] track {current_id}: "
            f"{_format(track.loudness_lufs, 'LUFS')}, gain {_format(track.playback_gain_db, 'dB')} "
            f"({elapsed:.1f}s)"
        )

    print(f"Done: {len(track_ids) - len(failed)} regenerated, {len(failed)} failed.")
    if failed:
        print(f"Failed track ids: {', '.join(map(str, failed))}")
        return 1
    return 0


def _format(value: float | None, unit: str) -> str:
    return "n/a" if value is None else f"{value:+.1f} {unit}"


if __name__ == "__main__":
    raise SystemExit(main())
