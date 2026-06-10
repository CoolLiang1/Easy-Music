from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.imports import ImportConfigurationResponse, ImportScanRequest, ImportScanResponse
from app.services.imports import (
    ImportConfigurationError,
    ImportPathSafetyError,
    ImportRootPolicy,
    ImportScanError,
    get_import_root_policy,
)


router = APIRouter(prefix="/imports", tags=["imports"])


@router.get("/configuration", response_model=ImportConfigurationResponse)
def get_import_configuration(
    current_user: Annotated[User, Depends(get_current_user)],
    policy: Annotated[ImportRootPolicy, Depends(get_import_root_policy)],
) -> ImportConfigurationResponse:
    _ = current_user
    try:
        return policy.get_configuration_response()
    except (ImportConfigurationError, ImportPathSafetyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/scan", response_model=ImportScanResponse)
def scan_import_directory(
    request: ImportScanRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    policy: Annotated[ImportRootPolicy, Depends(get_import_root_policy)],
) -> ImportScanResponse:
    _ = current_user
    try:
        return policy.scan_audio_preview(request.root_id, request.relative_subdir)
    except (ImportConfigurationError, ImportPathSafetyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ImportScanError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
