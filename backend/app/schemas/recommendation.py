from pydantic import BaseModel, Field

from app.schemas.track import TrackResponse


class RecommendationRequest(BaseModel):
    scenario_tag_ids: list[int] = Field(default_factory=list)
    state_tag_ids: list[int] = Field(default_factory=list)
    type_tag_ids: list[int] = Field(default_factory=list)
    attribute_tag_ids: list[int] = Field(default_factory=list)
    exclude_attribute_tag_ids: list[int] = Field(default_factory=list)
    limit: int = Field(default=3, ge=1, le=10)
    client: str | None = Field(default=None, max_length=50)


class RecommendationResult(BaseModel):
    rank: int
    score: float
    reason: str
    track: TrackResponse


class RecommendationResponse(BaseModel):
    request_id: str
    results: list[RecommendationResult]
