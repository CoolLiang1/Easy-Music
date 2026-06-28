from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.track import TrackResponse


class RevivedTrackCandidate(BaseModel):
    track: TrackResponse
    last_played_at: datetime | None = None
    playback_count: int = 0
    days_since_last_played: int | None = None
    reason: str
    tag_summary: list[str] = Field(default_factory=list)


class RevivedTracksResponse(BaseModel):
    generated_at: datetime
    long_unplayed_threshold_days: int
    never_played_included: bool = True
    candidates: list[RevivedTrackCandidate]
