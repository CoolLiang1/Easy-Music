"""Schemas for the owner-reviewed online cover search."""

from pydantic import BaseModel, Field


class CoverlessTrack(BaseModel):
    """A ready track without a cover.

    ``searched`` is true once a search ran for it and was reviewed without a
    saved cover. An empty ``artist`` means the track cannot be searched.
    """

    track_id: int
    title: str
    artist: str
    duration_seconds: int | None = None
    searched: bool


class CoverSearchStatusResponse(BaseModel):
    """Response for ``GET /api/covers/search/status``.

    ``tracks`` lists every coverless track (oldest first, capped at 2000);
    ``coverless_count`` is their total. ``pending_count`` counts those with an
    artist that were never searched; ``skipped_without_artist`` those without
    an artist.
    """

    enabled: bool
    coverless_count: int
    pending_count: int
    tracks: list[CoverlessTrack] = Field(default_factory=list)
    skipped_without_artist: int


class CoverSearchBatchRequest(BaseModel):
    """Search the next never-searched tracks after ``after_id``, or, when
    ``track_ids`` is given, exactly those coverless tracks again (at most 3
    are searched)."""

    after_id: int | None = Field(default=None, ge=0)
    track_ids: list[int] | None = Field(default=None, max_length=10)


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
