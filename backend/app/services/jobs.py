from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.processing_job import ProcessingJob
from app.models.track import Track


ACTIVE_JOB_STATUSES = {"pending", "running"}
PROCESSING_JOB_STATUSES = {"pending", "running", "succeeded", "failed"}
MAX_ERROR_MESSAGE_LENGTH = 4000


def create_processing_job(db: Session, track: Track) -> ProcessingJob:
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

    job = ProcessingJob(track_id=track.id, status="pending")
    db.add(job)
    db.flush()
    return job


def claim_next_pending_job(db: Session) -> ProcessingJob | None:
    job = db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.status == "pending")
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
