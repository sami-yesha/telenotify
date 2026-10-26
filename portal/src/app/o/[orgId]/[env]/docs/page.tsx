'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { CodeTabs } from '@/components/code-tabs';
import { Card, CodeBlock, PageHeader } from '@/components/ui';
import { API_BASE_URL } from '@/lib/api';
import { useOrgParams } from '@/lib/hooks';
import { SITE_URL } from '@/lib/site';
import { snippets, toJs } from '@/lib/snippets';

const testCustomers = [
  ['test_linked', 'Immediately QUEUED, then SENT.'],
  ['test_not_linked', 'Immediately UNDELIVERABLE, reason not_linked.'],
  ['test_blocked', 'Immediately UNDELIVERABLE, reason blocked.'],
  ['test_chat_gone', 'QUEUED, then UNDELIVERABLE with reason chat_gone (via webhook).'],
  ['test_telegram_down', 'QUEUED, then FAILED with reason telegram_unavailable (via webhook).'],
];

const statuses = [
  ['QUEUED', 'Accepted and being sent. The final result arrives as a webhook event.'],
  ['SENT', 'Telegram accepted the message.'],
  ['UNDELIVERABLE', 'This customer cannot be reached on Telegram. Use your own fallback (SMS, email…).'],
  ['FAILED', 'Telegram kept failing or rejected the message. Retry later or fall back.'],
];

const sendBody = {
  to: 'customer_123',
  text: 'Your order #1042 is out for delivery',
  buttons: [[{ text: 'Track order', url: 'https://shop.example.com/o/1042' }]],
  idempotencyKey: 'order-1042-shipped',
};

const templateBody = {
  to: 'customer_123',
  template: 'payment_received',
  params: { amount: '1,250', payer: 'Abebe', ref: 'TX-88' },
  priority: 'high',
};

// What to do with each result; the same logic in every language.
const fallbackSamples = {
  node: `const message = await telenotify.messages.send({ to: customer.id, text });

if (message.status === 'UNDELIVERABLE') {
  await sendSms(customer.phone, text); // your own provider
}
// QUEUED: the final result arrives as a webhook event
// (message.sent / message.undeliverable / message.failed).`,
  python: `message = requests.post(f"{BASE_URL}/v1/messages", headers=HEADERS,
                        json={"to": customer.id, "text": text}, timeout=10).json()

if message["status"] == "UNDELIVERABLE":
    send_sms(customer.phone, text)  # your own provider
# QUEUED: the final result arrives as a webhook event.`,
  go: `var message struct {
	Status string \`json:"status"\`
	Reason string \`json:"reason"\`
}
json.NewDecoder(res.Body).Decode(&message)

if message.Status == "UNDELIVERABLE" {
	sendSMS(customer.Phone, text) // your own provider
}
// QUEUED: the final result arrives as a webhook event.`,
  php: `$message = json_decode(curl_exec($ch), true);

if ($message['status'] === 'UNDELIVERABLE') {
    sendSms($customer['phone'], $text); // your own provider
}
// QUEUED: the final result arrives as a webhook event.`,
  java: `var message = mapper.readTree(response.body());

if ("UNDELIVERABLE".equals(message.get("status").asText())) {
    sendSms(customer.phone(), text); // your own provider
}
// QUEUED: the final result arrives as a webhook event.`,
};

