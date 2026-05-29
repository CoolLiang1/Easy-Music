"""AI provider schemas — development-only, no real secrets committed."""

from enum import Enum

from pydantic import BaseModel, Field


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
