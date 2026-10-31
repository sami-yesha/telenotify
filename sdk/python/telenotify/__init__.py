"""
Telenotify Python SDK
Customer notifications and phone verification on Telegram, with one API call.
"""

from .client import Telenotify
from .errors import TelenotifyError, WebhookSignatureError
from .verification_token import verify_token
from .webhooks import construct_event, verify_signature

__version__ = "0.1.0"
__all__ = [
    "Telenotify",
    "TelenotifyError",
    "WebhookSignatureError",
    "construct_event",
    "verify_signature",
    "verify_token",
]
