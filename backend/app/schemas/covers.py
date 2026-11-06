"""Schemas for the owner-reviewed online cover search."""

from pydantic import BaseModel, Field


class PendingCoverTrack(BaseModel):
    """A ready track with an artist and no cover, waiting for a cover search."""

    track_id: int
    title: str
    artist: str
    duration_seconds: int | None = None


class CoverSearchStatusResponse(BaseModel):
    """Response for ``GET /api/covers/search/status``."""

    enabled: bool
    pending_count: int
    pending_tracks: list[PendingCoverTrack] = Field(default_factory=list)
    skipped_without_artist: int


class CoverSearchBatchRequest(BaseModel):
    after_id: int | None = Field(default=None, ge=0)


class CoverCandidateResponse(BaseModel):
    track_id: int
    artwork_url: str
    track_name: str
    artist_name: str
    collection_name: str
    confidence: str
    selected: bool


class CoverSearchBatchResponse(BaseModel):
    """Response for ``POST /api/covers/search/next-batch``. Saves nothing.

    ``status`` is ``ok``, ``disabled``, or ``error``. ``reviewed_track_ids``
    lists every track searched, with or without a candidate; send them to
    ``apply``. On ``error``, retry with the returned ``next_after_id``.
    """

    status: str
    candidates: list[CoverCandidateResponse] = Field(default_factory=list)
    reviewed_track_ids: list[int] = Field(default_factory=list)
    next_after_id: int | None = None
    remaining_count: int
    error: str | None = None


class CoverChoice(BaseModel):
    track_id: int
    artwork_url: str = Field(max_length=2048)


class CoverSearchApplyRequest(BaseModel):
    choices: list[CoverChoice] = Field(default_factory=list, max_length=1000)
    reviewed_track_ids: list[int] = Field(default_factory=list, max_length=5000)


class CoverSearchApplyResponse(BaseModel):
    updated_count: int
    failed_count: int
    reviewed_count: int
