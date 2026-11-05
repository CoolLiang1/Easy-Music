"""AI provider schemas — development-only, no real secrets committed."""

import logging
import re
from enum import Enum
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

from app.schemas.recommendation import RecommendationRequest, RecommendationResult
from app.schemas.tag import TagGroup


class AiProviderStatus(str, Enum):
    OK = "ok"
    DISABLED = "disabled"
    UNCONFIGURED = "unconfigured"
    ERROR = "error"


class AiCompletionRequest(BaseModel):
    """Minimal structured completion request for the AI provider abstraction.

    Later tasks may add schema instructions, but the provider service must stay
    provider-agnostic.
    """

    messages: list[dict[str, str]] = Field(
        default_factory=list,
        description="List of message dicts with 'role' and 'content' keys.",
    )
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    response_format: dict[str, str] | None = None


class AiCompletionResult(BaseModel):
    """Carrier for AI completion outcomes that API routes can map to responses.

    Use the factory classmethods instead of constructing directly so callers don't
    need to remember internal field combinations.
    """

    content: str | None = None
    provider_status: AiProviderStatus
    model: str | None = None
    error_type: str | None = None
    error_message: str | None = None
    is_success: bool = False

    @classmethod
    def ok(cls, content: str, *, model: str | None = None) -> "AiCompletionResult":
        return cls(
            content=content,
            provider_status=AiProviderStatus.OK,
            model=model,
            is_success=True,
        )

    @classmethod
    def disabled(cls) -> "AiCompletionResult":
        return cls(
            provider_status=AiProviderStatus.DISABLED,
            is_success=False,
        )

    @classmethod
    def unconfigured(cls, reason: str = "") -> "AiCompletionResult":
        return cls(
            provider_status=AiProviderStatus.UNCONFIGURED,
            error_message=reason or "AI provider is not fully configured.",
            is_success=False,
        )

    @classmethod
    def error(
        cls,
        error_type: str,
        message: str,
        *,
        model: str | None = None,
    ) -> "AiCompletionResult":
        return cls(
            provider_status=AiProviderStatus.ERROR,
            error_type=error_type,
            error_message=message,
            model=model,
            is_success=False,
        )


# ---------------------------------------------------------------------------
# listening-intent parsing
# ---------------------------------------------------------------------------


class ParseListeningIntentRequest(BaseModel):
    """Request for ``POST /api/ai/parse-listening-intent``."""

    text: str = Field(min_length=1, max_length=1000)
    client: str | None = Field(default=None, max_length=50)
    fallback_to_empty: bool = Field(default=True)


class AiIntentOutput(BaseModel):
    """Shape the AI must return when parsing listening intent.

    Every tag id must come from the tag catalogue supplied in the prompt.
    """

    model_config = ConfigDict(extra="forbid")

    scene_tag_ids: list[int] = Field(default_factory=list)
    type_tag_ids: list[int] = Field(default_factory=list)
    feature_tag_ids: list[int] = Field(default_factory=list)
    unmatched_terms: list[str] = Field(default_factory=list)
    explanation: str | None = None


class MatchedTagItem(BaseModel):
    """Compact tag representation used inside ``ParsedIntentResponse``."""

    id: int
    name: str
    group: TagGroup


class ParsedIntentResponse(BaseModel):
    """Response for ``POST /api/ai/parse-listening-intent``.

    ``structured_request`` is Phase 5-compatible so callers can forward it
    directly to ``POST /api/recommendations``.
    """

    structured_request: RecommendationRequest
    matched_tags: dict[str, list[MatchedTagItem]] = Field(default_factory=dict)
    unmatched_terms: list[str] = Field(default_factory=list)
    explanation: str | None = None
    provider_status: AiProviderStatus


# ---------------------------------------------------------------------------
# AI recommendation composition
# ---------------------------------------------------------------------------


