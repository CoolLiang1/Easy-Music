from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


FeedbackType = Literal[
    "like",
    "dislike",
    "tired",
    "not_today",
    "not_suitable_for_context",
    "skip_recommendation",
]


class FeedbackEventSyncItem(BaseModel):
    client_event_id: str | None = Field(default=None, min_length=1, max_length=128)
    track_id: int
    feedback_type: FeedbackType
    scenario_tag_ids: list[int] | None = None
    state_tag_ids: list[int] | None = None
    type_tag_ids: list[int] | None = None
    attribute_tag_ids: list[int] | None = None
    occurred_at: datetime
    client: str = Field(min_length=1, max_length=50)


class FeedbackEventBulkSyncRequest(BaseModel):
    events: list[FeedbackEventSyncItem] = Field(min_length=1, max_length=50)


class FeedbackEventAccepted(BaseModel):
    client_event_id: str | None
    status: Literal["accepted", "duplicate"]


class FeedbackEventFailed(BaseModel):
    client_event_id: str | None
    track_id: int
    status: Literal["failed"] = "failed"
    error: str


class FeedbackEventBulkSyncResponse(BaseModel):
    accepted: list[FeedbackEventAccepted]
    failed: list[FeedbackEventFailed]
