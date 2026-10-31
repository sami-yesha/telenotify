'use client';

import { BadgeCheck, Code2, FlaskConical, Gauge, KeyRound, ListChecks, Lock, MessageSquareText, Send, Server, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { Alert, Badge, Button, Card, CodeBlock, Input, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import { envPath, useOrgParams } from '@/lib/hooks';
import { GITHUB_URL } from '@/lib/site';
import type { AfroTokenCheck, SmsFallbackHistory, SmsFallbackSettings } from '@/lib/types';

type Mode = 'telenotify' | 'self';

const SOURCE_URL = `${GITHUB_URL}/blob/main/src/sms-fallback/sms-fallback.service.ts`;

const SELF_CODE = `import { webhooks } from '@telenotify/node';

// Telenotify tells you when Telegram can't reach someone.
// You send the SMS with your own AfroMessage account: no token is shared with us.
app.post('/telenotify', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = webhooks.constructEvent(
    req.body,
    req.headers['x-telenotify-signature'],
    process.env.TELENOTIFY_SIGNING_SECRET,
  );
  if (event.event === 'message.undeliverable' || event.event === 'message.failed') {
    const user = await db.users.find(event.data.to);   // "to" is your externalId
    await fetch('https://api.afromessage.com/api/send', {
      method: 'POST',
      headers: {
        authorization: \`Bearer \${process.env.AFROMESSAGE_TOKEN}\`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: user.phone, message: event.data.plainText }),
    });
  }
  res.sendStatus(200);
});`;

export default function SmsFallbackPage() {
  const { orgId, env } = useOrgParams();
  const path = `${envPath(orgId, env)}/sms-fallback`;
  const { data: settings, mutate } = useSWR<SmsFallbackSettings>(path, fetcher);
  const [mode, setMode] = useState<Mode>('telenotify');
  const sandbox = env === 'sandbox';
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<AfroTokenCheck | null>(null);
  const [checking, setChecking] = useState(false);

  function choose(next: Mode) {
    setMode(next);
    setError(null);
    setSaved(false);
    setCheck(null);
  }

  async function save(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    setSaved(false);
    setCheck(null);
    try {
      const { tokenCheck, ...next } = await api<SmsFallbackSettings>(path, { method: 'PUT', body });
      mutate(next, false);
      if (tokenCheck) setCheck(tokenCheck);
      setSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return false;
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

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const token = String(form.get('token') ?? '').trim();
    const ok = await save({
      ...(token ? { token } : {}),
      identifierId: String(form.get('identifierId') ?? ''),
      senderName: String(form.get('senderName') ?? ''),
    });
    // Keep a rejected token in the field so it can be corrected, not pasted again.
    if (ok && token) (formElement.elements.namedItem('token') as HTMLInputElement).value = '';
  }

  return (
    <>
      <PageHeader
        title="SMS fallback"
        description="When Telegram can't reach a customer, reach them by SMS through your own AfroMessage account. You pay AfroMessage directly; Telenotify adds no SMS fees."
      />

      {!settings ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <ModeCard
              active={mode === 'telenotify'}
              onClick={() => choose('telenotify')}
              icon={KeyRound}
              title="We send it for you"
              body="Save your AfroMessage token here. We send the SMS automatically, within a daily limit you set."
            />
            <ModeCard
              active={mode === 'self'}
              onClick={() => choose('self')}
              icon={Server}
              title="You send it yourself"
              body="Keep your token. We send your server a webhook and you send the SMS from your own system."
              tag="No token shared"
            />
          </div>

          {(error || (saved && !check)) && (
            <div className="mb-6">{error ? <Alert>{error}</Alert> : <Alert tone="green">Saved.</Alert>}</div>
          )}

          {mode === 'self' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Card icon={Code2} title="Send the SMS from your server" description="Listen for these events. Your AfroMessage token never leaves your system.">
                <CodeBlock language="javascript" code={SELF_CODE} />
              </Card>
              <div className="space-y-6">
                {settings.enabled && (
                  <Alert tone="amber">
                    <span className="block">Automatic SMS is still on, so customers would get two messages.</span>
                    <Button className="mt-3" variant="secondary" loading={saving} onClick={() => save({ enabled: false })}>
                      Turn off automatic SMS
                    </Button>
                  </Alert>
                )}
                <Card title="How it works">
                  <Steps
                    steps={[
                      'Telegram can’t deliver a message: the customer never connected or blocked the bot.',
                      'We send message.undeliverable (or message.failed) to your webhook, with the message text.',
                      'Your server looks up the phone number and sends the SMS with your own AfroMessage token.',
                    ]}
                  />
                </Card>
                <Card title="Webhook URL" description="Set it on the Webhooks page. Every event is signed with your signing secret.">
                  <Link href={`/o/${orgId}/${env}/webhooks`} className="text-sm font-medium text-brand hover:underline">
                    Open Webhooks →
                  </Link>
                </Card>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="space-y-6">
                  <Card
                    icon={MessageSquareText}
                    title="Automatic SMS"
                    description={
                      settings.simulated
                        ? 'Sandbox: nothing is sent. Messages show a simulated SMS so you can build against the events. Add a token below to send real ones.'
                        : sandbox
                          ? 'Sandbox with your token: real SMS are sent on your AfroMessage balance. Remove the token to go back to simulated.'
                          : 'Uses the AfroMessage credentials below.'
                    }
                    actions={
                      <Toggle
                        checked={settings.enabled}
                        disabled={saving || (!settings.configured && !settings.enabled)}
                        onChange={(enabled) => save({ enabled })}
                        label="Automatic SMS"
                      />
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={settings.enabled ? 'green' : 'gray'} dot>
                        {settings.enabled ? 'On' : 'Off'}
                      </Badge>
                      {settings.simulated && <Badge tone="amber">Simulated</Badge>}
                      {sandbox && !settings.simulated && <Badge tone="blue">Real SMS</Badge>}
                      {!settings.simulated && !settings.configured && <span className="text-muted">Add your AfroMessage token to turn it on.</span>}
                    </div>
                  </Card>

                  <Card
                    icon={ShieldCheck}
                    title="AfroMessage account"
                    description={
                      sandbox
                        ? 'Optional in the sandbox. Without a token, SMS are simulated. Add one to send real SMS (on your AfroMessage balance) and test the whole flow on your own phone.'
                        : 'Find these in your AfroMessage dashboard. The token is encrypted and never shown again.'
                    }
                  >
                      <form onSubmit={saveCredentials} className="space-y-4">
                        <Input
                          name="token"
                          type="password"
                          autoComplete="off"
                          label="API token"
                          placeholder={settings.tokenHint ? `Saved (${settings.tokenHint}). Paste a new one to replace it.` : 'eyJhbGciOi…'}
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Input name="identifierId" label="Identifier ID" defaultValue={settings.identifierId ?? ''} hint="System identifier (UUID or shortcode). Leave blank to use default." placeholder="e.g. e80ad9d8-..." />
                          <Input name="senderName" label="Sender name" defaultValue={settings.senderName ?? ''} maxLength={11} hint="Your approved sender ID. Leave blank for default." placeholder="e.g. Pitron Tech" />
                        </div>
                        <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-xs text-muted">
                          <span className="font-semibold text-ink">Beta accounts:</span> If your AfroMessage account is in beta, recipient numbers must be verified under <strong>Contacts</strong> in your AfroMessage dashboard before SMS can be sent.
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
                              onClick={() =>
                              confirm(sandbox ? 'Remove your AfroMessage token? It is deleted at once and the sandbox goes back to simulated SMS.' : 'Remove your AfroMessage token? It is deleted at once and automatic SMS turns off.') &&
                              save({ token: null })
                            }
                            >
                              <Trash2 className="size-4" /> Remove token
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

                  <DailyLimit settings={settings} saving={saving} onSave={(dailyLimit) => save({ dailyLimit })} />
                  <TestSms path={path} simulated={settings.simulated} configured={settings.configured} />
                </div>

                <div className="space-y-6">
                  <Trust />
                  <Card title="How it works">
                    <Steps
                      steps={[
                        'A message can’t be delivered on Telegram: the customer never connected, blocked the bot, or Telegram kept failing.',
                        'If the customer has a phone number and you’re under your daily limit, we send the same text by SMS through your AfroMessage account. Buttons become “label: link” lines.',
                        'You get message.fallback_sent or message.fallback_failed, and the SMS shows up in the list below.',
                      ]}
                    />
                  </Card>
                  <Card title="In the API" description={<>Every message reports the SMS result. Skip it for one message with <code className="font-mono">&quot;fallback&quot;: false</code>.</>}>
                    <CodeBlock
                      language="json"
                      code={`{\n  "status": "UNDELIVERABLE",\n  "reason": "not_linked",\n  "fallback": {\n    "channel": "sms",\n    "status": "queued"   // then "sent" or "failed"\n  }\n}`}
                    />
                    <p className="mt-3 text-xs text-muted">&quot;skipped&quot; means the customer has no phone number or your daily limit was reached.</p>
                  </Card>
                </div>
              </div>

              <History path={path} simulated={settings.simulated} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function ModeCard({ active, onClick, icon: Icon, title, body, tag }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; body: string; tag?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('flex gap-3 rounded-xl border p-4 text-left transition-colors', active ? 'border-brand bg-brand/5 ring-4 ring-brand/10' : 'border-line bg-surface hover:border-brand/40')}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', active ? 'bg-brand text-white' : 'bg-subtle text-muted')}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {title} {tag && <Badge tone="green">{tag}</Badge>}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{body}</span>
      </span>
    </button>
  );
}

// What we do and don't do with the token, in plain words.
function Trust() {
  const points = [
    'Encrypted (AES-256) the moment you save it, and never shown again, not even to you.',
    'Used only to send SMS for messages you sent that Telegram couldn’t deliver. Never for anything of ours.',
    'Every SMS is listed below with AfroMessage’s message id, so you can match it against your AfroMessage sent log.',
    'Your daily limit caps what it can ever cost you. Remove the token any time: it’s deleted at once.',
  ];
  return (
    <Card icon={Lock} title="Your token, your control">
      <ul className="space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Telenotify is open source:{' '}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
          read the exact code that uses your token
        </a>
        . Tip: create a separate AfroMessage token just for Telenotify.
      </p>
    </Card>
  );
}

function DailyLimit({ settings, saving, onSave }: { settings: SmsFallbackSettings; saving: boolean; onSave: (limit: number | null) => void }) {
  const [draft, setDraft] = useState(settings.dailyLimit?.toString() ?? '');
  const limit = settings.dailyLimit;
  const used = settings.sentLast24h;
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <Card icon={Gauge} title="Daily SMS limit" description="The most SMS we'll ever send for you in 24 hours. Past it, messages are marked “skipped” and nothing is sent.">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">Last 24 hours</span>
        <span className="font-medium text-ink">
          {used.toLocaleString()} {limit ? `of ${limit.toLocaleString()}` : 'sent · no limit'}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
          <div className={cn('h-full rounded-full transition-all', share >= 90 ? 'bg-amber-500' : 'bg-brand')} style={{ width: `${share}%` }} />
        </div>
      )}
      {limit === null && !settings.simulated && <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">No limit set. We recommend one, so a mistake can never drain your balance.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number.parseInt(draft, 10);
          if (value > 0) onSave(value);
        }}
        className="mt-4 flex gap-2"
      >
        <div className="flex-1">
          <Input value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 200" aria-label="SMS per day" />
        </div>
        <Button type="submit" variant="secondary" loading={saving} disabled={!draft || Number(draft) === limit}>
          Set limit
        </Button>
        {limit !== null && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft('');
              onSave(null);
            }}
          >
            Remove
          </Button>
        )}
      </form>
    </Card>
  );
}

