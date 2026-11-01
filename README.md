<p align="center">
  <img src="docs/brand/telenotify-mark-512.png" width="96" alt="Telenotify logo" />
</p>

<h1 align="center">Telenotify</h1>

<p align="center">
  <b>Customer notifications and phone verification on Telegram, with one API call.</b><br />
  Free and open source. Built in Ethiopia.
</p>

<p align="center">
  <a href="https://telenotify.duckdns.org">Website</a> ·
  <a href="https://telenotify.duckdns.org/signup">Hosted (free)</a> ·
  <a href="https://www.npmjs.com/package/@telenotify/node">Node.js SDK</a> ·
  <a href="#self-host">Self-host</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0" /></a>
  <a href="https://www.npmjs.com/package/@telenotify/node"><img src="https://img.shields.io/npm/v/@telenotify/node?label=%40telenotify%2Fnode" alt="npm" /></a>
</p>

---

Businesses send order updates, OTPs, payment alerts and receipts through **their own branded Telegram bot**, from one REST call. Telegram doesn't charge per message, so it's a much cheaper first channel than SMS for customers who use it.

- **Notifications:** plain text or templates in English, Amharic, Afaan Oromo and Tigrinya, with URL buttons, idempotency and a priority lane for OTPs.
- **Phone verification without SMS:** "Verify with Telegram": the customer shares their number with your bot in one tap, and Telegram vouches for it. Add it to any website with **one line** (the Verify widget): a hosted verify page, a signed result, no backend endpoint to start it.
- **An honest fallback signal:** when a customer can't be reached on Telegram, the API says so immediately (`UNDELIVERABLE` + reason), so your SMS or email provider takes over. It can also send that SMS for you through your own AfroMessage account.
- **Developer portal:** sandbox with test customers, API keys, signed webhooks with retries and a delivery log, request log, analytics, team, audit log, and an interactive API reference with code in six languages.

**Use it hosted for free** (fair use: 1,000 live messages and verifications per organization per month, more on approved request) or **run it yourself with no limits**.

```
.             NestJS API (public /v1 API, portal API, auth, Telegram webhooks)
portal/       Next.js developer portal (talks to the API through its /api proxy)
sdk/node/     @telenotify/node: official Node.js/TypeScript SDK
sdk/python/   telenotify: official Python SDK (Django, FastAPI, Flask)
sdk/cli/      telenotify CLI: webhooks on localhost, sample events, test sends
```

## Run locally

```bash
docker compose up -d                  # Postgres :5440, Redis :6390
cp .env.example .env                  # fill ENCRYPTION_KEY, SANDBOX_WEBHOOK_SECRET, ...
npm install && npx prisma migrate deploy
npm run start:dev                     # API on :3000, reference at /docs

cd portal
cp .env.example .env.local
npm install && npm run dev            # portal on http://localhost:3001
```

- **Email:** without `SMTP_URL`, verification and reset emails are printed in the API log. Open the link from there.
- **Google sign-in:** create an OAuth client and add `${PORTAL_URL}/api/auth/google/callback` as an authorized redirect URI. The button is hidden until `GOOGLE_CLIENT_ID`/`SECRET` are set.
- **Sandbox bot:** create one with @BotFather and set `SANDBOX_BOT_TOKEN`. Telegram must reach `PUBLIC_BASE_URL` over HTTPS, so use a tunnel locally (`cloudflared tunnel --url http://localhost:3000`). Without it, the test customers still work.

## Concepts

| | Sandbox | Live |
|---|---|---|
| API key | `tn_test_…` | `tn_live_…` |
| Bot | Shared Telenotify sandbox bot; messages are labelled `[SANDBOX · Org]` | The organization's own @BotFather bot |
| Limits | 100 messages/day, 10 linked Telegram users | none yet |
| Test customers | `test_linked`, `test_not_linked`, `test_blocked`, `test_chat_gone`, `test_telegram_down` | — |
| Webhook URL | http or https | https only |

Every customer, message, key and webhook setting belongs to one environment.

## Public API (`x-api-key`)

| Method | Path | |
|---|---|---|
| POST | `/v1/customers/link` | One-time `t.me` connect link for `externalId` |
| PUT / GET | `/v1/customers/:externalId` | Upsert (phone, `locale`) / status incl. `reachable` |
| POST | `/v1/messages` | Send `text`, or a `template` + `params` (+ optional `locale`). Returns `QUEUED`, or `UNDELIVERABLE` + `reason` right away |
| GET | `/v1/templates` | Templates with their languages and placeholders |
| GET | `/v1/messages`, `/v1/messages/:id` | History (cursor pagination) / status |

Templates are managed in the portal (per organization, shared by sandbox and live) with `en`, `am`, `om` and `ti` variants and `{{placeholder}}` values. The language is the `locale` sent, else the customer's locale, else the template default; missing params return 400.