class AiRecommendRequest(BaseModel):
    """Request for ``POST /api/ai/recommend``.

    The LLM only parses intent — it never selects track ids.  Ranking is
    delegated to the existing Phase 5 recommendation service.
    """

    text: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=3, ge=1, le=10)
    client: str | None = Field(default=None, max_length=50)
    fallback_to_empty: bool = Field(default=True)


class AiRecommendResponse(BaseModel):
    """Response for ``POST /api/ai/recommend``.

    ``parsed_intent`` exposes the full intent-parsing result so clients can
    inspect matched tags, unmatched terms, and the AI explanation.
    ``results`` uses the same Phase 5 ``RecommendationResult`` shape as
    ``POST /api/recommendations`` so existing client models stay compatible.
    """

    parsed_intent: ParsedIntentResponse
    request_id: str
    results: list[RecommendationResult] = Field(default_factory=list)
    exclusions_considered: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# track tag suggestions
# ---------------------------------------------------------------------------


class TagSuggestionRequest(BaseModel):
    """Request for ``POST /api/ai/tracks/{track_id}/suggest-tags``."""

    include_new_tag_suggestions: bool = False


class ExistingTagSuggestion(BaseModel):
    """A suggested tag that already exists in the user's tag catalogue."""

    tag_id: int
    name: str
    group: TagGroup
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reason: str = ""


class NewTagSuggestion(BaseModel):
    """A suggested new tag name — returned as a suggestion only, never created."""

    model_config = ConfigDict(extra="forbid")

    name: str
    group: TagGroup
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reason: str = ""


class TagSearchContextItem(BaseModel):
    """Normalized search result item used inside the suggest-tags prompt."""

    model_config = ConfigDict(extra="forbid")

    title: str = ""
    snippet: str = ""
    url: str = ""


# ---------------------------------------------------------------------------
# Tolerant parsing of provider tag output
#
# Models sometimes copy the prompt's "id:12" catalogue notation into the JSON
# ({"tag_id:12": 0}) or emit one malformed item. Repair what is unambiguous
# and drop items that still do not validate, so one bad item never discards
# the rest of a response. Every surviving id is still checked against the
# owner's catalogue by the calling service.
# ---------------------------------------------------------------------------

_ai_output_logger = logging.getLogger("app.schemas.ai")


def _repair_id_key(data: Any, field: str) -> Any:
    """Turn a key such as ``"tag_id:12"`` into ``tag_id=12`` when *field* is missing."""
    if not isinstance(data, dict) or field in data:
        return data
    pattern = re.compile(rf"\s*{field}\s*[:=]\s*(\d+)\s*")
    for key in data:
        match = pattern.fullmatch(str(key))
        if match:
            repaired = {k: v for k, v in data.items() if k != key}
            repaired[field] = int(match.group(1))
            return repaired
    return data


def _keep_valid_items(items: Any, model: type[BaseModel]) -> Any:
    """Validate list items one by one and drop those that fail."""
    if not isinstance(items, list):
        return items
    kept: list[BaseModel] = []
    for item in items:
        try:
            kept.append(model.model_validate(item))
        except ValidationError as exc:
            _ai_output_logger.warning(
                "Dropped malformed AI %s item %r: %s",
                model.__name__,
                item,
                exc.errors()[0].get("msg", "invalid"),
            )
    return kept


def _keep_int_items(items: Any) -> Any:
    if not isinstance(items, list):
        return items
    return [
        int(item)
        for item in items
        if (isinstance(item, int) and not isinstance(item, bool))
        or (isinstance(item, str) and item.strip().isdigit())
    ]


def _clamp_confidence(value: Any) -> Any:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return min(max(float(value), 0.0), 1.0)
    return value


class AiTagExistingSuggestionOutput(BaseModel):
    """Existing-tag suggestion shape returned by the provider."""

    model_config = ConfigDict(extra="ignore")

    tag_id: int
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reason: str = ""

    @model_validator(mode="before")
    @classmethod
    def _repair_tag_id(cls, data: Any) -> Any:
        return _repair_id_key(data, "tag_id")

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp(cls, value: Any) -> Any:
        return _clamp_confidence(value)


