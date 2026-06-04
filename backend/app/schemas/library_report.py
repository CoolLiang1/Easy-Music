from datetime import datetime

from pydantic import BaseModel

from app.schemas.duplicate import DuplicateCandidateGroupResponse


class LibraryReportTrack(BaseModel):
    id: int
    title: str
    artist: str | None
    album: str | None
    duration_seconds: int | None
    content_type: str
    status: str
    updated_at: datetime
    last_played_at: datetime | None = None
    playback_count: int = 0


class LibraryReportTrackIssue(BaseModel):
    track: LibraryReportTrack
    reasons: list[str]


class LibraryOrganizationReport(BaseModel):
    generated_at: datetime
    untagged_ready_tracks: list[LibraryReportTrack]
    missing_metadata_tracks: list[LibraryReportTrackIssue]
    processing_tracks: list[LibraryReportTrackIssue]
    duplicate_groups: list[DuplicateCandidateGroupResponse]
    never_played_ready_tracks: list[LibraryReportTrack]
    rarely_played_ready_tracks: list[LibraryReportTrack]
    stale_cooldown_tracks: list[LibraryReportTrackIssue]
