"""Configured search provider facade for AI track organization."""

from typing import Protocol

from app.core.config import Settings
from app.schemas.ai_search import (
    AiSearchProviderResult,
    AiSearchProviderStatus,
    AiSearchRequest,
)

SUPPORTED_SEARCH_PROVIDER = "tavily-compatible"


class _AiSearchClient(Protocol):
    def search(self, request: AiSearchRequest) -> AiSearchProviderResult:
        ...


class AiSearchProviderService:
    """Development-safe search provider facade.

    The service mirrors the AI provider pattern: disabled and unconfigured
    states are represented as typed results, and provider-specific failures are
    converted to safe messages.
    """

    def __init__(self, settings: Settings, *, client: _AiSearchClient | None = None):
        self._settings = settings
        self._client = client

    @property
    def status(self) -> AiSearchProviderStatus:
        if not self._settings.ai_search_enabled:
            return AiSearchProviderStatus.DISABLED
        if (
            self._settings.ai_search_provider != SUPPORTED_SEARCH_PROVIDER
            or not self._settings.ai_search_api_key
            or not self._settings.ai_search_base_url
        ):
            return AiSearchProviderStatus.UNCONFIGURED
        return AiSearchProviderStatus.OK

    def search(self, request: AiSearchRequest) -> AiSearchProviderResult:
        status = self.status
        if status == AiSearchProviderStatus.DISABLED:
            return AiSearchProviderResult.disabled()
        if status == AiSearchProviderStatus.UNCONFIGURED:
            return AiSearchProviderResult.unconfigured(
                "AI search provider requires AI_SEARCH_PROVIDER=tavily-compatible, "
                "AI_SEARCH_API_KEY, and AI_SEARCH_BASE_URL.",
            )

        normalized_request = request.model_copy(
            update={
                "max_results": min(
                    request.max_results,
                    self._settings.ai_search_max_results,
                ),
            }
        )

        if self._client is None:
            return AiSearchProviderResult.error(
                error_type="not_implemented",
                message="AI search provider HTTP client is not yet implemented.",
                provider=self._settings.ai_search_provider,
                query=normalized_request.query,
            )

        try:
            return self._client.search(normalized_request)
        except Exception as exc:
            return AiSearchProviderResult.error(
                error_type="provider_call_failed",
                message=_safe_error_message(exc, secret=self._settings.ai_search_api_key),
                provider=self._settings.ai_search_provider,
                query=normalized_request.query,
            )


def _safe_error_message(exc: Exception, *, secret: str = "") -> str:
    text = str(exc).strip()
    if not text:
        return "Search provider call failed."
    if secret:
        text = text.replace(secret, "[redacted]")
    return text[:500]
