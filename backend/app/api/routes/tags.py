from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate
from app.services import tags as tag_service


router = APIRouter(prefix="/tags", tags=["tags"])


def tag_not_found_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Tag not found.",
    )


@router.get("", response_model=list[TagResponse])
def list_tags(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TagResponse]:
    return tag_service.list_tags(db, current_user)


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: TagCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TagResponse:
    return tag_service.create_tag(db, current_user, payload)


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    payload: TagUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TagResponse:
    tag = tag_service.get_tag(db, current_user, tag_id)
    if tag is None:
        raise tag_not_found_error()

    return tag_service.update_tag(db, tag, payload)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    tag = tag_service.get_tag(db, current_user, tag_id)
    if tag is None:
        raise tag_not_found_error()

    tag_service.delete_tag(db, tag)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