export default function DocsPage() {
  const { orgId, env } = useOrgParams();
  const key = env === 'sandbox' ? 'tn_test_…' : 'tn_live_…';
  const ctx = { baseUrl: API_BASE_URL, apiKey: key };

  return (
    <>
      <PageHeader
        title="Integration guide"
        description={
          <>
            Base URL <code className="font-mono text-ink">{API_BASE_URL}</code>. Full reference:{' '}
            <Link className="font-medium text-brand hover:underline" href={`/o/${orgId}/${env}/api-reference`}>
              API reference
            </Link>{' '}
            · SDK: <code className="font-mono text-ink">@telenotify/node</code>
          </>
        }
      />
      <div className="space-y-6">
        <Section n={1} title="Connect a customer to your bot">
          <p>Create a one-time link for a customer in your system and show it in your app, a receipt or an SMS. When they tap it and press Start, they&apos;re connected.</p>
          <CodeTabs
            title="POST /v1/customers/link"
            samples={snippets(
              {
                method: 'POST',
                path: '/v1/customers/link',
                body: { externalId: 'customer_123', phone: '0911223344' },
                sdk: "const { url } = await telenotify.customers.createLink('customer_123', { phone: '0911223344' });",
                response: '{ "url": "https://t.me/your_bot?start=…", "expiresAt": "…" }',
              },
              ctx,
            )}
          />
          <p>
            <code className="font-mono text-ink">externalId</code> is your own id for the customer. The phone is optional; on a live bot, it lets customers connect by sharing their number instead.
          </p>
        </Section>

        <Section n={2} title="Send a message">
          <CodeTabs
            title="POST /v1/messages"
            samples={snippets(
              {
                method: 'POST',
                path: '/v1/messages',
                body: sendBody,
                sdk: `const message = await telenotify.messages.send(${toJs(sendBody)});`,
                response: '{ "id": "…", "status": "QUEUED", "to": "customer_123", … }',
              },
              ctx,
            )}
          />
          <p>Reusing an idempotency key returns the original message instead of sending twice.</p>
          <p>
            For one-time codes and payment or transaction alerts, add <code className="font-mono text-ink">&quot;priority&quot;: &quot;high&quot;</code>. High-priority messages are sent ahead of
            normal ones. Each bot sends up to 25 messages per second; bursts above that are queued, never dropped.
          </p>
        </Section>

        <Section n={3} title="Send in the customer's language with templates">
          <p>
            Create a template on the <Link href={`/o/${orgId}/${env}/templates`} className="font-medium text-brand hover:underline">Templates</Link> page with an English, Amharic, Afaan Oromo or
            Tigrinya version, then send it by key with values for its {'{{placeholders}}'}:
          </p>
          <CodeTabs
            title="POST /v1/messages"
            samples={snippets({ method: 'POST', path: '/v1/messages', body: templateBody, sdk: `await telenotify.messages.send(${toJs(templateBody)});` }, ctx)}
          />
          <p>
            The language is the <code className="font-mono text-ink">locale</code> you pass, else the customer&apos;s locale (set with <code className="font-mono text-ink">PUT /v1/customers/:externalId</code>), else the
            template&apos;s default. A missing value returns 400 with the names that are missing.
          </p>
        </Section>

        <Section n={4} title="Fall back when Telegram can't reach the customer">
          <p>Telenotify only sends on Telegram. When a customer can&apos;t be reached, we tell you, and your existing SMS or email provider takes over.</p>
          <Table rows={statuses} />
          <CodeTabs title="Handle the result" samples={fallbackSamples} />
          <p>
            You can also check first: <code className="font-mono text-ink">GET /v1/customers/:externalId</code> returns{' '}
            <code className="font-mono text-ink">reachable: true | false</code>.
          </p>
          <p>
            Already use AfroMessage? Turn on{' '}
            <Link href={`/o/${orgId}/${env}/sms-fallback`} className="font-medium text-brand hover:underline">
              SMS fallback
            </Link>{' '}
            and we send the SMS for you through your own account. The message then carries{' '}
            <code className="font-mono text-ink">fallback: {'{'} channel: &quot;sms&quot;, status {'}'}</code> and you get{' '}
            <code className="font-mono text-ink">message.fallback_sent</code> or <code className="font-mono text-ink">message.fallback_failed</code>.
          </p>
        </Section>

        <Section n={5} title="Listen for events">
          <p>Set a webhook URL to receive message.sent, message.undeliverable, message.failed, message.received, message.fallback_sent, message.fallback_failed, customer.linked and customer.blocked. Verify the signature using the snippet on the Webhooks page.</p>
          <CodeBlock
            language="json"
            code={`{
  "event": "message.undeliverable",
  "environment": "${env}",
  "createdAt": "2026-10-21T09:30:00.000Z",
  "data": { "id": "…", "to": "customer_123", "status": "UNDELIVERABLE", "reason": "blocked", "text": "…" }
}`}
          />
        </Section>

        <div id="verify">
          <Section n={6} title="Verify a phone number without SMS">
            <p>
              Replace SMS one-time codes. The person shares their number with your bot in one tap, and Telegram vouches it belongs to that account, so there&apos;s no code to type and no resend.
            </p>
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="font-semibold text-ink">Easiest: the Verify widget (one line, no backend to start it)</p>
              <p className="mt-1">
                Add our button to your page with your publishable key. Your page gets a <code className="font-mono text-ink">verified</code> event with the phone and a signed token; check the
                token on your server with <code className="font-mono text-ink">verifications.verifyToken(token, signingSecret)</code>. Keys, allowed websites and a live demo are on the{' '}
                <Link href={`/o/${orgId}/${env}/verify-widget`} className="font-medium text-brand hover:underline">
                  Verify widget
                </Link>{' '}
                page.
              </p>
              <div className="mt-3">
                <CodeBlock
                  language="html"
                  code={`<script src="${SITE_URL}/verify.js" defer></script>\n<telenotify-verify key="tn_pk_${env === 'sandbox' ? 'test' : 'live'}_…"></telenotify-verify>`}
                />
              </div>
            </div>
            <p className="font-semibold text-ink">Or with the API</p>
            <p>
              Create a verification and send the person to its <code className="font-mono text-ink">hostedUrl</code> (pass <code className="font-mono text-ink">returnUrl</code> to come back to your app), or straight to the t.me <code className="font-mono text-ink">url</code>.
            </p>
            <CodeTabs
              title="POST /v1/verifications"
              samples={snippets(
                {
                  method: 'POST',
                  path: '/v1/verifications',
                  body: { phone: '0911223344', externalId: 'customer_123' },
                  sdk: "const verification = await telenotify.verifications.create({ phone: '0911223344', externalId: 'customer_123' });\n// Send the person to verification.url",
                  response: '{ "id": "…", "status": "PENDING", "url": "https://t.me/your_bot?start=v_…" }',
                },
                ctx,
              )}
            />
            <Table
              rows={[
                ['PENDING', 'Link created, not opened yet.'],
                ['AWAITING_CONTACT', 'Opened in Telegram; waiting for the person to share their number.'],
                ['VERIFIED', 'Done. phone holds the verified number. With externalId, the customer is also linked for notifications.'],
                ['FAILED', 'reason phone_mismatch: the Telegram number differs from the phone you passed.'],
                ['EXPIRED', 'Not completed in time (default 10 minutes; set expiresInMinutes up to 60).'],
              ]}
              mono
            />
            <p>
              Poll <code className="font-mono text-ink">GET /v1/verifications/:id</code> or listen for <code className="font-mono text-ink">verification.completed</code> and{' '}
              <code className="font-mono text-ink">verification.failed</code>. People without Telegram can still use your SMS flow.
            </p>
          </Section>
        </div>

        <div id="test-customers">
          <Section n={7} title="Test customers (sandbox)">
            <p>Send to these ids with a sandbox key to see every outcome without Telegram. Use them to test your fallback code.</p>
            <Table rows={testCustomers} mono />
          </Section>
        </div>

        <Section n={8} title="Going live">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Connect your own @BotFather bot in Live → Telegram bot.</li>
            <li>Create a live key (tn_live_…) and set an HTTPS webhook URL.</li>
            <li>Swap the key in your server config. The API is the same.</li>
          </ol>
        </Section>
      </div>
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">{n}</span>
          {title}
        </span>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </Card>
  );
}

function Table({ rows, mono }: { rows: string[][]; mono?: boolean }) {
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {rows.map(([name, description]) => (
        <div key={name} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:gap-4">
          <dt className={`text-ink sm:w-44 sm:shrink-0 ${mono ? 'font-mono text-xs leading-5' : 'font-medium'}`}>{name}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  );
}
