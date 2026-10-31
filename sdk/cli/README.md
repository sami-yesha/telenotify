# telenotify

The official CLI for [Telenotify](https://telenotify.duckdns.org): receive webhook events on `localhost` without setting up public tunnels (no ngrok, no port forwarding), trigger sample events, and send test messages directly from your terminal.

- **Local webhook forwarding**: receive webhook events in development and forward them to your local server with valid `x-telenotify-signature` headers.
- **Trigger sample events**: emit real events (`message.sent`, `message.undeliverable`, `customer.linked`, etc.) on demand.
- **Zero tunnels needed**: polls your environment's event stream over a secure session; your signing secret never leaves the server.
- **Send messages directly**: test sends against sandbox test customers (`test_linked`, `test_not_linked`, `test_blocked`) from the command line.

## Quick start

No global installation required:

```bash
# 1. Log in with your API key (portal -> API keys)
npx telenotify login

# 2. Forward events to your local application
npx telenotify listen --forward http://localhost:3000/webhooks/telenotify

# 3. In another terminal, trigger a sample event
npx telenotify trigger message.undeliverable
```

## Commands

### `npx telenotify login`
Authenticates the CLI. Prompts for your API key (`tn_test_…` or `tn_live_…`) and tests it against the API. The key is securely saved to `~/.config/telenotify/config.json` with `0600` permissions (readable only by your user account).

```bash
npx telenotify login
```

### `npx telenotify listen [options]`
Starts a listening session. Telenotify records events for your environment while the CLI is active even if no public webhook URL is configured in the portal.

```bash
# Forward to your local webhook endpoint:
npx telenotify listen --forward http://localhost:3000/webhooks/telenotify

# Print event payloads in the terminal:
npx telenotify listen --print-json
```

Each forwarded event includes:
- `x-telenotify-signature`: valid HMAC-SHA256 signature calculated on the server with your environment's signing secret.
- `x-telenotify-event-id`: unique, idempotent event ID.
- `content-type: application/json`.

### `npx telenotify trigger <event>`
Sends a realistic sample webhook event to your running `telenotify listen` session (and to your public webhook URL, if configured).

```bash
# See all triggerable events:
npx telenotify trigger --list

# Trigger a specific event:
npx telenotify trigger message.sent
npx telenotify trigger message.undeliverable
npx telenotify trigger verification.completed
```

Supported events:
- `message.sent`
- `message.undeliverable`
- `message.failed`
- `message.received`
- `message.fallback_sent`
- `message.fallback_failed`
- `customer.linked`
- `customer.blocked`
- `verification.completed`
- `verification.failed`
- `webhook.test`

### `npx telenotify send <customer> <text>`
Sends a message to a customer ID:

```bash
# Send plain text to the sandbox test customer:
npx telenotify send test_linked "Your order is ready!"

# Send formatted text with Markdown:
npx telenotify send test_linked "**Important**: Use code `123456`" --markdown
```

### `npx telenotify logout`
Removes the saved credentials from your machine.

## Configuration & Flags

All commands accept the following flags and environment variables:

| Flag | Environment Variable | Description |
|---|---|---|
| `--key <tn_...>` | `TELENOTIFY_API_KEY` | Override the API key |
| `--api-url <url>` | `TELENOTIFY_API_URL` | Override the API base URL (default: `https://telenotify-api.duckdns.org`) |
| `--print-json` | — | Print JSON payloads in `listen` mode |
| `--markdown` | — | Enable Markdown formatting in `send` mode |
| `-h`, `--help` | — | Show help |
| `-v`, `--version` | — | Show version |

## License

MIT
