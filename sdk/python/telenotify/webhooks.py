import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional, Union

from .errors import WebhookSignatureError


def verify_signature(
    raw_body: Union[str, bytes],
    header: Optional[str],
    secret: str,
    tolerance_seconds: int = 300,
) -> bool:
    """
    Checks an `x-telenotify-signature` header (`t=<unix>,v1=<hex>`) against the raw
    request body. Pass the body exactly as received, before JSON parsing.
    """
    if not header or not secret:
        return False

    parts: Dict[str, str] = {}
    for item in header.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()

    t_str = parts.get("t")
    v1 = parts.get("v1")
    if not t_str or not v1:
        return False

    try:
        timestamp = float(t_str)
    except (ValueError, TypeError):
        return False

    now = time.time()
    if abs(now - timestamp) > tolerance_seconds:
        return False

    body_bytes = raw_body if isinstance(raw_body, bytes) else raw_body.encode("utf-8")
    message = f"{t_str}.".encode("utf-8") + body_bytes

    expected = hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(v1, expected)


def construct_event(
    raw_body: Union[str, bytes],
    header: Optional[str],
    secret: str,
    tolerance_seconds: int = 300,
) -> Dict[str, Any]:
    """
    Verifies the webhook signature and returns the parsed event dictionary.
    Raises WebhookSignatureError if the signature is invalid or expired.
    """
    if not verify_signature(raw_body, header, secret, tolerance_seconds):
        raise WebhookSignatureError("Invalid or expired Telenotify webhook signature")

    body_str = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else raw_body
    return json.loads(body_str)
