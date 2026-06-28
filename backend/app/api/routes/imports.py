from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.media.storage import MediaStorage, get_media_storage
from app.models.user import User
from app.schemas.imports import (
    ImportBatchResponse,
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportConfigurationResponse,
    ImportScanRequest,
    ImportScanResponse,
)
from app.services.imports import (
    ImportConfigurationError,
    ImportPathSafetyError,
    ImportRootPolicy,
    ImportConfirmError,
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


@router.get("/batches/latest", response_model=ImportBatchResponse | None)
def get_latest_import_batch(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    policy: Annotated[ImportRootPolicy, Depends(get_import_root_policy)],
) -> ImportBatchResponse | None:
    try:
        return policy.latest_import_batch(db, current_user)
    except (ImportConfigurationError, ImportPathSafetyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/batches/{batch_id}", response_model=ImportBatchResponse)
def get_import_batch(
    batch_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    policy: Annotated[ImportRootPolicy, Depends(get_import_root_policy)],
) -> ImportBatchResponse:
    try:
        batch = policy.get_import_batch(db, current_user, batch_id)
    except (ImportConfigurationError, ImportPathSafetyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import batch not found.")
    return batch


@router.post("", response_model=ImportConfirmResponse)
def confirm_audio_import(
    request: ImportConfirmRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[MediaStorage, Depends(get_media_storage)],
    policy: Annotated[ImportRootPolicy, Depends(get_import_root_policy)],
) -> ImportConfirmResponse:
    try:
        return policy.confirm_audio_import(
            db=db,
            user=current_user,
            root_id=request.root_id,
            relative_paths=[selection.relative_path for selection in request.files],
            storage=storage,
        )
    except (ImportConfigurationError, ImportPathSafetyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ImportConfirmError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