const statusTone = { sent: 'green', queued: 'blue', failed: 'red', skipped: 'gray' } as const;

function History({ path, simulated }: { path: string; simulated: boolean }) {
  const { data, size, setSize, isLoading } = useSWRInfinite<SmsFallbackHistory>(
    (index, previous) => (index === 0 ? `${path}/history` : previous?.next ? `${path}/history?before=${encodeURIComponent(previous.next)}` : null),
    fetcher,
  );
  const items = data?.flatMap((page) => page.items) ?? [];
  const more = Boolean(data?.[data.length - 1]?.next);

  return (
    <Card
      icon={ListChecks}
      title="SMS sent with your token"
      description={simulated ? 'Sandbox: these were simulated, nothing was sent.' : 'Every SMS we sent or tried to send for you. Match the AfroMessage id against your AfroMessage sent log.'}
    >
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No SMS yet. They appear here when Telegram can&apos;t reach a customer.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium sm:px-6">When</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium sm:px-6">AfroMessage id / reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.messageId} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted sm:px-6">{item.at ? new Date(item.at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink">{item.to}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink">{item.phone ? `+${item.phone}` : '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={statusTone[item.status]} dot>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="max-w-xs truncate px-5 py-2.5 font-mono text-xs text-muted sm:px-6" title={item.error ?? item.providerMessageId ?? ''}>
                    {item.providerMessageId ?? item.error ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => setSize(size + 1)}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-muted">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{i + 1}</span>
          {step}
        </li>
      ))}
    </ol>
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
        <div className="mt-3 space-y-2">
          <Alert tone={result.tone}>
            {result.text}
            {result.tone === 'red' && (result.text.toLowerCase().includes('unverified contact') || result.text.toLowerCase().includes('beta')) ? (
              <span className="mt-2 block text-xs">
                👉 Open your{' '}
                <a
                  href="https://afromessage.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline hover:text-brand"
                >
                  AfroMessage Dashboard
                </a>
                , go to <strong>Contacts</strong>, and click <strong>Verify</strong> for this number.
              </span>
            ) : null}
          </Alert>
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