**SMS fallback (bring your own AfroMessage).** Optional, per environment, set on the portal's SMS fallback page. When a message ends `UNDELIVERABLE` or `FAILED` and the customer has a phone, the same text (buttons written as `label: link` lines) is sent through the organization's own AfroMessage account; the token is stored encrypted and the organization pays AfroMessage directly. Messages carry `fallback: { channel: "sms", status: queued | sent | failed | skipped, error, at }`; `"fallback": false` on a send opts that message out. The sandbox simulates it without credentials.

### Verify widget (one-line phone verification)

```html
<script src="https://<portal>/verify.js" defer></script>
<telenotify-verify key="tn_pk_live_…"></telenotify-verify>
```

The button opens the hosted page `/verify/<id>` in a popup; when the person verifies in Telegram, the page receives a `verified` event with `{ id, phone, token }`. The token is HMAC-signed with the environment's signing secret and valid for 10 minutes; check it server-side with `verifyToken()` from `@telenotify/node`. Publishable keys (`tn_pk_…`) can only start verifications and, in live, only from the allowed websites set in the portal; a browser can't pass `externalId`. Server-side alternative: `POST /v1/verifications` with `returnUrl` and redirect to the returned `hostedUrl`.

Message results:

| Status | Reason | Meaning |
|---|---|---|
| `QUEUED` | — | Accepted; the final result arrives as an event |
| `SENT` | — | Telegram accepted it |
| `UNDELIVERABLE` | `not_linked`, `blocked`, `chat_gone` | Can't reach this customer on Telegram; use your fallback |
| `FAILED` | `telegram_unavailable`, `telegram_rejected` | Telegram kept failing (after 5 tries) or rejected the content |

Events (queued with retries; signed with `x-telenotify-signature: t=<ts>,v1=HMAC_SHA256(secret, "<ts>.<body>")`, plus a stable `x-telenotify-event-id`): `message.sent`, `message.undeliverable`, `message.failed`, `message.received`, `message.fallback_sent`, `message.fallback_failed`, `customer.linked`, `customer.blocked`, `webhook.test`.

## Portal

The portal includes:

- **Accounts:** sign up with email and password (with email verification and password reset), or with Google.
- **Organizations:** create several and switch between them; each one starts with a sandbox key.
- **Sandbox / Live switch.**
- **Get started:** a checklist and usage numbers.
- **Playground:** connect your own Telegram and send to any customer, including the test customers.
- **API keys:** create and revoke.
- **Webhooks:** set the URL, send a test event, rotate the signing secret.
- **Live bot:** connect your own bot.
- **Logs:** messages and customers.
- **Integration guide.**
- **Telenotify Pass:** an optional network of people who verified their phone once. When a business passes `phone` to a verification, a member gets a Yes/No in our Pass bot (`PASS_BOT_TOKEN`) and confirms with one tap (`method: "pass"`). Opt-in, `/stop` deletes them, membership is never revealed to businesses, and requests are rate-limited.
- **Verified business badge:** owners send their legal name, TIN and trade license from Organization settings; an operator checks them and approves in `/admin`. The badge shows on the hosted verify page, at the public `/check` page ("Is this bot real?") and, optionally, on the bot's Telegram profile. Only the hosted service can grant it (see [TRADEMARK.md](TRADEMARK.md)).

## Security

- **Rate limits** (`src/common/throttling.ts`), per client IP and per email:

  | Route | Limit |
  |---|---|
  | login | 10 per minute per IP; 5 per 15 minutes per email (then blocked for 15 minutes) |
  | signup | 5 per 10 minutes |
  | forgot-password | 5 per 15 minutes per IP; 3 per hour per email |
  | resend-verification | 3 per 10 minutes |

  Counters live in memory, which is correct for a single API instance.
- **Webhook URLs:** URLs that point at private, loopback, link-local (cloud metadata) or reserved addresses are rejected when saved. Every address is checked again at connection time, so changing DNS later can't get around the check. Redirects are not followed. Set `ALLOW_PRIVATE_WEBHOOK_URLS=true` only for local development.
- **Webhook delivery:** events are queued in Redis and retried 10 times with exponential backoff (about 40 minutes in total). `x-telenotify-event-id` stays the same across retries, so receivers can de-duplicate.
- **Client IP:** the API trusts `X-Forwarded-For` only from `TRUST_PROXY` hops. Next.js keeps any `X-Forwarded-For` it receives, so in production the portal must sit behind a proxy that overwrites it. The Caddy setup below does this.

## Running the hosted service (operators)

Put your email in `OPERATOR_EMAILS` and open **/admin** in the portal (also in the account menu). From there you approve live sending, suspend or unsuspend organizations and raise limits; every action goes into the organization's audit log.

