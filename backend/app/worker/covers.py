"""Extract embedded artwork as covers for existing tracks that have none.

Usage (inside the api or worker container):

    python -m app.worker.covers --dry-run
    python -m app.worker.covers
    python -m app.worker.covers --track-id 42

Only tracks without a cover are touched, so covers the owner uploaded are
never replaced. Original files are only read. Tracks whose original has no
embedded picture keep the generated placeholder; rerunning is harmless.
"""

import argparse

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.media.ffmpeg import extract_cover_image
from app.media.paths import UnsafeMediaPathError
from app.media.storage import MediaStorage
from app.models.track import Track
from app.services.covers import CoverExtractor, attach_extracted_cover, list_tracks_without_cover


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--track-id", type=int, help="Check one track only.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the tracks that would be checked without writing covers.",
    )
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        return run(db, MediaStorage(), track_id=args.track_id, dry_run=args.dry_run)


def run(
    db: Session,
    storage: MediaStorage,
    *,
    track_id: int | None = None,
    dry_run: bool = False,
    extractor: CoverExtractor = extract_cover_image,
) -> int:
    track_ids = [track_id] if track_id is not None else list_tracks_without_cover(db)
    if not track_ids:
        print("No tracks without a cover.")
        return 0
    if dry_run:
        print(f"{len(track_ids)} track(s) without a cover would be checked.")
        return 0

    found = 0
    for index, current_id in enumerate(track_ids, start=1):
        track = db.get(Track, current_id)
        if track is None or track.cover_path or not track.original_file_path:
            print(f"[{index}/{len(track_ids)}] track {current_id}: skipped")
            continue
        try:
            original = storage.stored_media_path(track.original_file_path)
        except UnsafeMediaPathError:
            print(f"[{index}/{len(track_ids)}] track {current_id}: skipped (unsafe path)")
            continue
        if not original.is_file():
            print(f"[{index}/{len(track_ids)}] track {current_id}: skipped (original missing)")
            continue
        if attach_extracted_cover(track, original, storage, extractor=extractor):
            db.commit()
            found += 1
            print(f"[{index}/{len(track_ids)}] track {current_id}: cover extracted")
        else:
            print(f"[{index}/{len(track_ids)}] track {current_id}: no embedded artwork")

    print(f"Done: {found} of {len(track_ids)} track(s) got a cover.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
