from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.track import TrackResponse


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Playlist name is required.")
        return name

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        description = value.strip()
        return description or None


class PlaylistUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1024)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("Playlist name is required.")
        return name

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        description = value.strip()
        return description or None


class PlaylistTrackAdd(BaseModel):
    track_id: int


class PlaylistReorder(BaseModel):
    track_ids: list[int]


class PlaylistSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    track_count: int
    created_at: datetime
    updated_at: datetime


class PlaylistTrackResponse(BaseModel):
    position: int
    added_at: datetime
    track: TrackResponse


class PlaylistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    track_count: int
    tracks: list[PlaylistTrackResponse]
    created_at: datetime
    updated_at: datetime
