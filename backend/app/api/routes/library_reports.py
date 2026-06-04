from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.library_report import LibraryOrganizationReport
from app.services import library_reports as report_service


router = APIRouter(prefix="/library", tags=["library-reports"])


@router.get("/reports", response_model=LibraryOrganizationReport)
def get_library_organization_report(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LibraryOrganizationReport:
    return report_service.build_library_organization_report(db, current_user)
