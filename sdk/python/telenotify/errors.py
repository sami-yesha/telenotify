from typing import Optional


class TelenotifyError(Exception):
    """Base exception for all Telenotify API and client errors."""

    def __init__(self, message: str, status: int = 0, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

    @property
    def is_rate_limited(self) -> bool:
        """True when the request failed due to rate limiting (HTTP 429)."""
        return self.status == 429

    @property
    def is_quota_exceeded(self) -> bool:
        """True when the plan limit was reached (HTTP 402 or code 'quota_exceeded')."""
        return self.status == 402 or self.code == "quota_exceeded"

    def __str__(self) -> str:
        code_str = f" [{self.code}]" if self.code else ""
        status_str = f" (HTTP {self.status})" if self.status else ""
        return f"{self.message}{code_str}{status_str}"


class WebhookSignatureError(TelenotifyError):
    """Raised when a webhook signature is invalid, tampered with, or expired."""

    def __init__(self, message: str = "Invalid or expired Telenotify webhook signature"):
        super().__init__(message, status=400)
