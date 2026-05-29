"""AI provider client abstraction.

Isolated here so later services can request structured completions without
knowing provider details. Provider failures are converted into typed result
objects that API routes can map to clear responses.
"""

from typing import Protocol

from app.core.config import Settings
from app.schemas.ai import AiCompletionRequest, AiCompletionResult, AiProviderStatus


class _AiClient(Protocol):
    """Protocol for the actual HTTP client that calls the AI provider.

    This is a protocol, not an ABC, so mock implementations don't need to
    inherit from anything. The real implementation will be added in a later task
    when the first endpoint needs to call a provider.
    """

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        ...


class AiProviderService:
    """Development-safe AI provider facade.

    Detects disabled / unconfigured states and delegates to an injectable client
    for the actual provider call. Callers only see AiCompletionResult objects —
    never provider-specific exceptions or HTTP details.
    """

    def __init__(self, settings: Settings, *, client: _AiClient | None = None):
        self._settings = settings
        self._client = client

    @property
    def status(self) -> AiProviderStatus:
        """Derived provider status from current settings."""
        if not self._settings.ai_enabled:
            return AiProviderStatus.DISABLED
        if not self._settings.ai_api_key or not self._settings.ai_model:
            return AiProviderStatus.UNCONFIGURED
        return AiProviderStatus.OK

    def complete(self, request: AiCompletionRequest) -> AiCompletionResult:
        """Request a structured completion.

        Returns an AiCompletionResult whose `is_success` flag tells the caller
        whether usable content is present. Never raises provider-specific
        exceptions.
        """
        status = self.status
        if status == AiProviderStatus.DISABLED:
            return AiCompletionResult.disabled()
        if status == AiProviderStatus.UNCONFIGURED:
            return AiCompletionResult.unconfigured()

        if self._client is None:
            return AiCompletionResult.error(
                error_type="not_implemented",
                message="AI provider HTTP client is not yet implemented.",
            )

        try:
            return self._client.complete(request)
        except Exception as exc:
            return AiCompletionResult.error(
                error_type="provider_call_failed",
                message=str(exc),
            )


class AiProviderUnavailableError(Exception):
    """Raised by downstream services when they cannot proceed without a working
    provider. Carries the result so callers can inspect the reason."""

    def __init__(self, result: AiCompletionResult):
        self.result = result
        super().__init__(result.error_message or str(result.provider_status.value))
