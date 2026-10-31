# telenotify-python

Official Python client for **[Telenotify](https://telenotify.duckdns.org)**: customer notifications and phone verification on Telegram, with an instant signal when you should fall back to SMS.

- **Zero dependencies**: works out of the box using Python's standard library (Python 3.8+).
- **Typed**: full type annotations and `py.typed` PEP 561 compliance.
- **Resilient**: automatic retries with exponential backoff for network errors, 429 and 5xx on safe/idempotent requests.
- **Framework friendly**: drop-in webhook verification for Django, FastAPI, and Flask.

## Installation

```bash
pip install telenotify
```

## Quick start

Get your API key (`tn_test_…` for sandbox or `tn_live_…` for production) from the [Telenotify Developer Portal](https://telenotify.duckdns.org).

```python
import os
from telenotify import Telenotify

client = Telenotify(
    api_key=os.environ.get("TELENOTIFY_API_KEY"),
)

# Send a notification
message = client.messages.send(
    to="customer_123",
    text="Your order #1042 has shipped! 🚚",
    format="markdown",
    buttons=[[{"text": "Track Order", "url": "https://example.com/track/1042"}]],
    idempotency_key="order-1042-shipped",
)

if message["status"] == "UNDELIVERABLE":
    # Customer is not connected to your bot or blocked it:
    # Trigger your own SMS fallback if needed!
    print(f"Fallback reason: {message.get('reason')}")
```

## Connecting Customers

Generate a one-time connection link or QR code so customers connect their Telegram account to your bot:

```python
# Generate link
link = client.customers.create_link("customer_123")
print("Connect link:", link["url"])  # e.g. https://t.me/YourBot?start=tok_...

# Check if customer is reachable on Telegram
customer = client.customers.get("customer_123")
if customer.get("reachable"):
    print("Customer is ready to receive Telegram messages!")
```

## Templates (Multilingual: English, Amharic, Afaan Oromo, Tigrinya)

Manage templates in the developer portal and trigger them by key:

```python
# Set customer language
client.customers.upsert("customer_123", locale="am")

# Send template with placeholders
client.messages.send(
    to="customer_123",
    template="payment_received",
    params={"amount": "1,500 ETB", "payer": "Abebe", "ref": "TX-9921"},
    priority="high",
)
```

## Webhooks

Telenotify sends signed webhook events (`x-telenotify-signature`). Verify incoming requests before processing:

### FastAPI

```python
from fastapi import FastAPI, Header, HTTPException, Request
from telenotify import construct_event, WebhookSignatureError

app = FastAPI()
SIGNING_SECRET = os.environ["TELENOTIFY_SIGNING_SECRET"]

@app.post("/webhooks/telenotify")
async def telenotify_webhook(
    request: Request,
    x_telenotify_signature: str = Header(None),
):
    raw_body = await request.body()
    try:
        event = construct_event(raw_body, x_telenotify_signature, SIGNING_SECRET)
    except WebhookSignatureError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["event"]
    data = event["data"]

    if event_type == "message.sent":
        print(f"Message {data['id']} delivered to Telegram")
    elif event_type == "message.undeliverable":
        print(f"Message {data['id']} undeliverable ({data.get('reason')})")

    return {"status": "ok"}
```

### Django

```python
import os
from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from telenotify import construct_event, WebhookSignatureError

SIGNING_SECRET = os.environ["TELENOTIFY_SIGNING_SECRET"]

@csrf_exempt
def telenotify_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    signature = request.headers.get("x-telenotify-signature")
    try:
        event = construct_event(request.body, signature, SIGNING_SECRET)
    except WebhookSignatureError:
        return HttpResponseBadRequest("Invalid signature")

    # Process event...
    return HttpResponse(status=200)
```

### Flask

```python
import os
from flask import Flask, request, jsonify
from telenotify import construct_event, WebhookSignatureError

app = Flask(__name__)
SIGNING_SECRET = os.environ["TELENOTIFY_SIGNING_SECRET"]

@app.route("/webhooks/telenotify", methods=["POST"])
def webhook():
    signature = request.headers.get("x-telenotify-signature")
    try:
        event = construct_event(request.get_data(), signature, SIGNING_SECRET)
    except WebhookSignatureError:
        return jsonify({"error": "Invalid signature"}), 400

    return jsonify({"status": "ok"}), 200
```

## Phone Verification without SMS

Start a "Verify with Telegram" session:

```python
# Server-side initiation
verification = client.verifications.create(
    phone="0911223344",  # optional: customer must verify this number
    external_id="customer_123",
)
print("Redirect user to:", verification["url"])

# Check status
res = client.verifications.get(verification["id"])
if res["status"] == "VERIFIED":
    print("Phone verified:", res["phone"])
```

### Checking Verify Widget Tokens

When using `<telenotify-verify>` on frontend pages, the client receives a signed token. Verify it on your server:

```python
from telenotify import verify_token

result = verify_token(token, SIGNING_SECRET)
if result and result.get("status") == "VERIFIED":
    verified_phone = result["phone"]
    print(f"Verified {verified_phone} successfully")
```

## License

MIT
