from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import bearer_scheme, get_current_user
from app.auth.password import verify_password
from app.auth.refresh_tokens import (
    InvalidRefreshTokenError,
    IssuedRefreshToken,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.auth.tokens import create_access_token
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def invalid_credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def invalid_refresh_token_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expired. Please sign in again.",
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

    return _token_response(db, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: RefreshRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    try:
        user, issued = rotate_refresh_token(db, request.refresh_token)
    except InvalidRefreshTokenError as exc:
        db.rollback()
        raise invalid_refresh_token_error() from exc

    return _build_token_response(user, issued)


@router.post("/logout")
def logout(
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    request: LogoutRequest | None = None,
) -> dict[str, str]:
    # Possession of the refresh token is enough to revoke it, so a client whose
    # access token already expired can still sign out cleanly.
    if request is not None and request.refresh_token:
        revoke_refresh_token(db, request.refresh_token)
    else:
        get_current_user(credentials, db)

    return {"status": "logged_out"}


@router.get("/me", response_model=CurrentUserResponse)
def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


def _token_response(db: Session, user: User) -> TokenResponse:
    return _build_token_response(user, issue_refresh_token(db, user))


def _build_token_response(user: User, issued: IssuedRefreshToken) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=get_settings().access_token_expire_minutes * 60,
        refresh_token=issued.token,
        refresh_token_expires_at=issued.expires_at,
    )
