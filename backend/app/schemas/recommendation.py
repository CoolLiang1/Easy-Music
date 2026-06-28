from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.track import TrackResponse


CooldownMode = Literal["off", "soft", "strict"]


class RecommendationRequest(BaseModel):
    scenario_tag_ids: list[int] = Field(default_factory=list)
    state_tag_ids: list[int] = Field(default_factory=list)
    type_tag_ids: list[int] = Field(default_factory=list)
    attribute_tag_ids: list[int] = Field(default_factory=list)
    exclude_attribute_tag_ids: list[int] = Field(default_factory=list)
    raw_text: str | None = Field(default=None, max_length=1000)
    cooldown_mode: CooldownMode = "soft"
    limit: int = Field(default=3, ge=1, le=10)
    client: str | None = Field(default=None, max_length=50)


class RecommendationExplanationTag(BaseModel):
    id: int
    name: str
    group: str


class RecommendationExplanationPart(BaseModel):
    label: str
    score_delta: float | None = None


class RecommendationExplanation(BaseModel):
    matched_tags: dict[str, list[RecommendationExplanationTag]] = Field(
        default_factory=dict,
    )
    boosts: list[RecommendationExplanationPart] = Field(default_factory=list)
    penalties: list[RecommendationExplanationPart] = Field(default_factory=list)
    feedback_impacts: list[RecommendationExplanationPart] = Field(default_factory=list)
    avoidance_reasons: list[RecommendationExplanationPart] = Field(default_factory=list)


class RecommendationResult(BaseModel):
    rank: int
    score: float
    reason: str
    explanation: RecommendationExplanation = Field(
        default_factory=RecommendationExplanation,
    )
    track: TrackResponse


class RecommendationResponse(BaseModel):
    request_id: str
    results: list[RecommendationResult]
    exclusions_considered: list[str] = Field(default_factory=list)
