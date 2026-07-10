import pytest

from app.auth.tokens import (
    InvalidTokenError,
    create_access_token,
    create_track_stream_token,
    parse_access_token,
    parse_track_stream_token,
)


def test_expired_access_token_is_rejected() -> None:
    token = create_access_token(1, expires_in_minutes=-1)

    with pytest.raises(InvalidTokenError, match="expired"):
        parse_access_token(token)


def test_expired_stream_token_is_rejected() -> None:
    token, _expires_at = create_track_stream_token(
        1,
        track_id=2,
        expires_in_seconds=-1,
    )

    with pytest.raises(InvalidTokenError, match="expired"):
        parse_track_stream_token(token, expected_track_id=2)


@pytest.mark.parametrize("token", ["", "missing-separator", "a.b.c", "not-base64.value"])
def test_malformed_access_token_is_rejected(token: str) -> None:
    with pytest.raises(InvalidTokenError):
        parse_access_token(token)
