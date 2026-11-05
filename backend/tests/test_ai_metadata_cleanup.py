"""Tests for filename title clean-up and owner-reviewed AI metadata clean-up.

No real provider is called: a fake client returns canned JSON.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes.ai import _get_ai_provider
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.media.titles import clean_filename_title
from app.models.track import Track
from app.models.user import User
from app.schemas.ai import (
    AiCompletionRequest,
    AiCompletionResult,
    AiProviderStatus,
    MetadataChange,
)
from app.services.ai_metadata_cleanup import (
    AI_METADATA_VERSION,
    BATCH_SIZE,
    METADATA_MAX_TOKENS,
    apply_metadata_changes,
    count_pending_tracks,
    suggest_next_batch,
)
from app.services.ai_provider import AiProviderService


# ---------------------------------------------------------------------------
# filename title clean-up
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("stem", "expected"),
    [
        ("The Weeknd - False Alarm (Official Video)", "The Weeknd - False Alarm"),
        ("【头文字D】Rage Your Dream 完整版 高音质", "【头文字D】Rage Your Dream"),
        ("【MyGO!!!!!】春日影 (MyGO!!!!! ver.) 完整版 中日歌词", "【MyGO!!!!!】春日影 (MyGO!!!!! ver.)"),
        ("01 ODESZA - Intro + A Moment Apart [Official Audio]", "ODESZA - Intro + A Moment Apart"),
        ("1. Song", "Song"),
        ("[MV] LiSA - 紅蓮華 (鬼滅の刃 OP) 中日字幕", "LiSA - 紅蓮華 (鬼滅の刃 OP)"),
        ("陈奕迅 - 十年 (Live) 高清", "陈奕迅 - 十年 (Live)"),
        ("Alan_Walker_-_Faded", "Alan Walker - Faded"),
        ("Song [BV1xx411c7mD]", "Song"),
        ("【原神】蒙德城 白天 BGM 1小时循环", "【原神】蒙德城 白天 BGM"),
        ("YOASOBI「アイドル」 Official Music Video", "YOASOBI「アイドル」"),
    ],
)
def test_clean_filename_title_removes_upload_noise(stem: str, expected: str) -> None:
    assert clean_filename_title(stem) == expected


@pytest.mark.parametrize(
    "stem",
    [
        "2 Become 1",
        "1984",
        "Rage Your Dream（头文字D）",
        "secret base ~君がくれたもの~ (10 years after Ver.)",
        "Promise（寂静岭·吉他版）",
        "MyGO!!!!! - 春日影",
        "To the Infinity Castle - Muzan vs Hashira Theme",
    ],
)
def test_clean_filename_title_keeps_meaningful_text(stem: str) -> None:
    assert clean_filename_title(stem) == stem


def test_clean_filename_title_falls_back_when_only_noise_remains() -> None:
    assert clean_filename_title("4K") == "4K"
    assert clean_filename_title("  ") == ""


# ---------------------------------------------------------------------------
# fixtures and helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with sessionmaker(autocommit=False, autoflush=False, bind=engine)() as session:
        yield session


class FakeClient:
    def __init__(self, *responses: AiCompletionResult | Exception):
        self.responses = list(responses)
        self.calls: list[AiCompletionRequest] = []

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        self.calls.append(request)
        response = self.responses.pop(0) if self.responses else AiCompletionResult.ok('{"tracks": []}')
        if isinstance(response, Exception):
            raise response
        return response

    @property
    def prompts(self) -> list[str]:
        return [call.messages[-1]["content"] for call in self.calls]


def make_provider(client: FakeClient, **overrides: Any) -> AiProviderService:
    values: dict[str, Any] = {
        "ai_enabled": True,
        "ai_api_key": "sk-test",
        "ai_model": "test-model",
        "ai_base_url": "",
    }
    values.update(overrides)
    return AiProviderService(Settings(**values), client=client)


def ok_json(tracks: list[dict[str, Any]]) -> AiCompletionResult:
    return AiCompletionResult.ok(json.dumps({"tracks": tracks}))


def truncated() -> AiCompletionResult:
    return AiCompletionResult.error(error_type="output_truncated", message="Provider output was truncated.")


def create_user(db: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash="hash")
    db.add(user)
    db.commit()
    return user


def create_track(
    db: Session,
    user: User,
    title: str,
    *,
    artist: str | None = None,
    status: str = "ready",
    ai_metadata_version: int | None = None,
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist=artist,
        status=status,
        duration_seconds=200,
        ai_metadata_version=ai_metadata_version,
    )
    db.add(track)
    db.commit()
    return track


# ---------------------------------------------------------------------------
# service
# ---------------------------------------------------------------------------


def test_suggestions_are_previews_with_confidence_rules(db_session: Session) -> None:
    user = create_user(db_session)
    known = create_track(db_session, user, "The Weeknd - False Alarm")
    unsure = create_track(db_session, user, "Promise 吉他版")
    clean = create_track(db_session, user, "Lemon", artist="米津玄師")
    tagged = create_track(db_session, user, "Animals", artist="Maroon5")
    client = FakeClient(
        ok_json(
            [
                {"track_id": known.id, "title": "False Alarm", "artist": "The Weeknd", "artist_confidence": 0.95},
                {"track_id": unsure.id, "title": "Promise (吉他版)", "artist": "Akira Yamaoka", "artist_confidence": 0.3},
                {"track_id": clean.id, "title": "Lemon", "artist": "米津玄師", "artist_confidence": 0.99},
                {"track_id": tagged.id, "title": "Animals", "artist": "Maroon 5", "artist_confidence": 0.9},
            ],
        ),
    )

    result, next_after_id, remaining = suggest_next_batch(db_session, make_provider(client), user_id=user.id)

    assert result.ok
    assert next_after_id == tagged.id
    assert remaining == 0
    assert sorted(result.reviewed_track_ids) == sorted([known.id, unsure.id, clean.id, tagged.id])
    by_id = {s.track_id: s for s in result.suggestions}
    assert set(by_id) == {known.id, unsure.id, tagged.id}  # unchanged track has no row

    assert by_id[known.id].suggested_title == "False Alarm"
    assert by_id[known.id].suggested_artist == "The Weeknd"
    assert by_id[known.id].title_selected and by_id[known.id].artist_selected

    # Low confidence artist is dropped entirely.
    assert by_id[unsure.id].suggested_artist is None
    assert not by_id[unsure.id].artist_changed
    assert by_id[unsure.id].artist_confidence == 0.0

    # Replacing an existing artist is offered but never pre-selected.
    assert by_id[tagged.id].artist_changed
    assert not by_id[tagged.id].artist_selected
    assert not by_id[tagged.id].title_changed

    # Nothing is saved by a preview.
    db_session.expire_all()
    assert db_session.get(Track, known.id).title == "The Weeknd - False Alarm"
    assert db_session.get(Track, known.id).ai_metadata_version is None


def test_mid_confidence_artist_is_offered_but_not_preselected(db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "天空之城 钢琴版")
    client = FakeClient(
        ok_json([{"track_id": track.id, "title": "天空之城（钢琴版）", "artist": "久石譲", "artist_confidence": 0.7}]),
    )

    result, _, _ = suggest_next_batch(db_session, make_provider(client), user_id=user.id)

    suggestion = result.suggestions[0]
    assert suggestion.artist_changed
    assert suggestion.artist_confidence == 0.7
    assert not suggestion.artist_selected
    assert suggestion.title_selected


def test_batches_walk_pending_owner_tracks_by_cursor(db_session: Session) -> None:
    user = create_user(db_session)
    other = create_user(db_session, "other")
    tracks = [create_track(db_session, user, f"T{index}") for index in range(BATCH_SIZE + 2)]
    create_track(db_session, user, "done", ai_metadata_version=AI_METADATA_VERSION)
    create_track(db_session, user, "processing", status="processing")
    create_track(db_session, other, "foreign")
    client = FakeClient()
    provider = make_provider(client)

    assert count_pending_tracks(db_session, user_id=user.id) == BATCH_SIZE + 2

    _, cursor, remaining = suggest_next_batch(db_session, provider, user_id=user.id)
    assert cursor == tracks[BATCH_SIZE - 1].id
    assert remaining == 2
    _, cursor, remaining = suggest_next_batch(db_session, provider, user_id=user.id, after_id=cursor)
    assert cursor == tracks[-1].id
    assert remaining == 0
    result, cursor, remaining = suggest_next_batch(db_session, provider, user_id=user.id, after_id=cursor)
    assert cursor is None and remaining == 0 and result.suggestions == []

    assert len(client.calls) == 2
    assert all(call.max_tokens == METADATA_MAX_TOKENS for call in client.calls)
    first_prompt = client.prompts[0]
    assert f"- track_id: {tracks[0].id}" in first_prompt
    assert "foreign" not in first_prompt and "done" not in first_prompt


def test_unknown_and_unanswered_ids_are_ignored(db_session: Session) -> None:
    user = create_user(db_session)
    answered = create_track(db_session, user, "A_song")
    skipped = create_track(db_session, user, "B_song")
    client = FakeClient(
        ok_json(
            [
                {"track_id": answered.id, "title": "A song", "artist": None},
                {"track_id": 9999, "title": "Invented", "artist": "Nobody", "artist_confidence": 1},
                {"title": "no id"},
            ],
        ),
    )

    result, _, _ = suggest_next_batch(db_session, make_provider(client), user_id=user.id)

    assert result.reviewed_track_ids == [answered.id]  # skipped stays pending
    assert [s.track_id for s in result.suggestions] == [answered.id]
    assert skipped.id not in result.reviewed_track_ids


def test_truncated_batch_is_split_and_retried(db_session: Session) -> None:
    user = create_user(db_session)
    tracks = [create_track(db_session, user, f"S_{index}") for index in range(3)]

    class SplittingClient(FakeClient):
        def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
            self.calls.append(request)
            lines = set(request.messages[-1]["content"].splitlines())
            ids = [track.id for track in tracks if f"- track_id: {track.id}" in lines]
            if len(ids) > 1:
                return truncated()
            return ok_json([{"track_id": ids[0], "title": f"S {ids[0]}"}])

    client = SplittingClient()
    result, _, _ = suggest_next_batch(db_session, make_provider(client), user_id=user.id)

    assert result.ok
    assert sorted(result.reviewed_track_ids) == [track.id for track in tracks]
    assert len(client.calls) == 5


@pytest.mark.parametrize(
    ("response", "expected_status"),
    [
        (truncated(), AiProviderStatus.ERROR),
        (AiCompletionResult.ok("not json at all"), AiProviderStatus.ERROR),
        (RuntimeError("network down"), AiProviderStatus.ERROR),
    ],
)
def test_failures_return_error_without_suggestions(
    db_session: Session,
    response: AiCompletionResult | Exception,
    expected_status: AiProviderStatus,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Only")
    client = FakeClient(response, response, response)

    result, _, _ = suggest_next_batch(db_session, make_provider(client), user_id=user.id)

    assert result.provider_status == expected_status
    assert result.error
    assert result.suggestions == [] and result.reviewed_track_ids == []


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"ai_enabled": False}, AiProviderStatus.DISABLED),
        ({"ai_api_key": ""}, AiProviderStatus.UNCONFIGURED),
    ],
)
def test_unavailable_provider_makes_no_call(
    db_session: Session,
    overrides: dict[str, Any],
    expected: AiProviderStatus,
) -> None:
    user = create_user(db_session)
    create_track(db_session, user, "Only")
    client = FakeClient()

    result, _, _ = suggest_next_batch(db_session, make_provider(client, **overrides), user_id=user.id)

    assert result.provider_status == expected
    assert client.calls == []


def test_apply_saves_accepted_fields_and_marks_reviewed(db_session: Session) -> None:
    user = create_user(db_session)
    other = create_user(db_session, "other")
    both = create_track(db_session, user, "The Weeknd - False Alarm")
    title_only = create_track(db_session, user, "Animals 高清", artist="Maroon 5")
    rejected = create_track(db_session, user, "Sold Out")
    foreign = create_track(db_session, other, "Foreign")

    updated, reviewed = apply_metadata_changes(
        db_session,
        user_id=user.id,
        changes=[
            MetadataChange(track_id=both.id, title="False Alarm", artist="The Weeknd"),
            MetadataChange(track_id=title_only.id, title="  Animals  "),
            MetadataChange(track_id=foreign.id, title="Hijacked"),
        ],
        reviewed_track_ids=[both.id, title_only.id, rejected.id, foreign.id],
    )

    assert (updated, reviewed) == (2, 3)
    db_session.expire_all()
    saved = db_session.get(Track, both.id)
    assert (saved.title, saved.artist) == ("False Alarm", "The Weeknd")
    assert "title=false alarm" in saved.normalized_metadata_key
    assert "artist=the weeknd" in saved.normalized_metadata_key
    saved = db_session.get(Track, title_only.id)
    assert (saved.title, saved.artist) == ("Animals", "Maroon 5")
    assert db_session.get(Track, rejected.id).title == "Sold Out"
    for track_id in (both.id, title_only.id, rejected.id):
        assert db_session.get(Track, track_id).ai_metadata_version == AI_METADATA_VERSION
    assert db_session.get(Track, foreign.id).title == "Foreign"
    assert db_session.get(Track, foreign.id).ai_metadata_version is None
    assert count_pending_tracks(db_session, user_id=user.id) == 0


def test_apply_ignores_blank_title(db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "Keep")

    updated, _ = apply_metadata_changes(
        db_session,
        user_id=user.id,
        changes=[MetadataChange(track_id=track.id, title="   ")],
        reviewed_track_ids=[],
    )

    assert updated == 0
    db_session.expire_all()
    assert db_session.get(Track, track.id).title == "Keep"


# ---------------------------------------------------------------------------
# Web endpoints
# ---------------------------------------------------------------------------


@pytest.fixture
def api(db_session: Session) -> Generator[tuple[TestClient, Any]]:
    app = create_app()

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, app


def install_provider(app: Any, client: FakeClient, **overrides: Any) -> None:
    app.dependency_overrides[_get_ai_provider] = lambda: make_provider(client, **overrides)


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_metadata_endpoints_require_authentication(api: tuple[TestClient, Any]) -> None:
    client, _ = api

    assert client.get("/api/ai/metadata-cleanup/status").status_code == 401
    assert client.post("/api/ai/metadata-cleanup/next-batch", json={}).status_code == 401
    assert client.post("/api/ai/metadata-cleanup/apply", json={}).status_code == 401


def test_review_flow_through_endpoints(api: tuple[TestClient, Any], db_session: Session) -> None:
    client, app = api
    user = create_user(db_session)
    track = create_track(db_session, user, "Maroon 5 - Animals")
    create_track(db_session, user, "done", ai_metadata_version=AI_METADATA_VERSION)
    install_provider(
        app,
        FakeClient(ok_json([{"track_id": track.id, "title": "Animals", "artist": "Maroon 5", "artist_confidence": 0.98}])),
    )

    status_response = client.get("/api/ai/metadata-cleanup/status", headers=auth(user))
    assert status_response.json() == {
        "provider_status": "ok",
        "pending_count": 1,
        "pending_tracks": [
            {"track_id": track.id, "title": "Maroon 5 - Animals", "artist": None, "duration_seconds": 200},
        ],
    }

    batch = client.post("/api/ai/metadata-cleanup/next-batch", json={}, headers=auth(user)).json()
    assert batch["provider_status"] == "ok"
    assert batch["next_after_id"] == track.id
    assert batch["remaining_count"] == 0
    assert batch["reviewed_track_ids"] == [track.id]
    suggestion = batch["suggestions"][0]
    assert suggestion["suggested_title"] == "Animals"
    assert suggestion["suggested_artist"] == "Maroon 5"
    assert suggestion["title_selected"] and suggestion["artist_selected"]

    applied = client.post(
        "/api/ai/metadata-cleanup/apply",
        json={
            "changes": [{"track_id": track.id, "title": "Animals", "artist": "Maroon 5"}],
            "reviewed_track_ids": batch["reviewed_track_ids"],
        },
        headers=auth(user),
    )
    assert applied.json() == {"updated_count": 1, "reviewed_count": 1}
    status_response = client.get("/api/ai/metadata-cleanup/status", headers=auth(user))
    assert status_response.json()["pending_count"] == 0
    assert status_response.json()["pending_tracks"] == []


def test_status_lists_only_owner_pending_ready_tracks_in_order(
    api: tuple[TestClient, Any],
    db_session: Session,
) -> None:
    client, app = api
    user = create_user(db_session)
    other = create_user(db_session, "other")
    first = create_track(db_session, user, "First", artist="A")
    create_track(db_session, user, "Reviewed", ai_metadata_version=AI_METADATA_VERSION)
    create_track(db_session, user, "Processing", status="processing")
    create_track(db_session, other, "Foreign")
    second = create_track(db_session, user, "Second")
    install_provider(app, FakeClient(), ai_enabled=False)

    body = client.get("/api/ai/metadata-cleanup/status", headers=auth(user)).json()

    assert body["provider_status"] == "disabled"
    assert body["pending_count"] == 2
    assert [item["track_id"] for item in body["pending_tracks"]] == [first.id, second.id]
    assert body["pending_tracks"][0]["artist"] == "A"


def test_next_batch_reports_disabled_provider(api: tuple[TestClient, Any], db_session: Session) -> None:
    client, app = api
    user = create_user(db_session)
    create_track(db_session, user, "Only")
    install_provider(app, FakeClient(), ai_enabled=False)

    batch = client.post("/api/ai/metadata-cleanup/next-batch", json={}, headers=auth(user))

    assert batch.status_code == 200
    assert batch.json()["provider_status"] == "disabled"
    assert batch.json()["suggestions"] == []
