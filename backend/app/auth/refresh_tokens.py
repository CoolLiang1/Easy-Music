"""Opaque, rotating refresh tokens that keep a client signed in.

Only a SHA-256 hash of each token is stored. Every successful refresh revokes
the presented token and issues a new one with a full lifetime, so a client that
is opened at least once per ``REFRESH_TOKEN_EXPIRE_DAYS`` stays signed in.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.refresh_token import RefreshToken
from app.models.user import User


# A token revoked by rotation stays usable this long, so two requests from the
# same client that refresh at the same moment do not sign the owner out.
ROTATION_GRACE_SECONDS = 60


class InvalidRefreshTokenError(ValueError):
    pass


@dataclass(frozen=True)
class IssuedRefreshToken:
    token: str
    expires_at: datetime


def issue_refresh_token(db: Session, user: User) -> IssuedRefreshToken:
    now = _utcnow()
    _delete_stale_tokens(db, user.id, now)

    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(days=get_settings().refresh_token_expire_days)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=expires_at,
        ),
    )
    db.commit()
    return IssuedRefreshToken(token=token, expires_at=expires_at)


def rotate_refresh_token(db: Session, token: str) -> tuple[User, IssuedRefreshToken]:
    """Validate ``token``, revoke it, and return its user with a new token."""
    now = _utcnow()
    record = _find_token(db, token)
    if record is None:
        raise InvalidRefreshTokenError("Unknown refresh token.")

    if _as_aware_utc(record.expires_at) <= now:
        raise InvalidRefreshTokenError("Refresh token expired.")

    if record.revoked_at is not None:
        revoked_for = now - _as_aware_utc(record.revoked_at)
        if revoked_for > timedelta(seconds=ROTATION_GRACE_SECONDS):
            raise InvalidRefreshTokenError("Refresh token revoked.")
    else:
        record.revoked_at = now

    user = db.get(User, record.user_id)
    if user is None:
        raise InvalidRefreshTokenError("Refresh token user no longer exists.")

    return user, issue_refresh_token(db, user)


def revoke_refresh_token(db: Session, token: str) -> None:
    record = _find_token(db, token)
    if record is None or record.revoked_at is not None:
        return

    # Logout is final: do not leave the rotation grace window open.
    record.revoked_at = _utcnow() - timedelta(seconds=ROTATION_GRACE_SECONDS + 1)
    db.commit()


def _find_token(db: Session, token: str) -> RefreshToken | None:
    if not token:
        return None
    return db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_token(token)),
    )


def _delete_stale_tokens(db: Session, user_id: int, now: datetime) -> None:
    revoked_cutoff = now - timedelta(seconds=ROTATION_GRACE_SECONDS)
    db.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user_id,
            (RefreshToken.expires_at <= now)
            | (RefreshToken.revoked_at <= revoked_cutoff),
        )
        .execution_options(synchronize_session="fetch"),
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_aware_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone-aware columns.
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
