# Telenotify roadmap: before payment integration

Agreed order (2026-10-22). Tick items as they ship; keep this file current.

## Batch 1: Developer debugging ✅ (done 2026-10-22)
- [x] Webhook delivery log in the portal: every event with status, attempts, HTTP response, payload
- [x] Resend a webhook event from the portal
- [x] Message detail view: timeline, reason, request, related webhook events, "copy as curl"

## Batch 2: Required before taking money ✅ (done 2026-10-22)
- [x] Account settings: change name and password, linked Google account, delete account
- [x] Organization settings: rename, leave, delete organization
- [x] Terms of Service, Privacy Policy and Refund Policy pages
- [x] Usage alert emails at 80% and 100% of the plan quota
- [x] Audit log: keys created/revoked, bot connected, invites, plan changes

## Batch 3: Make the value visible ✅ (done 2026-10-22)
- [x] Analytics on Get started: messages per day, delivery rate, % reachable on Telegram, SMS money saved
- [x] Customer detail page: link status, phone, verification history, messages, send test, unlink
- [x] QR codes for connect links (downloadable PNG)
- [x] Quick search (Cmd+K) and a short first-login tour, with better empty states

## Batch 4: Faster integration ✅ (done 2026-10-22)
- [x] Official Node/TypeScript SDK (send, verify, link, verifyWebhook)
- [x] Request log per API key (endpoint, status, error, timing)
- [x] Interactive API reference in the portal + Postman collection

## Batch 4b: Look and feel ✅ (done 2026-10-22)
- [x] Theme switcher: light / dark / follow system, for the portal and landing page (remembered per user)

## Batch 4c: Portal polish ✅ (done 2026-10-23)
- [x] Modern animated loading screen (after login and while the workspace loads)
- [x] Password fields: show/hide eye icon, strength meter and rules (uppercase, number, special character), enforced by the API too
- [x] Redesign the Account settings page
- [x] Clickable breadcrumb
- [x] Docs: code samples in many languages (cURL, Node.js, Python, Go, PHP, Java)
- [x] API reference: more attractive and interactive
- [x] Replace native select dropdowns with a custom, themed picker
- [x] Top progress bar when navigating between pages

## Operations
- [x] Nightly encrypted database backups with a Telegram copy (docs/BACKUPS.md); needs a one-time setup on the server
- [x] Automatic deploys: every push to main is tested and deployed by GitHub Actions (docs/AUTO-DEPLOY.md); needs a one-time key setup

## Proposed: payment-gateway readiness (from the 2026-10-22 scenario, not yet agreed)
- [x] Per-bot send rate limits and a priority lane so OTP/transaction messages jump ahead of bulk sends
- [x] Message templates with Amharic/English variants
- [x] Optional "bring your own SMS provider" fallback (e.g. AfroMessage credentials), so Telenotify sends the SMS itself when Telegram can't
- [ ] Data-residency and compliance notes for regulated customers (hosting location, DPA)

## Batch 5: Payments (on hold)
Decided 2026-10-24: Telenotify is **free and open source** (AGPL-3.0) for now. Chapa needs a registered business (TIN, trade license), so payments wait until there is one. Options explored: Telebirr + SMS matching, voucher codes, a partner's Chapa account.
- [x] Make the hosted service free: 10,000 live messages and verifications per org per month, fair use; raised limits on request
- [x] Open source: AGPL-3.0 license, contributing guide, security policy, self-host instructions
- [ ] Online plan payment, once registered (Chapa)

## Batch 6: Why use the official service, and less stress for developers (agreed 2026-10-27)
Goal: things a copy of the open-source code can't bring with it, plus removing developer stress and cost.
- [x] Trademark policy (TRADEMARK.md) and the "Verified business" badge: request in Organization settings, operator review in /admin, shown on the verify page, the public /check page and optionally the bot profile
- [x] Verify-once network (Telenotify Pass): opt-in members confirm any business's verification with one tap in our Pass bot. The public "is this number on Telegram?" lookup was dropped on purpose: it would let anyone probe whose number is in the network
- [x] CLI: `npx telenotify listen --forward …` (webhooks to localhost, signed) and `trigger <event>`
- [ ] Guided live-bot setup wizard (BotFather steps, token check, sets the bot's name and description)
- [ ] Alerts to developers: failing webhooks, many blocked customers, near message or SMS limits
- [x] Python SDK (sdk/python: zero-dependency, Django/FastAPI/Flask-ready)
- [ ] Laravel/PHP SDK
- [ ] Reply buttons (customer taps come back as webhooks) and messages that update in place
- [ ] AI-ready docs: llms.txt, "copy prompt for your AI assistant", MCP server

