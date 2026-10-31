'use client';

import { KeyRound, List, Terminal, Webhook as WebhookIcon } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { DeliveryLog } from '@/components/delivery-log';
import { Alert, Button, Card, CodeBlock, Input, PageHeader, Secret, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { envPath, useEnvironment, useOrgParams } from '@/lib/hooks';
import type { EnvironmentInfo } from '@/lib/types';

const events = [
  ['message.sent', 'Telegram accepted the message.'],
  ['message.undeliverable', 'The customer cannot be reached on Telegram (reason: not_linked, blocked, chat_gone). Use your fallback.'],
  ['message.failed', 'Telegram kept failing or rejected the message (reason: telegram_unavailable, telegram_rejected).'],
  ['message.fallback_sent', 'SMS fallback sent the message through your AfroMessage account.'],
  ['message.fallback_failed', 'SMS fallback could not send the SMS; see fallback.error.'],
  ['message.received', 'The customer replied to your bot.'],
  ['customer.linked', 'A customer connected their Telegram.'],
  ['customer.blocked', 'A customer blocked your bot.'],
  ['verification.completed', 'A phone number was verified with Telegram. Includes the verified number.'],
  ['verification.failed', 'Verification failed (reason: phone_mismatch).'],
];

const verifySnippet = `import crypto from 'node:crypto';

// Express example: use the raw request body, not the parsed JSON.
function verifyTelenotify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`;

export default function WebhooksPage() {
  const { orgId, env } = useOrgParams();
  const base = envPath(orgId, env);
  const { data: environment, mutate } = useEnvironment();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ delivered: boolean; statusCode?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  if (!environment) return <Spinner />;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('url') ?? '').trim();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      mutate(await api<EnvironmentInfo>(base, { method: 'PATCH', body: { eventWebhookUrl: value || null } }), false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api(`${base}/webhook/test`, { method: 'POST' }));
    } catch (e) {
      setTestResult({ delivered: false, error: e instanceof ApiError ? e.message : 'Something went wrong' });
    } finally {
      setTesting(false);
    }
  }

  async function rotate() {
    if (!confirm('Rotate the signing secret? Your server must use the new secret to verify events right away.')) return;
    mutate(await api<EnvironmentInfo>(`${base}/signing-secret/rotate`, { method: 'POST' }), false);
  }

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="We POST events to your server so you know what happened to each message without polling. Respond with any 2xx status; failed deliveries are retried for about 40 minutes. Use the x-telenotify-event-id header to ignore duplicates."
      />
      <div className="space-y-6">
        <Card icon={WebhookIcon} title="Endpoint" description="Where we send events for this environment.">
          <form onSubmit={save} className="space-y-3">
            <Input
              key={environment.eventWebhookUrl ?? ''}
              name="url"
              type="url"
              label="Webhook URL"
              defaultValue={environment.eventWebhookUrl ?? ''}
              placeholder="https://your-app.com/webhooks/telenotify"
              hint={env === 'live' ? 'Must be HTTPS. Leave empty to turn webhooks off.' : 'HTTP or HTTPS. Leave empty to turn webhooks off.'}
            />
            {error && <Alert>{error}</Alert>}
            {saved && <Alert tone="green">Saved.</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={test} loading={testing} disabled={!environment.eventWebhookUrl}>
                Send test event
              </Button>
            </div>
            {testResult && (
              <Alert tone={testResult.delivered ? 'green' : 'red'}>
                {testResult.delivered
                  ? `Delivered (HTTP ${testResult.statusCode}).`
                  : `Not delivered: ${testResult.statusCode ? `HTTP ${testResult.statusCode}` : testResult.error}`}
              </Alert>
            )}
          </form>
        </Card>

        <Card
          icon={KeyRound}
          title="Signing secret"
          description="Every event has an x-telenotify-signature header. Verify it so you only trust events from us."
          actions={
            <Button variant="secondary" onClick={rotate}>
              Rotate
            </Button>
          }
        >
          <Secret value={environment.eventSigningSecret} />
          <div className="mt-4">
            <CodeBlock language="javascript" code={verifySnippet} />
          </div>
        </Card>

        <Card
          icon={Terminal}
          title="Test on localhost (CLI)"
          description="Forward events to your local development server with real HMAC signatures, without ngrok or public URLs."
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              Use the official <code className="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded text-ink">telenotify</code> CLI to listen for events in this environment:
            </p>
            <CodeBlock
              language="bash"
              code={`# 1. Save your API key (if you haven't already)
npx telenotify login

# 2. Forward events to your local server
npx telenotify listen --forward http://localhost:3000/webhooks/telenotify

# 3. In another terminal, trigger a sample event
npx telenotify trigger message.sent`}
            />
          </div>
        </Card>

        <DeliveryLog basePath={base} messageHref={(id) => `/o/${orgId}/${env}/messages/${id}`} />

        <Card icon={List} title="Events">
          <dl className="divide-y divide-line">
            {events.map(([name, description]) => (
              <div key={name} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                <dt className="font-mono text-sm text-ink sm:w-48 sm:shrink-0">{name}</dt>
                <dd className="text-sm text-muted">{description}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
