import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional


def verify_token(
    token: Optional[str],
    signing_secret: str,
    now: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Checks the token from the Verify widget ('verified' event) or the hosted page
    (?telenotify_token=...) with your signing secret. Returns the parsed result dict
    when authentic and not expired (valid for 10 minutes), otherwise None.

    Never trust the verified phone number without checking this token on your server.
    """
    if not token or not signing_secret:
        return None

    parts = token.split(".")
    if len(parts) != 2:
        return None

    payload_b64, signature_b64 = parts
    if not payload_b64 or not signature_b64:
        return None

    expected_digest = hmac.new(
        signing_secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    try:
        sig_pad = (4 - len(signature_b64) % 4) % 4
        given_digest = base64.urlsafe_b64decode(signature_b64 + ("=" * sig_pad))
    except Exception:
        return None

    if len(given_digest) != len(expected_digest) or not hmac.compare_digest(
        given_digest, expected_digest
    ):
        return None

    try:
        pay_pad = (4 - len(payload_b64) % 4) % 4
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + ("=" * pay_pad))
        result = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return None

    current_time = time.time() if now is None else now
    exp = result.get("exp")
    if not isinstance(exp, (int, float)) or exp <= current_time:
        return None

    return result
