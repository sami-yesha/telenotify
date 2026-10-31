import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from telenotify import Telenotify, TelenotifyError


class MockServerHandler(BaseHTTPRequestHandler):
    routes = {}
    requests_seen = []

    def log_message(self, format, *args):
        # Silence server log output during tests
        pass

    def do_GET(self):
        self._handle_request("GET")

    def do_POST(self):
        self._handle_request("POST")

    def do_PUT(self):
        self._handle_request("PUT")

    def _handle_request(self, method):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        req_info = {
            "method": method,
            "path": path,
            "query": query,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": body,
        }
        MockServerHandler.requests_seen.append(req_info)

        key = (method, path)
        if key in MockServerHandler.routes:
            handler_func = MockServerHandler.routes[key]
            status_code, resp_body = handler_func(req_info)
        else:
            status_code, resp_body = 404, {"message": "Not found"}

        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(resp_body).encode("utf-8"))


class TestTelenotifyClient(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), MockServerHandler)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        MockServerHandler.routes = {}
        MockServerHandler.requests_seen = []
        self.client = Telenotify(api_key="tn_test_secret_key", base_url=self.base_url)

    def test_sends_message_with_api_key_and_json_body(self):
        def handle_send(req):
            data = json.loads(req["body"])
            return 201, {
                "id": "msg_123",
                "to": data["to"],
                "status": "QUEUED",
                "text": data["text"],
            }

        MockServerHandler.routes[("POST", "/v1/messages")] = handle_send

        res = self.client.messages.send(
            to="cust_42",
            text="Your code is 1234",
            format="markdown",
            priority="high",
            idempotency_key="tx-123",
        )

        self.assertEqual(res["id"], "msg_123")
        self.assertEqual(res["status"], "QUEUED")

        req = MockServerHandler.requests_seen[0]
        self.assertEqual(req["headers"]["x-api-key"], "tn_test_secret_key")
        body = json.loads(req["body"])
        self.assertEqual(body["to"], "cust_42")
        self.assertEqual(body["text"], "Your code is 1234")
        self.assertEqual(body["format"], "markdown")
        self.assertEqual(body["priority"], "high")
        self.assertEqual(body["idempotencyKey"], "tx-123")

    def test_surfaces_api_errors_without_retrying_4xx(self):
        attempts = 0

        def handle_error(req):
            nonlocal attempts
            attempts += 1
            return 400, {"message": "Invalid customer ID", "code": "invalid_customer"}

        MockServerHandler.routes[("POST", "/v1/messages")] = handle_error

        with self.assertRaises(TelenotifyError) as ctx:
            self.client.messages.send(to="bad_id", text="Hello", idempotency_key="safe-key")

        self.assertEqual(ctx.exception.status, 400)
        self.assertEqual(ctx.exception.code, "invalid_customer")
        self.assertIn("Invalid customer ID", str(ctx.exception))
        # Should not retry 400
        self.assertEqual(attempts, 1)

    def test_retries_5xx_and_429_when_idempotent(self):
        attempts = 0

        def handle_flaky(req):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                return 503, {"message": "Service unavailable"}
            return 200, {"id": "msg_success", "status": "QUEUED"}

        MockServerHandler.routes[("POST", "/v1/messages")] = handle_flaky

        res = self.client.messages.send(
            to="cust_1",
            text="Hello",
            idempotency_key="retry-me",
        )
        self.assertEqual(res["id"], "msg_success")
        self.assertEqual(attempts, 2)

    def test_does_not_retry_send_without_idempotency_key(self):
        attempts = 0

        def handle_500(req):
            nonlocal attempts
            attempts += 1
            return 500, {"message": "Internal error"}

        MockServerHandler.routes[("POST", "/v1/messages")] = handle_500

        with self.assertRaises(TelenotifyError) as ctx:
            self.client.messages.send(to="cust_1", text="Hello")

        self.assertEqual(ctx.exception.status, 500)
        self.assertEqual(attempts, 1)

    def test_encodes_urls_and_query_params(self):
        MockServerHandler.routes[("GET", "/v1/messages/msg%2Fspecial%20id")] = (
            lambda req: (200, {"id": "msg/special id", "status": "SENT"})
        )

        res = self.client.messages.get("msg/special id")
        self.assertEqual(res["id"], "msg/special id")

        # List with query params
        def handle_list(req):
            self.assertEqual(req["query"]["customer"], ["cust_99"])
            self.assertEqual(req["query"]["limit"], ["10"])
            return 200, {"data": [], "nextCursor": None}

        MockServerHandler.routes[("GET", "/v1/messages")] = handle_list
        page = self.client.messages.list(customer="cust_99", limit=10)
        self.assertEqual(page["data"], [])

    def test_customers_and_verifications_and_templates(self):
        # Customer create_link
        MockServerHandler.routes[("POST", "/v1/customers/link")] = (
            lambda req: (200, {"token": "tok_1", "url": "https://t.me/mybot?start=tok_1"})
        )
        link = self.client.customers.create_link("cust_1", phone="0911000000")
        self.assertEqual(link["token"], "tok_1")

        # Customer get
        MockServerHandler.routes[("GET", "/v1/customers/cust_1")] = (
            lambda req: (200, {"externalId": "cust_1", "reachable": True})
        )
        cust = self.client.customers.get("cust_1")
        self.assertTrue(cust["reachable"])

        # Customer upsert
        MockServerHandler.routes[("PUT", "/v1/customers/cust_1")] = (
            lambda req: (200, {"externalId": "cust_1", "locale": "am"})
        )
        upserted = self.client.customers.upsert("cust_1", locale="am")
        self.assertEqual(upserted["locale"], "am")

        # Verification create
        MockServerHandler.routes[("POST", "/v1/verifications")] = (
            lambda req: (200, {"id": "v_1", "status": "PENDING", "url": "https://t.me/mybot?start=v_1"})
        )
        ver = self.client.verifications.create(phone="0911223344", external_id="cust_1")
        self.assertEqual(ver["id"], "v_1")

        # Verification get
        MockServerHandler.routes[("GET", "/v1/verifications/v_1")] = (
            lambda req: (200, {"id": "v_1", "status": "VERIFIED", "phone": "251911223344"})
        )
        v_res = self.client.verifications.get("v_1")
        self.assertEqual(v_res["status"], "VERIFIED")

        # Templates list
        MockServerHandler.routes[("GET", "/v1/templates")] = (
            lambda req: (200, [{"key": "payment_received", "name": "Payment"}])
        )
        tpls = self.client.templates.list()
        self.assertEqual(len(tpls), 1)
        self.assertEqual(tpls[0]["key"], "payment_received")


if __name__ == "__main__":
    unittest.main()
