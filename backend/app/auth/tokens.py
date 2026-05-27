import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import get_settings


class InvalidTokenError(ValueError):
    pass


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload: str, secret_key: str) -> str:
    signature = hmac.new(
        secret_key.encode("utf-8"),
        payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _encode(signature)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes,
    )
    payload = {
        "sub": str(user_id),
        "exp": int(expires_at.timestamp()),
    }
    encoded_payload = _encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8"),
    )
    signature = _sign(encoded_payload, settings.app_secret_key)
    return f"{encoded_payload}.{signature}"


def parse_access_token(token: str) -> int:
    settings = get_settings()

    try:
        encoded_payload, signature = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise InvalidTokenError("Invalid token format.") from exc

    expected_signature = _sign(encoded_payload, settings.app_secret_key)
    if not hmac.compare_digest(signature, expected_signature):
        raise InvalidTokenError("Invalid token signature.")

    try:
        payload: dict[str, Any] = json.loads(_decode(encoded_payload))
        user_id = int(payload["sub"])
        expires_at = int(payload["exp"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise InvalidTokenError("Invalid token payload.") from exc

    if datetime.now(UTC).timestamp() >= expires_at:
        raise InvalidTokenError("Token expired.")

    return user_id

