from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media.paths import UnsafeMediaPathError
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.models.user import User
from app.schemas.storage_consistency import (
    MediaKind,
    MediaReferenceIssue,
    OrphanMediaFile,
    StorageConsistencyReport,
)


@dataclass(frozen=True)
class MediaReference:
    track_id: int
    media_kind: MediaKind
    path: str


MAX_SCANNED_FILES = 10_000


def build_storage_consistency_report(
    db: Session,
    user: User,
    storage: MediaStorage,
    *,
    now: datetime | None = None,
) -> StorageConsistencyReport:
    all_tracks = list(db.scalars(select(Track)))
    all_jobs = list(db.scalars(select(ProcessingJob)))
    tracks_by_id = {track.id: track for track in all_tracks}
    all_references = _collect_expected_references(all_tracks, all_jobs, tracks_by_id)
    owned_references = [
        reference
        for reference in all_references
        if tracks_by_id.get(reference.track_id) is not None
        and tracks_by_id[reference.track_id].user_id == user.id
    ]
    normalized_global_paths = {
        normalized
        for reference in all_references
        if (normalized := _normalize_reference(storage, reference.path)) is not None
    }

    missing: list[MediaReferenceIssue] = []
    unsafe: list[MediaReferenceIssue] = []
    normalized_owned_paths: set[str] = set()
    for reference in owned_references:
        normalized = _normalize_reference(storage, reference.path)
        if normalized is None:
            unsafe.append(
                MediaReferenceIssue(
                    track_id=reference.track_id,
                    media_kind=reference.media_kind,
                    path=None,
                ),
            )
            continue
        normalized_owned_paths.add(normalized)
        if not storage.stored_media_path(normalized).is_file():
            missing.append(
                MediaReferenceIssue(
                    track_id=reference.track_id,
                    media_kind=reference.media_kind,
                    path=normalized,
                ),
            )

    orphan_files, scanned_file_count, scan_errors = _scan_owner_orphans(
        storage,
        user.id,
        normalized_global_paths,
    )
    issue_key = lambda issue: (issue.track_id, issue.media_kind, issue.path or "")
    return StorageConsistencyReport(
        generated_at=now or datetime.now(UTC),
        referenced_file_count=len(normalized_owned_paths),
        scanned_file_count=scanned_file_count,
        missing_references=sorted(missing, key=issue_key),
        unsafe_references=sorted(unsafe, key=issue_key),
        orphan_files=sorted(orphan_files, key=lambda item: (item.media_kind, item.path)),
        scan_errors=scan_errors,
    )


def _collect_expected_references(
    tracks: list[Track],
    jobs: list[ProcessingJob],
    tracks_by_id: dict[int, Track],
) -> list[MediaReference]:
    references: list[MediaReference] = []
    for track in tracks:
        for media_kind, path in (
            ("original", track.original_file_path),
            ("playback", track.playback_file_path),
            ("cover", track.cover_path),
        ):
            if path:
                references.append(MediaReference(track.id, media_kind, path))

    for job in jobs:
        track = tracks_by_id.get(job.track_id)
        if (
            track is not None
            and job.source_path
            and job.job_type == "video_extraction"
            and job.status in {"pending", "running", "failed"}
            and not track.original_file_path
        ):
            references.append(
                MediaReference(track.id, "temporary_video", job.source_path),
            )
    return list(dict.fromkeys(references))


def _normalize_reference(storage: MediaStorage, relative_path: str) -> str | None:
    try:
        path = storage.stored_media_path(relative_path)
        return storage.relative_media_path(path)
    except (UnsafeMediaPathError, ValueError):
        return None


def _scan_owner_orphans(
    storage: MediaStorage,
    user_id: int,
    referenced_paths: set[str],
) -> tuple[list[OrphanMediaFile], int, list[str]]:
    roots: tuple[tuple[MediaKind, str], ...] = (
        ("original", storage.settings.originals_dir),
        ("playback", storage.settings.playback_dir),
        ("cover", storage.settings.covers_dir),
        ("temporary_video", storage.settings.temp_videos_dir),
    )
    orphan_files: list[OrphanMediaFile] = []
    scan_errors: list[str] = []
    scanned_file_count = 0

    for media_kind, subdir in roots:
        try:
            owner_root = storage.stored_media_path(f"{subdir}/user-{user_id}")
            if not owner_root.exists():
                continue
            candidates = owner_root.rglob("*")
        except (OSError, UnsafeMediaPathError):
            scan_errors.append(f"{media_kind}: unable to scan owner media directory.")
            continue

        for candidate in candidates:
            try:
                if candidate.is_symlink() or not candidate.is_file():
                    continue
                relative_path = storage.relative_media_path(candidate)
            except (OSError, ValueError):
                scan_errors.append(f"{media_kind}: skipped an unsafe or unreadable entry.")
                continue
            scanned_file_count += 1
            if scanned_file_count > MAX_SCANNED_FILES:
                scan_errors.append(
                    f"scan stopped after {MAX_SCANNED_FILES} managed files.",
                )
                return orphan_files, MAX_SCANNED_FILES, sorted(set(scan_errors))
            if relative_path not in referenced_paths:
                orphan_files.append(
                    OrphanMediaFile(media_kind=media_kind, path=relative_path),
                )

    return orphan_files, scanned_file_count, sorted(set(scan_errors))