- **New organizations** can send `UNAPPROVED_LIVE_DAILY_LIMIT` (100) live messages a day until approved. They request a review on the Live → Telegram bot page, and operators get an email (and a Telegram message when `OPERATOR_TELEGRAM_CHAT_ID` is set).
- **Suspended organizations** get `403 org_suspended` on every API call and see the reason in their dashboard.
- **Spam detection:** when at least `AUTO_SUSPEND_MIN_BLOCKS` (10) recipients, and `AUTO_SUSPEND_BLOCK_RATIO` (30%) of those messaged, block a live bot within 24 hours, the organization is suspended automatically and operators are alerted.

## Self-host
<a id="self-host"></a>

One server with Docker is enough: the API, portal, Postgres and Redis, behind Caddy for HTTPS.

```bash
git clone https://github.com/sami-yesha/telenotify.git
cd telenotify/deploy
cp .env.production.example .env.production   # fill in domains, secrets, bot token
docker compose --env-file .env.production up -d --build
```

Back up the database and `ENCRYPTION_KEY`: see [docs/BACKUPS.md](docs/BACKUPS.md).

## Deploy

Test environment on Vercel (portal) + Render free (API): see [docs/DEPLOY.md](docs/DEPLOY.md) and `render.yaml`.

Pushes to `main` deploy the hosted service automatically through GitHub Actions: see [docs/AUTO-DEPLOY.md](docs/AUTO-DEPLOY.md).

### Single server, Docker

```bash
cd deploy
cp .env.production.example .env.production   # fill in domains, secrets, bot, Google, SMTP
docker compose --env-file .env.production up -d --build
```

- **Before starting:** point the `API_DOMAIN` and `PORTAL_DOMAIN` DNS records at the server. Caddy gets HTTPS certificates automatically.
- **Exposed ports:** only Caddy listens publicly (80/443). It sets `X-Forwarded-For` to the real client, and the API runs with `TRUST_PROXY=1`.
- **Migrations:** the API applies pending database migrations each time it starts.
- **Google:** add `https://<PORTAL_DOMAIN>/api/auth/google/callback` as a redirect URI, and publish the consent screen.
- **Back up** the `pgdata` volume and `ENCRYPTION_KEY`.

## Developer tools

- **Node SDK** (`sdk/node`, `@telenotify/node`): typed client for messages, customers and verifications; safe retries; `webhooks.constructEvent()`. Build and test with `npm test` in that folder.
- **Python SDK** (`sdk/python`, `telenotify`): typed, zero-dependency client with webhook verification and auto-retries for Django, FastAPI, and Flask. Test with `python3 -m unittest discover tests`.
- **CLI** (`sdk/cli`, `telenotify`): forward webhook events to `localhost` with valid HMAC signatures (`npx telenotify listen --forward …`), trigger sample events (`npx telenotify trigger …`), and send test messages without setting up public tunnels.
- **API reference** in the portal: every endpoint from the live OpenAPI spec, with "Send request" using your key, curl, and a Postman collection download.
- **Request log** (API keys page): each `/v1` call with status, timing, key and error message, kept 30 days.
- **Webhook delivery log** and **message detail** pages for debugging delivery.

## Account, team and compliance

- **Audit log:** key, bot, webhook, secret, team and plan changes are recorded per organization (Audit log page).
- **Usage alerts:** owners get an email at 80% and 100% of the monthly live quota, once per month.
- **Account and organization settings:** change name and password, delete the account; rename, leave or delete an organization. The last owner can't leave or delete their account while others remain.
- **Legal pages:** `/terms`, `/privacy` and `/refunds`, using `NEXT_PUBLIC_LEGAL_ENTITY` and `NEXT_PUBLIC_CONTACT_EMAIL`. They are a starting template: have a lawyer review them, and confirm the refund terms (7-day window, 10% usage, 72-hour outage) before launch.

## Not done yet

- Online plan payment (Chapa); owners request a higher limit in the portal and an operator approves it in `/admin`.
- Approval or KYC before an organization goes live.
- Data-residency and compliance notes (hosting location, DPA, subprocessors) for regulated customers.
- Rate-limit counters are per instance (in memory); use Redis storage before running more than one API instance.
- A retry can send a message twice if the database update fails right after Telegram accepts it.
- AfroMessage delivery reports: SMS fallback "sent" means accepted by AfroMessage, not delivered to the phone.
- Media and documents, and broadcasts.

## License

Telenotify is free software under the [GNU Affero General Public License v3.0](LICENSE): you can use, modify and self-host it. If you run a modified version as a service for others, you must share your changes under the same license.

The Node.js SDK in [`sdk/node`](sdk/node) is MIT licensed, so it can go into any application.

Need Telenotify under different terms (for example on-premise without the AGPL obligations)? Commercial licenses are available: open an issue or contact the maintainer. Contributors sign a short [CLA](CLA.md) so this stays possible.

The license covers the code, not the name. "Telenotify", the logo and the **Verified business** badge belong to the official project: see the [trademark policy](TRADEMARK.md). In short, say "built on Telenotify" freely, but give a modified hosted copy its own name, and never show the badge unless the official service granted it.
