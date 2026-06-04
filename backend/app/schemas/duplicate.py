from typing import Literal

from pydantic import BaseModel, Field


DuplicateMatchType = Literal["exact_file", "metadata_duration"]


class DuplicateCandidateGroup(BaseModel):
    group_id: str
    match_type: DuplicateMatchType
    confidence: float = Field(ge=0, le=1)
    reason: str
    candidate_track_ids: list[int]


class DuplicateCandidateTrack(BaseModel):
    id: int
    title: str
    artist: str | None
    album: str | None
    duration_seconds: int | None
    content_type: str
    status: str


class DuplicateCandidateGroupResponse(BaseModel):
    group_id: str
    match_type: DuplicateMatchType
    confidence: float = Field(ge=0, le=1)
    reason: str
    candidate_track_ids: list[int]
    candidates: list[DuplicateCandidateTrack]
