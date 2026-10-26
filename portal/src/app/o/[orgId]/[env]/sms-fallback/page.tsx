'use client';

import { BadgeCheck, FlaskConical, MessageSquareText, Send, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, CodeBlock, Input, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import { envPath, useOrgParams } from '@/lib/hooks';
import type { AfroTokenCheck, SmsFallbackSettings } from '@/lib/types';

const steps = [
  'A message can’t be delivered on Telegram: the customer never connected, blocked the bot, or Telegram kept failing.',
  'If the customer has a phone number, we send the same text by SMS through your AfroMessage account. Buttons become “label: link” lines.',
  'You get message.fallback_sent or message.fallback_failed, and the message shows the SMS result.',
];

export default function SmsFallbackPage() {
  const { orgId, env } = useOrgParams();
  const path = `${envPath(orgId, env)}/sms-fallback`;
  const { data: settings, mutate } = useSWR<SmsFallbackSettings>(path, fetcher);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<AfroTokenCheck | null>(null);
  const [checking, setChecking] = useState(false);

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setSaved(false);
    setCheck(null);
    try {
      const { tokenCheck, ...next } = await api<SmsFallbackSettings>(path, { method: 'PUT', body });
      mutate(next, false);
      if (tokenCheck) setCheck(tokenCheck);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function checkToken() {
    setChecking(true);
    setError(null);
    setSaved(false);
    setCheck(null);
    try {
      setCheck(await api<AfroTokenCheck>(`${path}/check`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setChecking(false);
    }
  }

  function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = String(form.get('token') ?? '').trim();
    void save({
      ...(token ? { token } : {}),
      identifierId: String(form.get('identifierId') ?? ''),
      senderName: String(form.get('senderName') ?? ''),
    });
    if (token) event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader
        title="SMS fallback"
        description="When Telegram can't reach a customer, send the message by SMS through your own AfroMessage account. You pay AfroMessage directly; Telenotify adds no SMS fees."
      />

      {!settings ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card
              icon={MessageSquareText}
              title="Fallback to SMS"
              description={settings.simulated ? 'Sandbox: nothing is sent. Messages show a simulated SMS so you can build against the events.' : 'Uses the AfroMessage credentials below.'}
              actions={
                <Toggle
                  checked={settings.enabled}
                  disabled={saving || (!settings.configured && !settings.enabled)}
                  onChange={(enabled) => save({ enabled })}
                  label="SMS fallback"
                />
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={settings.enabled ? 'green' : 'gray'} dot>
                  {settings.enabled ? 'On' : 'Off'}
                </Badge>
                {settings.simulated && <Badge tone="amber">Simulated</Badge>}
                {!settings.simulated && !settings.configured && <span className="text-muted">Add your AfroMessage token to turn it on.</span>}
              </div>
              {error && (
                <div className="mt-4">
                  <Alert>{error}</Alert>
                </div>
              )}
              {saved && !error && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
            </Card>

            {!settings.simulated && (
              <Card icon={ShieldCheck} title="AfroMessage account" description="Find these in your AfroMessage dashboard. The token is encrypted and never shown again.">
                <form onSubmit={saveCredentials} className="space-y-4">
                  <Input
                    name="token"
                    type="password"
                    autoComplete="off"
                    label="API token"
                    placeholder={settings.tokenHint ? `Saved (${settings.tokenHint}). Paste a new one to replace it.` : 'eyJhbGciOi…'}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input name="identifierId" label="Identifier ID" defaultValue={settings.identifierId ?? ''} hint="Optional on beta accounts." />
                    <Input name="senderName" label="Sender name" defaultValue={settings.senderName ?? ''} maxLength={11} hint="Your approved sender ID." />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" loading={saving}>
                      Save
                    </Button>
                    {settings.tokenHint && (
                      <Button type="button" variant="secondary" loading={checking} onClick={checkToken}>
                        <BadgeCheck className="size-4" /> Check token
                      </Button>
                    )}
                    {settings.tokenHint && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => confirm('Remove your AfroMessage token? SMS fallback turns off.') && save({ token: null })}
                      >
                        Remove token
                      </Button>
                    )}
                  </div>
                </form>
                {check && (
                  <div className="mt-4">
                    {check.verified ? (
                      <Alert tone="green">
                        AfroMessage accepted this token.{check.balance !== null && <> Balance: <b>{check.balance}</b>.</>}
                      </Alert>
                    ) : (
                      <Alert tone="amber">Saved, but AfroMessage couldn&apos;t be reached to check the token. Use “Check token” or send a test SMS to confirm it.</Alert>
                    )}
                  </div>
                )}
              </Card>
            )}

            <TestSms path={path} simulated={settings.simulated} configured={settings.configured} />
          </div>

          <div className="space-y-6">
            <Card title="How it works">
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </Card>
            <Card title="In the API" description={<>Every message reports the SMS result. Skip it for one message with <code className="font-mono">&quot;fallback&quot;: false</code>.</>}>
              <CodeBlock
                language="json"
                code={`{\n  "status": "UNDELIVERABLE",\n  "reason": "not_linked",\n  "fallback": {\n    "channel": "sms",\n    "status": "queued"   // then "sent" or "failed"\n  }\n}`}
              />
              <p className="mt-3 text-xs text-muted">
                &quot;skipped&quot; means the customer has no phone number. Save one with PUT /v1/customers/:externalId.
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function TestSms({ path, simulated, configured }: { path: string; simulated: boolean; configured: boolean }) {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const r = await api<{ simulated: boolean; to: string }>(`${path}/test`, { method: 'POST', body: { phone } });
      setResult(r.simulated ? { tone: 'amber', text: `Simulated: in live this goes to +${r.to}.` } : { tone: 'green', text: `Sent to +${r.to}. Check the phone.` });
    } catch (e) {
      setResult({ tone: 'red', text: e instanceof ApiError ? e.message : 'Something went wrong' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card icon={simulated ? FlaskConical : Send} title="Send a test SMS" description={simulated ? 'Checks the number; nothing is sent in the sandbox.' : 'Sends one real SMS on your AfroMessage balance.'}>
      <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0911 22 33 44" inputMode="tel" required />
        </div>
        <Button type="submit" variant="secondary" loading={sending} disabled={!configured}>
          Send test
        </Button>
      </form>
      {result && (
        <div className="mt-3">
          <Alert tone={result.tone}>{result.text}</Alert>
        </div>
      )}
    </Card>
  );
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-line',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}
