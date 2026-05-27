import argparse
import os

from app.db.session import SessionLocal
from app.worker.jobs import process_one_track


def main() -> int:
    parser = argparse.ArgumentParser(description="Process one uploaded track.")
    parser.add_argument(
        "--track-id",
        type=int,
        default=_track_id_from_env(),
        help="Track ID to process. Can also be set with PROCESS_TRACK_ID.",
    )
    args = parser.parse_args()

    if args.track_id is None:
        parser.print_help()
        return 0

    with SessionLocal() as db:
        track = process_one_track(db, args.track_id)

    print(f"Processed track {track.id}: {track.status}")
    return 0


def _track_id_from_env() -> int | None:
    value = os.getenv("PROCESS_TRACK_ID")
    if not value:
        return None
    return int(value)


if __name__ == "__main__":
    raise SystemExit(main())
