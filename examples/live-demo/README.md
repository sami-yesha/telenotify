# Telenotify live demo

A small public app that shows Telenotify end to end, built on the public API like any customer would build it:

1. **Verify with Telegram.** The visitor scans a QR code (or taps a button on their phone), shares their number with the demo bot, and the page turns green.
2. **Notifications.** A payment receipt, a delivery update or a login alert, in English, Amharic, Afaan Oromo or Tigrinya, delivered to their Telegram.
3. **SMS fallback.** A message to a customer who isn't on Telegram comes back `UNDELIVERABLE` right away; the page shows the SMS that would go out instead. It isn't sent, so the demo spends nobody's SMS balance.

A "Behind the scenes" panel shows every request the demo's server makes to Telenotify, every webhook it receives (with the signature checked), and replies the visitor sends to the bot.

## How it's built

| File | What it does |
|---|---|
| `src/lib/telenotify.ts` | The `@telenotify/node` client. Its `fetch` option records each call for the panel. |
| `src/app/api/verify/route.ts` | `verifications.create({ externalId })` and a QR code of the `t.me` link |
| `src/app/api/telenotify/webhook/route.ts` | `webhooks.constructEvent(rawBody, signature, secret)`; marks the visitor verified on `verification.completed` |
| `src/app/api/state/route.ts` | What the page polls; also checks an open verification every few seconds in case a webhook is slow |
| `src/app/api/notify/route.ts` | `messages.send({ to, layout })` |
| `src/app/api/sms/route.ts` | Sends to a customer who never linked Telegram and shows the fallback |
| `src/lib/samples.ts` | The sample messages in four languages |

Visitors are kept in memory for 24 hours and identified by an httpOnly cookie. Each visitor's Telenotify customer id is `demo_<session>`. Rate limits: 30 new visitors per IP per hour, 6 verifications per visitor per hour, 10 messages per visitor per 15 minutes, 400 messages a day in total.

## Run it locally

```bash
cp .env.example .env.local   # add a sandbox key (tn_test_…) and its signing secret
npm install
npm run dev                  # http://localhost:3020
```

Webhooks need a public URL. Locally, forward them with the CLI instead:

```bash
npx telenotify listen --key tn_test_… --forward http://localhost:3020/api/telenotify/webhook
```

Without webhooks the demo still works: it notices a finished verification by checking it.

## Deploy (Docker + Nginx)

1. In the Telenotify portal, in the organization the demo uses (live environment):
   - connect the demo's own bot (@BotFather), and make sure the organization is approved for live sending;
   - create an API key;
   - under Webhooks, set the URL to `https://<demo domain>/api/telenotify/webhook` and copy the signing secret.
2. On the server: `cp .env.example .env`, fill it in, then `docker compose up -d --build`. The app listens on `127.0.0.1:3110`.
3. Proxy the domain to it with HTTPS, for example with Nginx and Certbot:

```nginx
server {
    server_name telenotify-demo.duckdns.org;
    location / {
        proxy_pass http://127.0.0.1:3110;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then `certbot --nginx -d telenotify-demo.duckdns.org`.

MIT licensed, like the SDKs.
