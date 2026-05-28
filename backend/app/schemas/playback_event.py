from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PlaybackEventType = Literal["play", "pause", "resume", "seek", "skip", "complete"]


class PlaybackEventSyncItem(BaseModel):
    client_event_id: str = Field(min_length=1, max_length=128)
    track_id: int
    event_type: PlaybackEventType
    position_seconds: float = Field(ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)
    occurred_at: datetime
    client: str = Field(min_length=1, max_length=50)


class PlaybackEventBulkSyncRequest(BaseModel):
    events: list[PlaybackEventSyncItem] = Field(min_length=1, max_length=100)


class PlaybackEventAccepted(BaseModel):
    client_event_id: str
    status: Literal["accepted", "duplicate"]


class PlaybackEventFailed(BaseModel):
    client_event_id: str
    track_id: int
    status: Literal["failed"] = "failed"
    error: str


class PlaybackEventBulkSyncResponse(BaseModel):
    accepted: list[PlaybackEventAccepted]
    failed: list[PlaybackEventFailed]
