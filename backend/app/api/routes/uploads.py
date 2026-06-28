from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.media.storage import MediaStorage, get_media_storage
from app.models.user import User
from app.schemas.track import TrackResponse
from app.services import tracks as track_service
from app.services import uploads as upload_service
from app.services import video_uploads as video_upload_service


router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.post(
    "/upload",
    response_model=TrackResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_track(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
) -> TrackResponse:
    track = upload_service.create_uploaded_track(db, current_user, file, storage)
    return track_service.build_track_response(db, track)


@router.post(
    "/upload-video",
    response_model=TrackResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_video_track(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
) -> TrackResponse:
    track = video_upload_service.create_video_upload_track(
        db,
        current_user,
        file,
        storage,
    )
    return track_service.build_track_response(db, track)
