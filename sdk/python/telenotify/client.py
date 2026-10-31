import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Union

from .errors import TelenotifyError
from .types import (
    ConnectLink,
    Customer,
    InlineButton,
    Layout,
    Locale,
    Message,
    MessageFormat,
    MessageStatus,
    MessageTemplate,
    Page,
    Priority,
    Verification,
)


class Telenotify:
    """Official Python client for the Telenotify API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 10.0,
        max_retries: int = 2,
    ):
        resolved_key = api_key or os.environ.get("TELENOTIFY_API_KEY") or os.environ.get("TELENOTIFY_KEY")
        if not resolved_key:
            raise ValueError(
                "Telenotify: api_key is required. Pass it to Telenotify(api_key=...) "
                "or set the TELENOTIFY_API_KEY environment variable."
            )
        self.api_key: str = resolved_key

        resolved_url = base_url or os.environ.get("TELENOTIFY_API_URL") or "https://telenotify-api.duckdns.org"
        self.base_url: str = resolved_url.rstrip("/")
        self.timeout: float = timeout
        self.max_retries: int = max_retries

        self.messages: Messages = Messages(self)
        self.customers: Customers = Customers(self)
        self.verifications: Verifications = Verifications(self)
        self.templates: Templates = Templates(self)

    def request(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Any] = None,
        retryable: bool = False,
    ) -> Any:
        """Executes an HTTP request to the Telenotify API with optional retries."""
        url = f"{self.base_url}{path}"
        if query:
            filtered_query = {k: v for k, v in query.items() if v is not None}
            if filtered_query:
                url = f"{url}?{urllib.parse.urlencode(filtered_query)}"

        headers = {
            "x-api-key": self.api_key,
            "user-agent": "telenotify-python/0.1.0",
        }
        encoded_body: Optional[bytes] = None
        if body is not None:
            headers["content-type"] = "application/json"
            encoded_body = json.dumps(body).encode("utf-8")

        attempts = self.max_retries + 1 if retryable else 1
        last_error: Optional[TelenotifyError] = None

        for attempt in range(1, attempts + 1):
            req = urllib.request.Request(
                url=url,
                data=encoded_body,
                headers=headers,
                method=method.upper(),
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    raw_data = response.read().decode("utf-8")
                    if not raw_data.strip():
                        return {}
                    return json.loads(raw_data)
            except urllib.error.HTTPError as err:
                raw_payload = err.read().decode("utf-8")
                payload: Dict[str, Any] = {}
                try:
                    payload = json.loads(raw_payload) if raw_payload else {}
                except Exception:
                    pass

                raw_msg = payload.get("message")
                if isinstance(raw_msg, list):
                    msg = ", ".join(str(m) for m in raw_msg)
                elif isinstance(raw_msg, str):
                    msg = raw_msg
                else:
                    msg = f"Telenotify API error {err.code}"

                code = payload.get("code") if isinstance(payload.get("code"), str) else None
                last_error = TelenotifyError(msg, status=err.code, code=code)

                # Only 429 and 5xx are retryable
                if not (err.code == 429 or err.code >= 500):
                    raise last_error
            except (urllib.error.URLError, TimeoutError, OSError) as err:
                err_msg = str(err) or "Network error"
                last_error = TelenotifyError(err_msg, status=0)

            if attempt < attempts:
                sleep_sec = min(4.0, 0.3 * (2 ** (attempt - 1)))
                time.sleep(sleep_sec)

        raise last_error  # type: ignore[misc]


class Messages:
    """Manages notifications, OTPs, and alerts sent to customers."""

    def __init__(self, client: Telenotify):
        self._client = client

    def send(
        self,
        to: str,
        text: Optional[str] = None,
        format: Optional[MessageFormat] = None,
        layout: Optional[Union[Layout, Dict[str, Any]]] = None,
        template: Optional[str] = None,
        params: Optional[Dict[str, Union[str, int, float]]] = None,
        locale: Optional[Locale] = None,
        buttons: Optional[List[List[Union[InlineButton, Dict[str, str]]]]] = None,
        idempotency_key: Optional[str] = None,
        idempotencyKey: Optional[str] = None,
        priority: Optional[Priority] = None,
        fallback: Optional[bool] = None,
    ) -> Message:
        """
        Sends a message on Telegram. Check the returned `status`:
        - 'UNDELIVERABLE': The customer cannot be reached on Telegram.
        - 'QUEUED': The message was accepted for delivery.
        """
        payload: Dict[str, Any] = {"to": to}
        if text is not None:
            payload["text"] = text
        if format is not None:
            payload["format"] = format
        if layout is not None:
            payload["layout"] = layout
        if template is not None:
            payload["template"] = template
        if params is not None:
            payload["params"] = params
        if locale is not None:
            payload["locale"] = locale
        if buttons is not None:
            payload["buttons"] = buttons

        resolved_idempotency = idempotency_key if idempotency_key is not None else idempotencyKey
        if resolved_idempotency is not None:
            payload["idempotencyKey"] = resolved_idempotency

        if priority is not None:
            payload["priority"] = priority
        if fallback is not None:
            payload["fallback"] = fallback

        return self._client.request(
            method="POST",
            path="/v1/messages",
            body=payload,
            retryable=bool(resolved_idempotency),
        )

    def get(self, id: str) -> Message:
        """Gets a message by its ID."""
        return self._client.request(
            method="GET",
            path=f"/v1/messages/{urllib.parse.quote(id, safe='')}",
            retryable=True,
        )

    def list(
        self,
        customer: Optional[str] = None,
        status: Optional[MessageStatus] = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Page:
        """Lists message history with cursor-based pagination."""
        query: Dict[str, Any] = {
            "customer": customer,
            "status": status,
            "cursor": cursor,
            "limit": limit,
        }
        return self._client.request(
            method="GET",
            path="/v1/messages",
            query=query,
            retryable=True,
        )


class Customers:
    """Manages customer records and Telegram connection links."""

    def __init__(self, client: Telenotify):
        self._client = client

    def create_link(
        self,
        external_id: str,
        phone: Optional[str] = None,
    ) -> ConnectLink:
        """
        Generates a one-time t.me connection link for an external customer ID.
        Display this as a button or QR code so the customer connects their Telegram.
        """
        payload: Dict[str, Any] = {"externalId": external_id}
        if phone is not None:
            payload["phone"] = phone
        return self._client.request(
            method="POST",
            path="/v1/customers/link",
            body=payload,
            retryable=False,
        )

    def get(self, external_id: str) -> Customer:
        """Fetches customer status, including whether they are reachable on Telegram."""
        return self._client.request(
            method="GET",
            path=f"/v1/customers/{urllib.parse.quote(external_id, safe='')}",
            retryable=True,
        )

    def upsert(
        self,
        external_id: str,
        phone: Optional[str] = None,
        locale: Optional[Locale] = None,
    ) -> Customer:
        """Creates or updates a customer profile (phone, preferred language)."""
        payload: Dict[str, Any] = {}
        if phone is not None:
            payload["phone"] = phone
        if locale is not None:
            payload["locale"] = locale
        return self._client.request(
            method="PUT",
            path=f"/v1/customers/{urllib.parse.quote(external_id, safe='')}",
            body=payload,
            retryable=True,
        )


class Verifications:
    """Handles Telegram phone number verifications without SMS costs."""

    def __init__(self, client: Telenotify):
        self._client = client

    def create(
        self,
        phone: Optional[str] = None,
        external_id: Optional[str] = None,
        return_url: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> Verification:
        """
        Starts a 'Verify with Telegram' session.
        Redirect the user to the returned `hostedUrl` or embed with `<telenotify-verify>`.
        """
        payload: Dict[str, Any] = {}
        if phone is not None:
            payload["phone"] = phone
        if external_id is not None:
            payload["externalId"] = external_id
        if return_url is not None:
            payload["returnUrl"] = return_url
        if origin is not None:
            payload["origin"] = origin
        return self._client.request(
            method="POST",
            path="/v1/verifications",
            body=payload,
            retryable=False,
        )

    def get(self, id: str) -> Verification:
        """Gets verification session details and status."""
        return self._client.request(
            method="GET",
            path=f"/v1/verifications/{urllib.parse.quote(id, safe='')}",
            retryable=True,
        )


class Templates:
    """Lists reusable message templates configured in the developer portal."""

    def __init__(self, client: Telenotify):
        self._client = client

    def list(self) -> List[MessageTemplate]:
        """Lists message templates, languages, and {{placeholders}}."""
        return self._client.request(
            method="GET",
            path="/v1/templates",
            retryable=True,
        )
