import hashlib
import hmac
import json
import time
import unittest

from telenotify.errors import WebhookSignatureError
from telenotify.webhooks import construct_event, verify_signature


def sign_payload(body: str, secret: str, timestamp: int) -> str:
    msg = f"{timestamp}.{body}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={sig}"


class TestWebhooks(unittest.TestCase):
    def setUp(self):
        self.secret = "whsec_test_secret"
        self.event_data = {
            "id": "evt_123",
            "event": "message.sent",
            "data": {"id": "msg_456", "to": "cust_1"},
        }
        self.body_str = json.dumps(self.event_data)

    def test_verifies_valid_signature_and_constructs_event(self):
        now = int(time.time())
        header = sign_payload(self.body_str, self.secret, now)

        # test with string
        self.assertTrue(verify_signature(self.body_str, header, self.secret))
        event = construct_event(self.body_str, header, self.secret)
        self.assertEqual(event["id"], "evt_123")
        self.assertEqual(event["event"], "message.sent")
        self.assertEqual(event["data"]["id"], "msg_456")

        # test with bytes
        body_bytes = self.body_str.encode("utf-8")
        self.assertTrue(verify_signature(body_bytes, header, self.secret))
        event_bytes = construct_event(body_bytes, header, self.secret)
        self.assertEqual(event_bytes["id"], "evt_123")

    def test_rejects_expired_timestamp(self):
        old_time = int(time.time()) - 600
        header = sign_payload(self.body_str, self.secret, old_time)

        self.assertFalse(verify_signature(self.body_str, header, self.secret))
        with self.assertRaises(WebhookSignatureError):
            construct_event(self.body_str, header, self.secret)

    def test_rejects_invalid_secret_or_tampered_body(self):
        now = int(time.time())
        header = sign_payload(self.body_str, self.secret, now)

        # Wrong secret
        self.assertFalse(verify_signature(self.body_str, header, "wrong_secret"))
        with self.assertRaises(WebhookSignatureError):
            construct_event(self.body_str, header, "wrong_secret")

        # Tampered body
        tampered_body = self.body_str + " "
        self.assertFalse(verify_signature(tampered_body, header, self.secret))
        with self.assertRaises(WebhookSignatureError):
            construct_event(tampered_body, header, self.secret)

    def test_handles_missing_or_corrupt_header(self):
        self.assertFalse(verify_signature(self.body_str, None, self.secret))
        self.assertFalse(verify_signature(self.body_str, "", self.secret))
        self.assertFalse(verify_signature(self.body_str, "not-a-valid-header", self.secret))
        self.assertFalse(verify_signature(self.body_str, "t=abc,v1=123", self.secret))
        self.assertFalse(verify_signature(self.body_str, "t=123", self.secret))


if __name__ == "__main__":
    unittest.main()
