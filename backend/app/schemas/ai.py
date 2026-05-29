"""AI provider schemas — development-only, no real secrets committed."""

from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.recommendation import RecommendationRequest, RecommendationResult


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

    scenario_tag_ids: list[int] = Field(default_factory=list)
    state_tag_ids: list[int] = Field(default_factory=list)
    type_tag_ids: list[int] = Field(default_factory=list)
    attribute_tag_ids: list[int] = Field(default_factory=list)
    exclude_attribute_tag_ids: list[int] = Field(default_factory=list)
    unmatched_terms: list[str] = Field(default_factory=list)
    explanation: str | None = None


class MatchedTagItem(BaseModel):
    """Compact tag representation used inside ``ParsedIntentResponse``."""

    id: int
    name: str
    group: str


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
