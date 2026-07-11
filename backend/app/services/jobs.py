from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.media.paths import UnsafeMediaPathError
from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track


ACTIVE_JOB_STATUSES = {"pending", "running"}
PROCESSING_JOB_STATUSES = {"pending", "running", "succeeded", "failed"}
AUDIO_PROCESSING_JOB_TYPE = "audio_processing"
VIDEO_EXTRACTION_JOB_TYPE = "video_extraction"
MAX_ERROR_MESSAGE_LENGTH = 4000
STALE_JOB_ERROR = "Processing job exceeded the configured running timeout. Retry is available."


class ProcessingRetryError(ValueError):
    pass


def create_processing_job(
    db: Session,
    track: Track,
    *,
    job_type: str = AUDIO_PROCESSING_JOB_TYPE,
    source_path: str | None = None,
) -> ProcessingJob:
    existing_job = db.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.track_id == track.id,
            ProcessingJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(ProcessingJob.created_at.asc(), ProcessingJob.id.asc())
    )
    if existing_job is not None:
        return existing_job

    job = ProcessingJob(
        track_id=track.id,
        status="pending",
        job_type=job_type,
        source_path=source_path,
    )
    db.add(job)
    db.flush()
    return job


def claim_next_pending_job(
    db: Session,
    *,
    allowed_types: set[str] | None = None,
    stale_minutes: int = 60,
) -> ProcessingJob | None:
    recover_stale_running_jobs(db, stale_minutes=stale_minutes)
    if allowed_types is None:
        allowed_types = {AUDIO_PROCESSING_JOB_TYPE, VIDEO_EXTRACTION_JOB_TYPE}
    job = db.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.status == "pending",
            ProcessingJob.job_type.in_(allowed_types),
        )
        .order_by(ProcessingJob.created_at.asc(), ProcessingJob.id.asc())
        .with_for_update(skip_locked=True)
    )
    if job is None:
        return None

    job.status = "running"
    job.error_message = None
    job.started_at = datetime.now(UTC)
    job.finished_at = None
    db.commit()
    db.refresh(job)
    return job


def recover_stale_running_jobs(
    db: Session,
    *,
    stale_minutes: int,
    now: datetime | None = None,
    track_id: int | None = None,
) -> int:
    now = now or datetime.now(UTC)
    stale_before = now - timedelta(minutes=stale_minutes)
    running_since = func.coalesce(
        ProcessingJob.started_at,
        ProcessingJob.updated_at,
        ProcessingJob.created_at,
    )
    statement = select(ProcessingJob).where(
        ProcessingJob.status == "running",
        running_since < stale_before,
    )
    if track_id is not None:
        statement = statement.where(ProcessingJob.track_id == track_id)

    stale_jobs = list(db.scalars(statement.with_for_update(skip_locked=True)))
    for job in stale_jobs:
        job.status = "failed"
        job.error_message = STALE_JOB_ERROR
        job.finished_at = now
        track = db.get(Track, job.track_id)
        if track is not None and track.status != "ready":
            track.status = "failed"
    if stale_jobs:
        db.commit()
    return len(stale_jobs)


def retry_failed_processing_job(
    db: Session,
    track: Track,
    storage: MediaStorage,
    *,
    stale_minutes: int,
    now: datetime | None = None,
) -> ProcessingJob:
    locked_track = db.scalar(
        select(Track).where(Track.id == track.id).with_for_update(),
    )
    if locked_track is None:
        raise ProcessingRetryError("Track no longer exists.")
    track = locked_track
    recover_stale_running_jobs(
        db,
        stale_minutes=stale_minutes,
        now=now,
        track_id=track.id,
    )
    active_job = db.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.track_id == track.id,
            ProcessingJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc())
        .with_for_update()
    )
    if active_job is not None:
        raise ProcessingRetryError("This track already has an active processing job.")

    latest_job = db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.track_id == track.id)
        .order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc())
        .with_for_update()
    )
    if latest_job is None or latest_job.status != "failed":
        raise ProcessingRetryError("Only a failed processing job can be retried.")

    original_exists = _stored_file_exists(storage, track.original_file_path)
    if latest_job.job_type == VIDEO_EXTRACTION_JOB_TYPE and not original_exists:
        if not _stored_file_exists(
            storage,
            latest_job.source_path,
            required_subdir=storage.settings.temp_videos_dir,
        ):
            raise ProcessingRetryError(
                "Required source media is missing; upload or import the track again.",
            )
        job_type = VIDEO_EXTRACTION_JOB_TYPE
        source_path = latest_job.source_path
    else:
        if not original_exists:
            raise ProcessingRetryError(
                "Required source media is missing; upload or import the track again.",
            )
        job_type = AUDIO_PROCESSING_JOB_TYPE
        source_path = None

    track.status = "processing"
    job = create_processing_job(
        db,
        track,
        job_type=job_type,
        source_path=source_path,
    )
    db.commit()
    db.refresh(job)
    return job


def _stored_file_exists(
    storage: MediaStorage,
    relative_path: str | None,
    *,
    required_subdir: str | None = None,
) -> bool:
    if not relative_path:
        return False
    try:
        path = storage.stored_media_path(relative_path)
        if required_subdir is not None:
            required_root = storage.stored_media_path(required_subdir)
            if not path.resolve(strict=False).is_relative_to(
                required_root.resolve(strict=False),
            ):
                return False
        return path.is_file()
    except UnsafeMediaPathError:
        return False


def mark_job_succeeded(db: Session, job_id: int) -> ProcessingJob:
    job = _get_job(db, job_id)
    job.status = "succeeded"
    job.error_message = None
    job.finished_at = datetime.now(UTC)
    db.commit()
    db.refresh(job)
    return job


def mark_job_failed(db: Session, job_id: int, error_message: str) -> ProcessingJob:
    job = _get_job(db, job_id)
    job.status = "failed"
    job.error_message = error_message[:MAX_ERROR_MESSAGE_LENGTH]
    job.finished_at = datetime.now(UTC)
    db.commit()
    db.refresh(job)
    return job


def _get_job(db: Session, job_id: int) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        raise ValueError(f"Processing job {job_id} was not found.")
    return job
