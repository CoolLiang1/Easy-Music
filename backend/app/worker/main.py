import argparse
import logging
import os
import time
from collections.abc import Callable

from app.db.session import SessionLocal
from app.worker.jobs import auto_tag_next_batch, process_next_job, process_one_track

DEFAULT_POLL_INTERVAL_SECONDS = 5.0
# After a failed auto-tag batch, wait this long before calling the provider
# again so an outage or a bad key does not cause a call every poll.
AUTO_TAG_FAILURE_BACKOFF_SECONDS = 600.0

logger = logging.getLogger(__name__)


class AutoTagThrottle:
    """Remembers when idle auto-tagging may run again after a failure."""

    def __init__(
        self,
        backoff_seconds: float = AUTO_TAG_FAILURE_BACKOFF_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._backoff_seconds = backoff_seconds
        self._clock = clock
        self._resume_at = 0.0

    def allowed(self) -> bool:
        return self._clock() >= self._resume_at

    def record_failure(self) -> None:
        self._resume_at = self._clock() + self._backoff_seconds


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


def run_once(auto_tag_throttle: AutoTagThrottle | None = None) -> int:
    with SessionLocal() as db:
        job = process_next_job(db)
        if job is None and auto_tag_throttle is not None:
            run_idle_auto_tagging(db, auto_tag_throttle)

    if job is None:
        print("No pending processing jobs.")
    else:
        print(f"Processed job {job.id}: {job.status}")
    return 0


def run_idle_auto_tagging(db, throttle: AutoTagThrottle, auto_tag=auto_tag_next_batch) -> None:
    """Auto-tag one batch while the media queue is empty.

    Media processing always runs first; a failure here never stops the loop.
    """
    if not throttle.allowed():
        return
    try:
        result = auto_tag(db)
    except Exception:
        db.rollback()
        logger.exception("AI auto-tagging batch crashed; retrying later.")
        throttle.record_failure()
        return
    if result is None:
        return
    if result.ok:
        print(
            f"AI auto-tagged {len(result.tagged_track_ids)} track(s) "
            f"with {result.applied_tag_count} tag(s)."
        )
        return
    logger.warning(
        "AI auto-tagging batch failed (%s): %s",
        result.provider_status.value,
        result.error,
    )
    throttle.record_failure()


def run_loop(poll_interval: float) -> int:
    if poll_interval <= 0:
        raise ValueError("Worker poll interval must be greater than zero.")

    print(f"Worker loop started; polling every {poll_interval:g} seconds.")
    auto_tag_throttle = AutoTagThrottle()
    while True:
        run_once(auto_tag_throttle)
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
