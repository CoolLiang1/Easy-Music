from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.tag import TagResponse


class TrackUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    content_type: str | None = None
    source_url: str | None = None
    liked: bool | None = None
    cooldown_until: datetime | None = None
    tag_ids: list[int] | None = None


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str | None
    album: str | None
    duration_seconds: int | None
    content_type: str
    original_file_path: str | None
    original_file_size_bytes: int | None
    original_file_sha256: str | None
    playback_file_path: str | None
    playback_file_sha256: str | None
    cover_path: str | None
    source_url: str | None
    format: str | None
    bitrate: int | None
    normalized_metadata_key: str | None
    status: str
    processing_job_status: str | None = None
    processing_error_message: str | None = None
    liked: bool
    cooldown_until: datetime | None
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse]
