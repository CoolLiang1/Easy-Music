from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.password import verify_password
from app.auth.tokens import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse


router = APIRouter(prefix="/auth", tags=["auth"])


def invalid_credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == credentials.username))
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise invalid_credentials_error()

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout")
def logout(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    return {"status": "logged_out"}


@router.get("/me", response_model=CurrentUserResponse)
def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user

