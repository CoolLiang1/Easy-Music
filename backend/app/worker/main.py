import argparse
import os

from app.db.session import SessionLocal
from app.worker.jobs import process_next_job, process_one_track


def main() -> int:
    parser = argparse.ArgumentParser(description="Process uploaded tracks.")
    parser.add_argument(
        "--track-id",
        type=int,
        default=_track_id_from_env(),
        help="Track ID to process. Can also be set with PROCESS_TRACK_ID.",
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.track_id is not None:
            track = process_one_track(db, args.track_id)
            print(f"Processed track {track.id}: {track.status}")
            return 0

        job = process_next_job(db)

    if job is None:
        print("No pending processing jobs.")
    else:
        print(f"Processed job {job.id}: {job.status}")
    return 0


def _track_id_from_env() -> int | None:
    value = os.getenv("PROCESS_TRACK_ID")
    if not value:
        return None
    return int(value)


if __name__ == "__main__":
    raise SystemExit(main())