class AiTagNewSuggestionOutput(BaseModel):
    """New-tag suggestion shape returned by the provider before validation."""

    model_config = ConfigDict(extra="ignore")

    name: str
    group: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reason: str = ""

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp(cls, value: Any) -> Any:
        return _clamp_confidence(value)


class AiTagSuggestionOutput(BaseModel):
    """Shape the AI must return for tag suggestions.

    ``existing_tag_ids`` must come from the catalogue in the prompt.
    ``new_tag_suggestions`` are suggestions only — the endpoint never creates
    or binds them automatically. Malformed items are dropped individually.
    """

    model_config = ConfigDict(extra="ignore")

    existing_tag_suggestions: list[AiTagExistingSuggestionOutput] = Field(
        default_factory=list,
    )
    existing_tag_ids: list[int] = Field(default_factory=list)
    new_tag_suggestions: list[AiTagNewSuggestionOutput] = Field(default_factory=list)
    explanation: str | None = None

    @field_validator("existing_tag_suggestions", mode="before")
    @classmethod
    def _drop_bad_existing(cls, value: Any) -> Any:
        return _keep_valid_items(value, AiTagExistingSuggestionOutput)

    @field_validator("new_tag_suggestions", mode="before")
    @classmethod
    def _drop_bad_new(cls, value: Any) -> Any:
        return _keep_valid_items(value, AiTagNewSuggestionOutput)

    @field_validator("existing_tag_ids", mode="before")
    @classmethod
    def _drop_bad_ids(cls, value: Any) -> Any:
        return _keep_int_items(value)


class AiAutoTagOutput(BaseModel):
    """One tag the provider assigns to one track in a batch auto-tag call.

    Lenient on purpose: one malformed item must not discard a whole batch.
    Confidence is clamped by the service.
    """

    model_config = ConfigDict(extra="ignore")

    tag_id: int
    confidence: float = 0.5

    @model_validator(mode="before")
    @classmethod
    def _repair_tag_id(cls, data: Any) -> Any:
        return _repair_id_key(data, "tag_id")


class AiAutoTagTrackOutput(BaseModel):
    """Tags the provider assigns to one track of the batch."""

    model_config = ConfigDict(extra="ignore")

    track_id: int
    tags: list[AiAutoTagOutput] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _repair_track_id(cls, data: Any) -> Any:
        return _repair_id_key(data, "track_id")

    @field_validator("tags", mode="before")
    @classmethod
    def _drop_bad_tags(cls, value: Any) -> Any:
        return _keep_valid_items(value, AiAutoTagOutput)


class AiAutoTagBatchOutput(BaseModel):
    """Shape the AI must return for a batch auto-tag call.

    Every ``track_id`` must be one of the tracks in the prompt and every
    ``tag_id`` must come from the supplied catalogue; the service drops
    anything else.
    """

    model_config = ConfigDict(extra="ignore")

    tracks: list[AiAutoTagTrackOutput] = Field(default_factory=list)

    @field_validator("tracks", mode="before")
    @classmethod
    def _drop_bad_tracks(cls, value: Any) -> Any:
        return _keep_valid_items(value, AiAutoTagTrackOutput)


class AutoTagStatusResponse(BaseModel):
    """Response for ``GET /api/ai/auto-tag/status``."""

    provider_status: AiProviderStatus
    pending_count: int


class AutoTagBatchResponse(BaseModel):
    """Response for ``POST /api/ai/auto-tag/next-batch``.

    One small batch is tagged per call; ``remaining_count`` tells the client
    whether to call again. A failed batch changes nothing and reports
    ``error``.
    """

    provider_status: AiProviderStatus
    tagged_count: int
    applied_tag_count: int
    remaining_count: int
    error: str | None = None


