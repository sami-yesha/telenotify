import base64
import hashlib
import hmac
import json
import time
import unittest

from telenotify.verification_token import verify_token


def make_token(payload: dict, secret: str) -> str:
    raw_json = json.dumps(payload).encode("utf-8")
    p_b64 = base64.urlsafe_b64encode(raw_json).decode("utf-8").rstrip("=")
    sig_bytes = hmac.new(secret.encode("utf-8"), p_b64.encode("utf-8"), hashlib.sha256).digest()
    s_b64 = base64.urlsafe_b64encode(sig_bytes).decode("utf-8").rstrip("=")
    return f"{p_b64}.{s_b64}"


class TestVerificationToken(unittest.TestCase):
    def test_verifies_valid_token(self):
        secret = "secret_123"
        now = time.time()
        payload = {
            "id": "ver_abc",
            "status": "VERIFIED",
            "phone": "251911223344",
            "exp": int(now + 600),
        }
        token = make_token(payload, secret)
        result = verify_token(token, secret, now=now)
        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "ver_abc")
        self.assertEqual(result["status"], "VERIFIED")
        self.assertEqual(result["phone"], "251911223344")

    def test_rejects_expired_token(self):
        secret = "secret_123"
        now = time.time()
        payload = {
            "id": "ver_old",
            "status": "VERIFIED",
            "phone": "251911223344",
            "exp": int(now - 10),
        }
        token = make_token(payload, secret)
        result = verify_token(token, secret, now=now)
        self.assertIsNone(result)

    def test_rejects_tampered_signature(self):
        secret = "secret_123"
        payload = {
            "id": "ver_abc",
            "status": "VERIFIED",
            "phone": "251911223344",
            "exp": int(time.time() + 600),
        }
        token = make_token(payload, secret)
        # Verify with wrong secret
        self.assertIsNone(verify_token(token, "wrong_secret"))
        # Tamper payload
        parts = token.split(".")
        tampered = f"extra_{parts[0]}.{parts[1]}"
        self.assertIsNone(verify_token(tampered, secret))

    def test_handles_empty_or_malformed_input(self):
        self.assertIsNone(verify_token(None, "secret"))
        self.assertIsNone(verify_token("", "secret"))
        self.assertIsNone(verify_token("invalid", "secret"))
        self.assertIsNone(verify_token("a.b.c", "secret"))
        self.assertIsNone(verify_token("notbase64.notbase64", "secret"))
        self.assertIsNone(verify_token("valid_format.sig", ""))


if __name__ == "__main__":
    unittest.main()
