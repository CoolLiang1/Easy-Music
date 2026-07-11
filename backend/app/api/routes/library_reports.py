from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.media.storage import MediaStorage, get_media_storage
from app.models.user import User
from app.schemas.library_report import LibraryOrganizationReport
from app.schemas.storage_consistency import StorageConsistencyReport
from app.services import library_reports as report_service
from app.services import storage_consistency as storage_report_service


router = APIRouter(prefix="/library", tags=["library-reports"])


@router.get("/reports", response_model=LibraryOrganizationReport)
def get_library_organization_report(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LibraryOrganizationReport:
    return report_service.build_library_organization_report(db, current_user)


@router.get("/storage-consistency", response_model=StorageConsistencyReport)
def get_storage_consistency_report(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
) -> StorageConsistencyReport:
    return storage_report_service.build_storage_consistency_report(
        db,
        current_user,
        storage,
    )
