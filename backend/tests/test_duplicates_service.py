from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import hash_password
from app.db.base import Base
from app.models.track import Track
from app.models.user import User
from app.services.duplicates import find_duplicate_candidates


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        yield session


def create_user(db_session: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash=hash_password("correct-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def create_track(
    db_session: Session,
    user: User,
    title: str = "Track",
    *,
    artist: str | None = "Artist",
    album: str | None = "Album",
    duration_seconds: int | None = 180,
    original_file_sha256: str | None = None,
    playback_file_sha256: str | None = None,
    status: str = "ready",
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist=artist,
        album=album,
        duration_seconds=duration_seconds,
        content_type="song",
        original_file_path=f"originals/{title}.mp3",
        original_file_size_bytes=123,
        original_file_sha256=original_file_sha256,
        playback_file_path=f"playback/{title}.mp3",
        playback_file_sha256=playback_file_sha256,
        cover_path=None,
        source_url=None,
        format="mp3",
        bitrate=320,
        normalized_metadata_key=None,
        status=status,
        liked=False,
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_finds_exact_duplicate_candidates_by_original_file_hash(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", original_file_sha256="same-hash")
    second = create_track(db_session, user, "Second", original_file_sha256="same-hash")
    create_track(db_session, user, "Unique", original_file_sha256="other-hash")

    groups = find_duplicate_candidates(db_session, user)

    assert len(groups) == 1
    assert groups[0].group_id == "exact_file:original:same-hash"
    assert groups[0].match_type == "exact_file"
    assert groups[0].confidence == 1.0
    assert groups[0].reason == "Tracks share the same original file SHA-256."
    assert groups[0].candidate_track_ids == [first.id, second.id]


def test_finds_exact_duplicate_candidates_by_playback_file_hash(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", playback_file_sha256="same-playback")
    second = create_track(db_session, user, "Second", playback_file_sha256="same-playback")

    groups = find_duplicate_candidates(db_session, user)

    assert len(groups) == 1
    assert groups[0].group_id == "exact_file:playback:same-playback"
    assert groups[0].match_type == "exact_file"
    assert groups[0].reason == "Tracks share the same playback file SHA-256."
    assert groups[0].candidate_track_ids == [first.id, second.id]


def test_finds_likely_duplicate_candidates_by_metadata_and_close_duration(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    first = create_track(
        db_session,
        user,
        "  My   Song ",
        artist="ARTIST",
        duration_seconds=180,
    )
    second = create_track(
        db_session,
        user,
        "my song",
        artist="artist",
        duration_seconds=182,
    )
    create_track(db_session, user, "my song", artist="artist", duration_seconds=190)

    groups = find_duplicate_candidates(db_session, user)

    assert len(groups) == 1
    assert groups[0].group_id.startswith("metadata_duration:")
    assert groups[0].match_type == "metadata_duration"
    assert groups[0].confidence == 0.8
    assert groups[0].reason == (
        "Tracks have matching normalized title and artist with duration "
        "within 2 seconds."
    )
    assert groups[0].candidate_track_ids == [first.id, second.id]


def test_ignores_tracks_with_insufficient_metadata(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Untitled", artist=None, duration_seconds=180)
    create_track(db_session, user, "Untitled", artist=None, duration_seconds=181)
    create_track(db_session, user, "No Duration", artist="Artist", duration_seconds=None)
    create_track(db_session, user, "No Duration", artist="Artist", duration_seconds=None)

    assert find_duplicate_candidates(db_session, user) == []


def test_duplicate_candidates_are_scoped_to_current_user(
    db_session: Session,
) -> None:
    owner = create_user(db_session)
    other_user = create_user(db_session, username="other")
    create_track(db_session, owner, "Owner", original_file_sha256="same-hash")
    create_track(db_session, other_user, "Hidden", original_file_sha256="same-hash")

    assert find_duplicate_candidates(db_session, owner) == []


def test_failed_and_processing_tracks_are_ignored(
    db_session: Session,
) -> None:
    user = create_user(db_session)
    ready = create_track(db_session, user, "Ready", original_file_sha256="same-hash")
    create_track(
        db_session,
        user,
        "Processing",
        original_file_sha256="same-hash",
        status="processing",
    )
    create_track(
        db_session,
        user,
        "Failed",
        original_file_sha256="same-hash",
        status="failed",
    )
    other_ready = create_track(db_session, user, "Other Ready", original_file_sha256="same-hash")

    groups = find_duplicate_candidates(db_session, user)

    assert len(groups) == 1
    assert groups[0].candidate_track_ids == [ready.id, other_ready.id]


def test_service_does_not_mutate_tracks(db_session: Session) -> None:
    user = create_user(db_session)
    first = create_track(db_session, user, "First", original_file_sha256="same-hash")
    second = create_track(db_session, user, "Second", original_file_sha256="same-hash")

    find_duplicate_candidates(db_session, user)

    db_session.refresh(first)
    db_session.refresh(second)
    assert first.status == "ready"
    assert second.status == "ready"
    assert not db_session.dirty
