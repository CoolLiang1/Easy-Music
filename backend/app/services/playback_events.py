from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.playback_event import PlaybackEvent
from app.models.track import Track
from app.models.user import User
from app.schemas.playback_event import (
    PlaybackEventAccepted,
    PlaybackEventBulkSyncRequest,
    PlaybackEventBulkSyncResponse,
    PlaybackEventFailed,
)


def sync_playback_events(
    db: Session,
    user: User,
    payload: PlaybackEventBulkSyncRequest,
) -> PlaybackEventBulkSyncResponse:
    client_event_ids = [event.client_event_id for event in payload.events]
    track_ids = {event.track_id for event in payload.events}

    owned_track_ids = set(
        db.scalars(
            select(Track.id).where(
                Track.user_id == user.id,
                Track.id.in_(track_ids),
            ),
        ),
    )
    existing_client_event_ids = set(
        db.scalars(
            select(PlaybackEvent.client_event_id).where(
                PlaybackEvent.user_id == user.id,
                PlaybackEvent.client_event_id.in_(client_event_ids),
            ),
        ),
    )

    accepted: list[PlaybackEventAccepted] = []
    failed: list[PlaybackEventFailed] = []
    seen_client_event_ids: set[str] = set()

    for event in payload.events:
        if (
            event.client_event_id in existing_client_event_ids
            or event.client_event_id in seen_client_event_ids
        ):
            accepted.append(
                PlaybackEventAccepted(
                    client_event_id=event.client_event_id,
                    status="duplicate",
                ),
            )
            continue

        if event.track_id not in owned_track_ids:
            failed.append(
                PlaybackEventFailed(
                    client_event_id=event.client_event_id,
                    track_id=event.track_id,
                    error="Track not found for current user.",
                ),
            )
            continue

        db.add(
            PlaybackEvent(
                user_id=user.id,
                track_id=event.track_id,
                client_event_id=event.client_event_id,
                event_type=event.event_type,
                position_seconds=event.position_seconds,
                duration_seconds=event.duration_seconds,
                occurred_at=event.occurred_at,
                client=event.client,
            ),
        )
        seen_client_event_ids.add(event.client_event_id)
        accepted.append(
            PlaybackEventAccepted(
                client_event_id=event.client_event_id,
                status="accepted",
            ),
        )

    db.commit()
    return PlaybackEventBulkSyncResponse(accepted=accepted, failed=failed)
