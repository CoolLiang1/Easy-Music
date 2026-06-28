from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.feedback_event import FeedbackEvent
from app.models.tag import Tag
from app.models.track import Track
from app.models.user import User
from app.schemas.feedback_event import (
    FeedbackEventAccepted,
    FeedbackEventBulkSyncRequest,
    FeedbackEventBulkSyncResponse,
    FeedbackEventFailed,
    FeedbackEventSyncItem,
)


TAG_CONTEXT_FIELDS = {
    "scene_tag_ids": "scene",
    "type_tag_ids": "type",
    "feature_tag_ids": "feature",
}
TIRED_COOLDOWN_DAYS = 14


def sync_feedback_events(
    db: Session,
    user: User,
    payload: FeedbackEventBulkSyncRequest,
) -> FeedbackEventBulkSyncResponse:
    client_event_ids = [
        event.client_event_id for event in payload.events if event.client_event_id
    ]
    track_ids = {event.track_id for event in payload.events}

    tracks_by_id = {
        track.id: track
        for track in db.scalars(
            select(Track).where(
                Track.user_id == user.id,
                Track.id.in_(track_ids),
            ),
        )
    }
    existing_client_event_ids = set(
        db.scalars(
            select(FeedbackEvent.client_event_id).where(
                FeedbackEvent.user_id == user.id,
                FeedbackEvent.client_event_id.in_(client_event_ids),
            ),
        ),
    )

    accepted: list[FeedbackEventAccepted] = []
    failed: list[FeedbackEventFailed] = []
    seen_client_event_ids: set[str] = set()

    for event in payload.events:
        if event.client_event_id and (
            event.client_event_id in existing_client_event_ids
            or event.client_event_id in seen_client_event_ids
        ):
            accepted.append(
                FeedbackEventAccepted(
                    client_event_id=event.client_event_id,
                    status="duplicate",
                ),
            )
            continue

        track = tracks_by_id.get(event.track_id)
        if track is None:
            failed.append(
                FeedbackEventFailed(
                    client_event_id=event.client_event_id,
                    track_id=event.track_id,
                    error="Track not found for current user.",
                ),
            )
            continue

        context_error = _validate_context_tags(db, user, event)
        if context_error is not None:
            failed.append(
                FeedbackEventFailed(
                    client_event_id=event.client_event_id,
                    track_id=event.track_id,
                    error=context_error,
                ),
            )
            continue

        db.add(
            FeedbackEvent(
                user_id=user.id,
                track_id=event.track_id,
                client_event_id=event.client_event_id,
                feedback_type=event.feedback_type,
                scene_tag_ids=_unique_ids(event.scene_tag_ids),
                type_tag_ids=_unique_ids(event.type_tag_ids),
                feature_tag_ids=_unique_ids(event.feature_tag_ids),
                occurred_at=event.occurred_at,
                client=event.client,
            ),
        )
        _apply_track_feedback(track, event)
        if event.client_event_id:
            seen_client_event_ids.add(event.client_event_id)
        accepted.append(
            FeedbackEventAccepted(
                client_event_id=event.client_event_id,
                status="accepted",
            ),
        )

    db.commit()
    return FeedbackEventBulkSyncResponse(accepted=accepted, failed=failed)


def _validate_context_tags(
    db: Session,
    user: User,
    event: FeedbackEventSyncItem,
) -> str | None:
    for field_name, expected_group in TAG_CONTEXT_FIELDS.items():
        tag_ids = _unique_ids(getattr(event, field_name))
        if not tag_ids:
            continue

        tags = list(
            db.scalars(
                select(Tag).where(
                    Tag.user_id == user.id,
                    Tag.id.in_(tag_ids),
                ),
            ),
        )
        if len(tags) != len(tag_ids):
            return "Context tag not found for current user."
        if any(tag.group != expected_group for tag in tags):
            return f"Context tag group must be {expected_group}."

    return None


def _apply_track_feedback(track: Track, event: FeedbackEventSyncItem) -> None:
    if event.feedback_type == "like":
        track.liked = True
    elif event.feedback_type == "tired":
        track.cooldown_until = event.occurred_at + timedelta(days=TIRED_COOLDOWN_DAYS)


def _unique_ids(tag_ids: list[int] | None) -> list[int] | None:
    if tag_ids is None:
        return None
    return list(dict.fromkeys(tag_ids))
