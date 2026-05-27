from sqlalchemy.orm import Session

from app.media.storage import MediaStorage
from app.models.processing_job import ProcessingJob
from app.models.track import Track
from app.services.jobs import claim_next_pending_job, mark_job_failed, mark_job_succeeded
from app.services.processing import process_track


def process_one_track(
    db: Session,
    track_id: int,
    storage: MediaStorage | None = None,
) -> Track:
    return process_track(db, track_id, storage or MediaStorage())


def process_next_job(
    db: Session,
    storage: MediaStorage | None = None,
) -> ProcessingJob | None:
    job = claim_next_pending_job(db)
    if job is None:
        return None

    job_id = job.id
    try:
        process_track(db, job.track_id, storage or MediaStorage())
    except Exception as exc:
        return mark_job_failed(db, job_id, str(exc) or exc.__class__.__name__)

    return mark_job_succeeded(db, job_id)
