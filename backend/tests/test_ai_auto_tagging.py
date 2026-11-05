"""Tests for batch AI auto-tagging, the idle worker hook, and the backfill CLI.

No real provider is called: a fake client returns canned JSON.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes.ai import _get_ai_provider
from app.auth.tokens import create_access_token
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_tag import TrackTag
from app.models.user import User
from app.schemas.ai import AiCompletionRequest, AiCompletionResult, AiProviderStatus
from app.services.ai_auto_tagging import (
    AI_AUTO_TAGGING_VERSION,
    AUTO_TAG_MAX_TOKENS,
    MAX_AI_TAGS_PER_TRACK,
    WEB_BATCH_SIZE,
    AutoTagBatchResult,
    auto_tag_batch,
    auto_tag_tracks,
    list_tracks_needing_auto_tagging,
)
from app.services.ai_provider import AiProviderService
from app.worker import autotag as autotag_cli
from app.worker.jobs import auto_tag_next_batch
from app.worker.main import AutoTagThrottle, run_idle_auto_tagging


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


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "ai_enabled": True,
        "ai_api_key": "sk-test",
        "ai_model": "test-model",
        "ai_base_url": "",
        "ai_auto_tagging_enabled": True,
        "ai_auto_tagging_min_confidence": 0.6,
    }
    values.update(overrides)
    return Settings(**values)


def make_provider(client: FakeClient, **overrides: Any) -> AiProviderService:
    return AiProviderService(make_settings(**overrides), client=client)


def ok_json(tracks: list[dict[str, Any]]) -> AiCompletionResult:
    return AiCompletionResult.ok(json.dumps({"tracks": tracks}))


def create_user(db: Session, username: str = "owner") -> User:
    user = User(username=username, password_hash="hash")
    db.add(user)
    db.commit()
    return user


def create_tag(db: Session, user: User, group: str, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name, group=group)
    db.add(tag)
    db.commit()
    return tag


def create_track(
    db: Session,
    user: User,
    title: str,
    *,
    status: str = "ready",
    ai_tags_version: int | None = None,
) -> Track:
    track = Track(
        user_id=user.id,
        title=title,
        artist="Artist",
        album="Album",
        duration_seconds=3725,
        content_type="song",
        original_file_path=f"originals/{title}.mp3",
        status=status,
        ai_tags_version=ai_tags_version,
    )
    db.add(track)
    db.commit()
    return track


def tag_rows(db: Session, track: Track) -> dict[int, tuple[str, float]]:
    db.expire_all()
    return {
        row.tag_id: (row.source, row.confidence)
        for row in db.scalars(select(TrackTag).where(TrackTag.track_id == track.id))
    }


@pytest.fixture
def library(db_session: Session) -> dict[str, Any]:
    user = create_user(db_session)
    return {
        "user": user,
        "study": create_tag(db_session, user, "scene", "Study"),
        "sleep": create_tag(db_session, user, "scene", "Sleep"),
        "anime": create_tag(db_session, user, "type", "Anime"),
        "calm": create_tag(db_session, user, "feature", "Calm"),
    }


# ---------------------------------------------------------------------------
# selection
# ---------------------------------------------------------------------------


def test_list_tracks_needing_auto_tagging_skips_current_and_unready(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    user = library["user"]
    new = create_track(db_session, user, "new")
    create_track(db_session, user, "current", ai_tags_version=AI_AUTO_TAGGING_VERSION)
    old = create_track(db_session, user, "old rule", ai_tags_version=AI_AUTO_TAGGING_VERSION - 1)
    create_track(db_session, user, "processing", status="processing")

    assert list_tracks_needing_auto_tagging(db_session) == [new.id, old.id]
    assert list_tracks_needing_auto_tagging(db_session, limit=1) == [new.id]
    assert len(list_tracks_needing_auto_tagging(db_session, include_current=True)) == 3


# ---------------------------------------------------------------------------
# applying tags
# ---------------------------------------------------------------------------


def test_batch_applies_confident_catalogue_tags_and_marks_tracks(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    user = library["user"]
    first = create_track(db_session, user, "Track A")
    second = create_track(db_session, user, "Track B")
    client = FakeClient(
        ok_json(
            [
                {
                    "track_id": first.id,
                    "tags": [
                        {"tag_id": library["study"].id, "confidence": 0.82},
                        {"tag_id": library["anime"].id, "confidence": 1.4},  # clamped
                        {"tag_id": library["calm"].id, "confidence": 0.3},  # below threshold
                    ],
                },
                # second track returned with no tags
                {"track_id": second.id, "tags": []},
            ],
        ),
    )

    result = auto_tag_batch(
        db_session,
        make_provider(client),
        [first.id, second.id],
        min_confidence=0.6,
    )

    assert result.ok
    assert result.tagged_track_ids == [first.id, second.id]
    assert result.applied_tag_count == 2
    assert tag_rows(db_session, first) == {
        library["study"].id: ("ai", 0.82),
        library["anime"].id: ("ai", 1.0),
    }
    assert tag_rows(db_session, second) == {}
    assert first.ai_tags_version == AI_AUTO_TAGGING_VERSION
    assert second.ai_tags_version == AI_AUTO_TAGGING_VERSION
    assert len(client.calls) == 1


def test_prompt_lists_catalogue_tracks_duration_and_owner_tags(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    track = create_track(db_session, library["user"], "Long Mix")
    db_session.add(TrackTag(track_id=track.id, tag_id=library["sleep"].id))
    db_session.commit()
    client = FakeClient(ok_json([{"track_id": track.id, "tags": []}]))

    auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    prompt = client.prompts[0]
    assert f"[scene] id:{library['study'].id} Study" in prompt
    assert f"- track_id: {track.id}" in prompt
    assert "title: Long Mix" in prompt
    assert "duration: 62:05" in prompt
    assert "original_filename: Long Mix.mp3" in prompt
    assert "owner_tags: [scene] Sleep" in prompt


def test_invented_foreign_and_out_of_batch_ids_are_dropped(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    user = library["user"]
    intruder = create_user(db_session, "intruder")
    foreign_tag = create_tag(db_session, intruder, "scene", "Foreign")
    track = create_track(db_session, user, "Mine")
    other = create_track(db_session, user, "Not in batch")
    client = FakeClient(
        ok_json(
            [
                {
                    "track_id": track.id,
                    "tags": [
                        {"tag_id": 9999, "confidence": 0.9},
                        {"tag_id": foreign_tag.id, "confidence": 0.9},
                        {"tag_id": library["calm"].id, "confidence": 0.9},
                    ],
                },
                {"track_id": other.id, "tags": [{"tag_id": library["calm"].id, "confidence": 0.9}]},
            ],
        ),
    )

    result = auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert result.ok
    assert tag_rows(db_session, track) == {library["calm"].id: ("ai", 0.9)}
    assert tag_rows(db_session, other) == {}
    assert other.ai_tags_version is None
    assert "Foreign" not in client.prompts[0]


def test_owner_tags_are_never_changed_or_duplicated(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    track = create_track(db_session, library["user"], "Owned")
    db_session.add(TrackTag(track_id=track.id, tag_id=library["study"].id))
    db_session.commit()
    client = FakeClient(
        ok_json(
            [
                {
                    "track_id": track.id,
                    "tags": [
                        {"tag_id": library["study"].id, "confidence": 0.95},
                        {"tag_id": library["calm"].id, "confidence": 0.7},
                    ],
                },
            ],
        ),
    )

    auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert tag_rows(db_session, track) == {
        library["study"].id: ("user", 1.0),
        library["calm"].id: ("ai", 0.7),
    }


def test_retag_replaces_previous_ai_rows_only(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    track = create_track(db_session, library["user"], "Retag", ai_tags_version=AI_AUTO_TAGGING_VERSION)
    db_session.add_all(
        [
            TrackTag(track_id=track.id, tag_id=library["study"].id),
            TrackTag(track_id=track.id, tag_id=library["sleep"].id, source="ai", confidence=0.7),
            TrackTag(track_id=track.id, tag_id=library["calm"].id, source="ai", confidence=0.7),
        ],
    )
    db_session.commit()
    client = FakeClient(
        ok_json(
            [
                {
                    "track_id": track.id,
                    "tags": [
                        {"tag_id": library["calm"].id, "confidence": 0.9},
                        {"tag_id": library["anime"].id, "confidence": 0.8},
                    ],
                },
            ],
        ),
    )

    auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert tag_rows(db_session, track) == {
        library["study"].id: ("user", 1.0),
        library["calm"].id: ("ai", 0.9),
        library["anime"].id: ("ai", 0.8),
    }


def test_applied_tags_are_capped_per_track(db_session: Session) -> None:
    user = create_user(db_session)
    tags = [create_tag(db_session, user, "feature", f"F{index}") for index in range(12)]
    track = create_track(db_session, user, "Many")
    client = FakeClient(
        ok_json(
            [
                {
                    "track_id": track.id,
                    "tags": [
                        {"tag_id": tag.id, "confidence": 0.61 + index * 0.01}
                        for index, tag in enumerate(tags)
                    ],
                },
            ],
        ),
    )

    result = auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    applied = result.applied[track.id]
    assert len(applied) == MAX_AI_TAGS_PER_TRACK
    assert applied[0].name == "F11"  # highest confidence first


@pytest.mark.parametrize(
    ("response", "expected_status"),
    [
        (AiCompletionResult.ok("not json at all"), AiProviderStatus.ERROR),
        (AiCompletionResult.error(error_type="http_error", message="boom"), AiProviderStatus.ERROR),
        (RuntimeError("network down"), AiProviderStatus.ERROR),
    ],
)
def test_failures_change_nothing(
    db_session: Session,
    library: dict[str, Any],
    response: AiCompletionResult | Exception,
    expected_status: AiProviderStatus,
) -> None:
    track = create_track(db_session, library["user"], "Fails")
    client = FakeClient(response, response, response)

    result = auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert not result.ok
    assert result.provider_status == expected_status
    assert result.error
    assert tag_rows(db_session, track) == {}
    db_session.refresh(track)
    assert track.ai_tags_version is None


@pytest.mark.parametrize(
    ("overrides", "expected_status"),
    [
        ({"ai_enabled": False}, AiProviderStatus.DISABLED),
        ({"ai_api_key": ""}, AiProviderStatus.UNCONFIGURED),
    ],
)
def test_unavailable_provider_is_not_called(
    db_session: Session,
    library: dict[str, Any],
    overrides: dict[str, Any],
    expected_status: AiProviderStatus,
) -> None:
    track = create_track(db_session, library["user"], "Idle")
    client = FakeClient()

    result = auto_tag_batch(
        db_session,
        make_provider(client, **overrides),
        [track.id],
        min_confidence=0.6,
    )

    assert result.provider_status == expected_status
    assert client.calls == []
    assert track.ai_tags_version is None


def test_empty_catalogue_is_reported_without_calling_provider(db_session: Session) -> None:
    user = create_user(db_session)
    track = create_track(db_session, user, "No tags yet")
    client = FakeClient()

    result = auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert not result.ok
    assert "catalogue is empty" in (result.error or "")
    assert client.calls == []
    assert track.ai_tags_version is None


def truncated() -> AiCompletionResult:
    return AiCompletionResult.error(error_type="output_truncated", message="Provider output was truncated.")


def test_batch_requests_large_output_budget(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    track = create_track(db_session, library["user"], "Budget")
    client = FakeClient(ok_json([{"track_id": track.id, "tags": []}]))

    auto_tag_batch(db_session, make_provider(client), [track.id], min_confidence=0.6)

    assert client.calls[0].max_tokens == AUTO_TAG_MAX_TOKENS == 8192


def test_truncated_batch_is_split_and_retried(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    tracks = [create_track(db_session, library["user"], f"S{index}") for index in range(3)]
    calm = library["calm"].id

    class SplittingClient(FakeClient):
        def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
            self.calls.append(request)
            prompt = request.messages[-1]["content"]
            lines = set(prompt.splitlines())
            ids = [track.id for track in tracks if f"- track_id: {track.id}" in lines]
            if len(ids) > 1:
                return truncated()
            return ok_json([{"track_id": ids[0], "tags": [{"tag_id": calm, "confidence": 0.9}]}])

    client = SplittingClient()

    result = auto_tag_batch(
        db_session,
        make_provider(client),
        [track.id for track in tracks],
        min_confidence=0.6,
    )

    assert result.ok
    assert sorted(result.tagged_track_ids) == [track.id for track in tracks]
    # 3 -> truncated, [1] ok, [2] -> truncated, [1] ok, [1] ok
    assert len(client.calls) == 5
    for track in tracks:
        assert tag_rows(db_session, track) == {calm: ("ai", 0.9)}


def test_single_track_truncation_fails_without_changes(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    tracks = [create_track(db_session, library["user"], f"T{index}") for index in range(2)]
    client = FakeClient(truncated(), truncated(), truncated())

    result = auto_tag_batch(
        db_session,
        make_provider(client),
        [track.id for track in tracks],
        min_confidence=0.6,
    )

    assert not result.ok
    assert "truncated" in (result.error or "")
    assert len(client.calls) == 3
    db_session.expire_all()
    assert all(track.ai_tags_version is None for track in tracks)


def test_auto_tag_tracks_chunks_into_batches(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    tracks = [create_track(db_session, library["user"], f"T{index}") for index in range(5)]
    client = FakeClient()
    seen: list[list[int]] = []

    results = auto_tag_tracks(
        db_session,
        make_provider(client),
        [track.id for track in tracks],
        min_confidence=0.6,
        batch_size=2,
        on_batch=lambda chunk, _result: seen.append(chunk),
    )

    assert len(results) == 3
    assert [len(chunk) for chunk in seen] == [2, 2, 1]
    assert len(client.calls) == 3
    assert list_tracks_needing_auto_tagging(db_session) == []


# ---------------------------------------------------------------------------
# worker hook
# ---------------------------------------------------------------------------


def test_worker_batch_respects_enable_flag(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    create_track(db_session, library["user"], "Waiting")
    client = FakeClient()

    disabled = auto_tag_next_batch(
        db_session,
        settings=make_settings(ai_auto_tagging_enabled=False),
        provider=make_provider(client),
    )
    enabled = auto_tag_next_batch(
        db_session,
        settings=make_settings(),
        provider=make_provider(client),
    )
    nothing_left = auto_tag_next_batch(
        db_session,
        settings=make_settings(),
        provider=make_provider(client),
    )

    assert disabled is None
    assert enabled is not None and enabled.ok
    assert nothing_left is None
    assert len(client.calls) == 1


def test_worker_batch_skips_unconfigured_provider(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    create_track(db_session, library["user"], "Waiting")
    client = FakeClient()

    result = auto_tag_next_batch(
        db_session,
        settings=make_settings(ai_model=""),
        provider=make_provider(client, ai_model=""),
    )

    assert result is None
    assert client.calls == []


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_idle_auto_tagging_backs_off_after_failure(db_session: Session) -> None:
    clock = FakeClock()
    throttle = AutoTagThrottle(backoff_seconds=600, clock=clock)
    calls: list[int] = []

    def failing(db: Session) -> AutoTagBatchResult:
        calls.append(1)
        return AutoTagBatchResult(provider_status=AiProviderStatus.ERROR, error="boom")

    run_idle_auto_tagging(db_session, throttle, auto_tag=failing)
    run_idle_auto_tagging(db_session, throttle, auto_tag=failing)
    clock.now += 601
    run_idle_auto_tagging(db_session, throttle, auto_tag=failing)

    assert len(calls) == 2


def test_idle_auto_tagging_survives_crash(db_session: Session) -> None:
    clock = FakeClock()
    throttle = AutoTagThrottle(backoff_seconds=600, clock=clock)

    def crashing(db: Session) -> AutoTagBatchResult:
        raise RuntimeError("unexpected")

    run_idle_auto_tagging(db_session, throttle, auto_tag=crashing)

    assert not throttle.allowed()


def test_idle_auto_tagging_success_keeps_running(
    db_session: Session,
    capsys: pytest.CaptureFixture[str],
) -> None:
    throttle = AutoTagThrottle(backoff_seconds=600, clock=FakeClock())

    def succeeding(db: Session) -> AutoTagBatchResult:
        return AutoTagBatchResult(provider_status=AiProviderStatus.OK, tagged_track_ids=[1, 2])

    run_idle_auto_tagging(db_session, throttle, auto_tag=succeeding)

    assert throttle.allowed()
    assert "AI auto-tagged 2 track(s)" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# backfill command
# ---------------------------------------------------------------------------


def test_cli_dry_run_lists_tracks_without_calling_provider(
    db_session: Session,
    library: dict[str, Any],
    capsys: pytest.CaptureFixture[str],
) -> None:
    track = create_track(db_session, library["user"], "Dry")
    client = FakeClient()

    code = autotag_cli.run(db_session, make_provider(client), min_confidence=0.6, dry_run=True)

    assert code == 0
    assert f"1 track(s) would be auto-tagged: {track.id}" in capsys.readouterr().out
    assert client.calls == []


def test_cli_tags_tracks_and_prints_applied_tags(
    db_session: Session,
    library: dict[str, Any],
    capsys: pytest.CaptureFixture[str],
) -> None:
    track = create_track(db_session, library["user"], "Printed")
    client = FakeClient(
        ok_json([{"track_id": track.id, "tags": [{"tag_id": library["calm"].id, "confidence": 0.75}]}]),
    )

    code = autotag_cli.run(db_session, make_provider(client), min_confidence=0.6)

    output = capsys.readouterr().out
    assert code == 0
    assert f"[1/1] track {track.id} Printed: Calm 0.75" in output
    assert "Done: 1 track(s) tagged with 1 AI tag(s), 0 batch(es) failed." in output


def test_cli_works_without_worker_flag_but_needs_provider(
    db_session: Session,
    library: dict[str, Any],
    capsys: pytest.CaptureFixture[str],
) -> None:
    create_track(db_session, library["user"], "Needs provider")
    client = FakeClient()

    code = autotag_cli.run(
        db_session,
        make_provider(client, ai_enabled=False),
        min_confidence=0.6,
    )

    assert code == 1
    assert "AI provider is disabled" in capsys.readouterr().out
    assert client.calls == []


def test_cli_reports_failed_batches(
    db_session: Session,
    library: dict[str, Any],
    capsys: pytest.CaptureFixture[str],
) -> None:
    create_track(db_session, library["user"], "Broken")
    bad = AiCompletionResult.ok("nope")
    client = FakeClient(bad, bad, bad)

    code = autotag_cli.run(db_session, make_provider(client), min_confidence=0.6)

    output = capsys.readouterr().out
    assert code == 1
    assert "FAILED" in output
    assert "1 batch(es) failed" in output


def test_cli_track_id_retags_already_tagged_track(
    db_session: Session,
    library: dict[str, Any],
) -> None:
    track = create_track(db_session, library["user"], "Again", ai_tags_version=AI_AUTO_TAGGING_VERSION)
    client = FakeClient(
        ok_json([{"track_id": track.id, "tags": [{"tag_id": library["study"].id, "confidence": 0.9}]}]),
    )

    code = autotag_cli.run(db_session, make_provider(client), min_confidence=0.6, track_id=track.id)

    assert code == 0
    assert tag_rows(db_session, track) == {library["study"].id: ("ai", 0.9)}


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


def test_auto_tag_endpoints_require_authentication(api: tuple[TestClient, Any]) -> None:
    client, _ = api

    assert client.get("/api/ai/auto-tag/status").status_code == 401
    assert client.post("/api/ai/auto-tag/next-batch").status_code == 401


def test_status_counts_only_owner_pending_ready_tracks(
    api: tuple[TestClient, Any],
    db_session: Session,
    library: dict[str, Any],
) -> None:
    client, app = api
    user = library["user"]
    other = create_user(db_session, "other")
    create_track(db_session, user, "pending")
    create_track(db_session, user, "done", ai_tags_version=AI_AUTO_TAGGING_VERSION)
    create_track(db_session, user, "processing", status="processing")
    create_track(db_session, other, "someone else")
    install_provider(app, FakeClient())

    response = client.get("/api/ai/auto-tag/status", headers=auth(user))

    assert response.status_code == 200
    assert response.json() == {"provider_status": "ok", "pending_count": 1}


def test_next_batch_tags_owner_tracks_in_web_sized_batches(
    api: tuple[TestClient, Any],
    db_session: Session,
    library: dict[str, Any],
) -> None:
    client, app = api
    user = library["user"]
    other = create_user(db_session, "other")
    tracks = [create_track(db_session, user, f"W{index}") for index in range(WEB_BATCH_SIZE + 2)]
    foreign = create_track(db_session, other, "foreign")
    calm = library["calm"].id
    fake = FakeClient(
        ok_json(
            [
                {"track_id": track.id, "tags": [{"tag_id": calm, "confidence": 0.9}]}
                for track in tracks[:WEB_BATCH_SIZE]
            ],
        ),
        ok_json([{"track_id": track.id, "tags": []} for track in tracks[WEB_BATCH_SIZE:]]),
    )
    install_provider(app, fake)

    first = client.post("/api/ai/auto-tag/next-batch", headers=auth(user))
    second = client.post("/api/ai/auto-tag/next-batch", headers=auth(user))
    third = client.post("/api/ai/auto-tag/next-batch", headers=auth(user))

    assert first.status_code == 200
    assert first.json() == {
        "provider_status": "ok",
        "tagged_count": WEB_BATCH_SIZE,
        "applied_tag_count": WEB_BATCH_SIZE,
        "remaining_count": 2,
        "error": None,
    }
    assert second.json()["tagged_count"] == 2
    assert second.json()["remaining_count"] == 0
    assert third.json()["tagged_count"] == 0
    assert len(fake.calls) == 2
    assert f"track_id: {foreign.id}" not in "".join(fake.prompts)
    db_session.expire_all()
    assert foreign.ai_tags_version is None


def test_next_batch_reports_provider_problems_without_changes(
    api: tuple[TestClient, Any],
    db_session: Session,
    library: dict[str, Any],
) -> None:
    client, app = api
    user = library["user"]
    track = create_track(db_session, user, "Waiting")

    install_provider(app, FakeClient(), ai_enabled=False)
    disabled = client.post("/api/ai/auto-tag/next-batch", headers=auth(user))

    bad = AiCompletionResult.ok("nope")
    install_provider(app, FakeClient(bad, bad, bad))
    failed = client.post("/api/ai/auto-tag/next-batch", headers=auth(user))

    assert disabled.status_code == 200
    assert disabled.json()["provider_status"] == "disabled"
    assert disabled.json()["remaining_count"] == 1
    assert failed.json()["provider_status"] == "error"
    assert failed.json()["error"]
    assert failed.json()["remaining_count"] == 1
    db_session.expire_all()
    assert track.ai_tags_version is None
