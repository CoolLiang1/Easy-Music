import argparse
import os
import time

from app.db.session import SessionLocal
from app.worker.jobs import process_next_job, process_one_track

DEFAULT_POLL_INTERVAL_SECONDS = 5.0


def main() -> int:
    parser = argparse.ArgumentParser(description="Process uploaded tracks.")
    parser.add_argument(
        "--track-id",
        type=int,
        default=_track_id_from_env(),
        help="Track ID to process. Can also be set with PROCESS_TRACK_ID.",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        default=_env_flag("WORKER_LOOP"),
        help="Continuously poll for pending jobs. Can also be enabled with WORKER_LOOP=true.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=_poll_interval_from_env(),
        help="Seconds to wait between loop iterations. Can also be set with WORKER_POLL_INTERVAL_SECONDS.",
    )
    args = parser.parse_args()

    if args.track_id is not None:
        if args.loop:
            parser.error("--track-id cannot be combined with --loop.")
        return run_track(args.track_id)

    if args.loop:
        return run_loop(args.poll_interval)

    return run_once()


def run_track(track_id: int) -> int:
    with SessionLocal() as db:
        track = process_one_track(db, track_id)
        print(f"Processed track {track.id}: {track.status}")
    return 0


def run_once() -> int:
    with SessionLocal() as db:
        job = process_next_job(db)

    if job is None:
        print("No pending processing jobs.")
    else:
        print(f"Processed job {job.id}: {job.status}")
    return 0


def run_loop(poll_interval: float) -> int:
    if poll_interval <= 0:
        raise ValueError("Worker poll interval must be greater than zero.")

    print(f"Worker loop started; polling every {poll_interval:g} seconds.")
    while True:
        run_once()
        time.sleep(poll_interval)


def _track_id_from_env() -> int | None:
    value = os.getenv("PROCESS_TRACK_ID")
    if not value:
        return None
    return int(value)


def _poll_interval_from_env() -> float:
    value = os.getenv("WORKER_POLL_INTERVAL_SECONDS")
    if not value:
        return DEFAULT_POLL_INTERVAL_SECONDS
    return float(value)


def _env_flag(name: str) -> bool:
    value = os.getenv(name)
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    raise SystemExit(main())
