"""AI organization search provider schemas.

Search is intentionally separate from the LLM provider. It only returns
normalized search snippets and never represents scraped page bodies.
"""

from enum import Enum

from pydantic import BaseModel, Field


class AiSearchProviderStatus(str, Enum):
    OK = "ok"
    DISABLED = "disabled"
    UNCONFIGURED = "unconfigured"
    ERROR = "error"


class AiSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=5, ge=1, le=10)


class AiSearchResult(BaseModel):
    title: str = Field(default="", max_length=500)
    snippet: str = Field(default="", max_length=2000)
    url: str = Field(default="", max_length=2000)


class AiSearchProviderResult(BaseModel):
    provider_status: AiSearchProviderStatus
    provider: str | None = None
    query: str | None = None
    results: list[AiSearchResult] = Field(default_factory=list)
    error_type: str | None = None
    error_message: str | None = None
    is_success: bool = False

    @classmethod
    def ok(
        cls,
        *,
        provider: str,
        query: str,
        results: list[AiSearchResult],
    ) -> "AiSearchProviderResult":
        return cls(
            provider_status=AiSearchProviderStatus.OK,
            provider=provider,
            query=query,
            results=results,
            is_success=True,
        )

    @classmethod
    def disabled(cls) -> "AiSearchProviderResult":
        return cls(
            provider_status=AiSearchProviderStatus.DISABLED,
            is_success=False,
        )

    @classmethod
    def unconfigured(cls, reason: str = "") -> "AiSearchProviderResult":
        return cls(
            provider_status=AiSearchProviderStatus.UNCONFIGURED,
            error_message=reason or "AI search provider is not fully configured.",
            is_success=False,
        )

    @classmethod
    def error(
        cls,
        *,
        error_type: str,
        message: str,
        provider: str | None = None,
        query: str | None = None,
    ) -> "AiSearchProviderResult":
        return cls(
            provider_status=AiSearchProviderStatus.ERROR,
            provider=provider,
            query=query,
            error_type=error_type,
            error_message=message,
            is_success=False,
        )
