from sqlalchemy.orm import Session

from app.media.storage import MediaStorage
from app.models.track import Track
from app.services.processing import process_track


def process_one_track(
    db: Session,
    track_id: int,
    storage: MediaStorage | None = None,
) -> Track:
    return process_track(db, track_id, storage or MediaStorage())
