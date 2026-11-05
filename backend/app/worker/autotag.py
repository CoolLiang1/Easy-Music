"""Apply AI tags to existing tracks in batches.

Usage (inside the api or worker container):

    python -m app.worker.autotag --dry-run
    python -m app.worker.autotag --limit 20
    python -m app.worker.autotag
    python -m app.worker.autotag --track-id 42
    python -m app.worker.autotag --all

Only tracks not yet auto-tagged with the current rule version are processed
unless --track-id or --all is given. Re-tagging a track replaces its earlier
AI tags (including ones the owner removed) and never touches owner-chosen
tags. This command needs a working AI provider but does not require
AI_AUTO_TAGGING_ENABLED, so it can be tried before enabling the worker.
"""

import argparse

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.track import Track
from app.schemas.ai import AiProviderStatus
from app.services.ai_auto_tagging import (
    DEFAULT_BATCH_SIZE,
    AutoTagBatchResult,
    auto_tag_tracks,
    list_tracks_needing_auto_tagging,
)
from app.services.ai_client import build_ai_provider
from app.services.ai_provider import AiProviderService


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--track-id", type=int, help="Auto-tag one track only, even if already tagged.")
    target.add_argument(
        "--all",
        action="store_true",
        help="Re-tag every ready track, replacing existing AI tags (owner tags are kept).",
    )
    parser.add_argument("--limit", type=int, help="Process at most this many tracks.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Tracks per AI call (default {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the tracks that would be tagged without calling the AI provider.",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    provider = build_ai_provider(settings)
    with SessionLocal() as db:
        return run(
            db,
            provider,
            min_confidence=settings.ai_auto_tagging_min_confidence,
            track_id=args.track_id,
            include_current=args.all,
            limit=args.limit,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )


def run(
    db: Session,
    provider: AiProviderService,
    *,
    min_confidence: float,
    track_id: int | None = None,
    include_current: bool = False,
    limit: int | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    dry_run: bool = False,
) -> int:
    if track_id is not None:
        track_ids = [track_id]
    else:
        track_ids = list_tracks_needing_auto_tagging(
            db,
            include_current=include_current,
            limit=limit,
        )

    if not track_ids:
        print("No tracks need AI auto-tagging.")
        return 0

    if dry_run:
        print(f"{len(track_ids)} track(s) would be auto-tagged: {', '.join(map(str, track_ids))}")
        return 0

    if provider.status != AiProviderStatus.OK:
        print(f"AI provider is {provider.status.value}; set AI_ENABLED, AI_API_KEY, and AI_MODEL first.")
        return 1

    print(f"Auto-tagging {len(track_ids)} track(s), minimum confidence {min_confidence:g}.")
    total_batches = (len(track_ids) + max(1, batch_size) - 1) // max(1, batch_size)
    counter = {"batch": 0}

    def report(chunk: list[int], result: AutoTagBatchResult) -> None:
        counter["batch"] += 1
        prefix = f"[{counter['batch']}/{total_batches}]"
        if not result.ok:
            print(f"{prefix} tracks {', '.join(map(str, chunk))}: FAILED ({result.error})")
            return
        for current_id in result.tagged_track_ids:
            track = db.get(Track, current_id)
            title = track.title if track is not None else "?"
            applied = result.applied.get(current_id, [])
            summary = ", ".join(f"{tag.name} {tag.confidence:.2f}" for tag in applied) or "(no confident tags)"
            print(f"{prefix} track {current_id} {title}: {summary}")

    results = auto_tag_tracks(
        db,
        provider,
        track_ids,
        min_confidence=min_confidence,
        batch_size=batch_size,
        on_batch=report,
    )

    tagged = sum(len(result.tagged_track_ids) for result in results)
    applied = sum(result.applied_tag_count for result in results)
    failed_batches = [result for result in results if not result.ok]
    print(f"Done: {tagged} track(s) tagged with {applied} AI tag(s), {len(failed_batches)} batch(es) failed.")
    return 1 if failed_batches else 0


if __name__ == "__main__":
    raise SystemExit(main())
