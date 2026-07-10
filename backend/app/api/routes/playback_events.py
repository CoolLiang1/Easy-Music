from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.playback_event import (
    PlaybackEventBulkSyncRequest,
    PlaybackEventBulkSyncResponse,
    RecentPlaybackItem,
)
from app.services import playback_events as playback_event_service


router = APIRouter(prefix="/playback-events", tags=["playback-events"])


@router.get("/recent", response_model=list[RecentPlaybackItem])
def list_recent_playback(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[RecentPlaybackItem]:
    return playback_event_service.list_recent_playback(db, current_user, limit)


@router.post("", response_model=PlaybackEventBulkSyncResponse)
def sync_playback_events(
    payload: PlaybackEventBulkSyncRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PlaybackEventBulkSyncResponse:
    return playback_event_service.sync_playback_events(db, current_user, payload)