class AiMetadataTrackOutput(BaseModel):
    """Clean title and artist the provider proposes for one track.

    Lenient on purpose: one malformed item must not discard a whole batch.
    The service trims, length-limits, and confidence-gates the values.
    """

    model_config = ConfigDict(extra="ignore")

    track_id: int
    title: str | None = None
    artist: str | None = None
    artist_confidence: float = 0.0

    @model_validator(mode="before")
    @classmethod
    def _repair_track_id(cls, data: Any) -> Any:
        return _repair_id_key(data, "track_id")

    @field_validator("title", "artist", mode="before")
    @classmethod
    def _blank_non_strings(cls, value: Any) -> Any:
        return value if isinstance(value, str) else None

    @field_validator("artist_confidence", mode="before")
    @classmethod
    def _default_confidence(cls, value: Any) -> Any:
        return 0.0 if value is None else value


class AiMetadataBatchOutput(BaseModel):
    """Shape the AI must return for a metadata clean-up batch."""

    model_config = ConfigDict(extra="ignore")

    tracks: list[AiMetadataTrackOutput] = Field(default_factory=list)

    @field_validator("tracks", mode="before")
    @classmethod
    def _drop_bad_tracks(cls, value: Any) -> Any:
        return _keep_valid_items(value, AiMetadataTrackOutput)


class MetadataCleanupStatusResponse(BaseModel):
    """Response for ``GET /api/ai/metadata-cleanup/status``."""

    provider_status: AiProviderStatus
    pending_count: int


class MetadataCleanupBatchRequest(BaseModel):
    """Request for ``POST /api/ai/metadata-cleanup/next-batch``.

    ``after_id`` is the ``next_after_id`` of the previous call, so a review
    session walks the pending tracks once without anything being saved.
    """

    after_id: int | None = Field(default=None, ge=0)


class MetadataSuggestion(BaseModel):
    """One track whose title or artist the AI would change.

    ``*_selected`` is the suggested default for the review list: title
    changes and confident artists for tracks without one are pre-selected.
    """

    track_id: int
    current_title: str
    current_artist: str | None = None
    suggested_title: str
    suggested_artist: str | None = None
    artist_confidence: float
    title_changed: bool
    artist_changed: bool
    title_selected: bool
    artist_selected: bool


class MetadataCleanupBatchResponse(BaseModel):
    """Response for ``POST /api/ai/metadata-cleanup/next-batch``.

    Nothing is saved. ``reviewed_track_ids`` lists every track the AI looked
    at, including those with no suggested change; send them back to
    ``apply`` so they are not offered again. ``next_after_id`` is the last
    track id of the batch, or null when nothing was pending. A failed batch
    reports ``error``; retry it with the same ``after_id``.
    """

    provider_status: AiProviderStatus
    suggestions: list[MetadataSuggestion] = Field(default_factory=list)
    reviewed_track_ids: list[int] = Field(default_factory=list)
    next_after_id: int | None = None
    remaining_count: int
    error: str | None = None


class MetadataChange(BaseModel):
    """Accepted values for one track; omitted fields are left unchanged."""

    track_id: int
    title: str | None = Field(default=None, max_length=255)
    artist: str | None = Field(default=None, max_length=255)


class MetadataCleanupApplyRequest(BaseModel):
    """Request for ``POST /api/ai/metadata-cleanup/apply``."""

    changes: list[MetadataChange] = Field(default_factory=list, max_length=1000)
    reviewed_track_ids: list[int] = Field(default_factory=list, max_length=5000)


class MetadataCleanupApplyResponse(BaseModel):
    """Response for ``POST /api/ai/metadata-cleanup/apply``."""

    updated_count: int
    reviewed_count: int


class TagSuggestionResponse(BaseModel):
    """Response for ``POST /api/ai/tracks/{track_id}/suggest-tags``.

    ``existing_tag_suggestions`` is keyed by tag group.
    ``new_tag_suggestions`` are suggestions only — nothing has been created.
    """

    track_id: int
    existing_tag_suggestions: dict[str, list[ExistingTagSuggestion]] = Field(
        default_factory=dict,
    )
    new_tag_suggestions: list[NewTagSuggestion] = Field(default_factory=list)
    explanation: str | None = None
    provider_status: AiProviderStatus
