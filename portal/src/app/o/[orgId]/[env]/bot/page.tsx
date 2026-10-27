'use client';

import { Bot, CheckCircle2, Fingerprint, Plug, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Alert, Button, Card, Input, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { LiveReviewCard } from '@/components/live-review';
import { envPath, useEnvironment, useOrg, useOrgParams } from '@/lib/hooks';
import type { EnvironmentInfo } from '@/lib/types';

export default function BotPage() {
  const { orgId, env } = useOrgParams();
  const { data: environment, mutate } = useEnvironment();
  const { mutate: refreshOrg } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!environment) return <Spinner />;

  if (env === 'sandbox') {
    return (
      <>
        <PageHeader title="Telegram bot" />
        <Card icon={Bot} title="Shared sandbox bot">
          {environment.botUsername ? (
            <p className="text-sm text-muted">
              In the sandbox, every organization uses{' '}
              <a className="font-medium text-brand" href={`https://t.me/${environment.botUsername}`} target="_blank" rel="noreferrer">
                @{environment.botUsername}
              </a>
              . Messages are labelled with your organization&apos;s name. When you go live, you connect your own bot so customers see your brand.
            </p>
          ) : (
            <Alert tone="amber">The sandbox bot is not configured on this server. The built-in test customers still work.</Alert>
          )}
        </Card>
      </>
    );
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      mutate(await api<EnvironmentInfo>(`${envPath(orgId, env)}/bot`, { method: 'PUT', body: { botToken: new FormData(event.currentTarget).get('token') } }), false);
      refreshOrg();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect your bot? Live messages will be rejected until you connect a bot again.')) return;
    mutate(await api<EnvironmentInfo>(`${envPath(orgId, env)}/bot`, { method: 'DELETE' }), false);
    refreshOrg();
  }

  return (
    <>
      <PageHeader title="Telegram bot" description="Your customers chat with your own bot, under your name and logo." />
      <div className="mb-6">
        <LiveReviewCard />
      </div>
      {environment.botConnected ? (
        <>
        <Card
          icon={CheckCircle2}
          title="Connected"
          actions={
            <Button variant="danger" onClick={disconnect}>
              Disconnect
            </Button>
          }
        >
          <p className="text-sm text-muted">
            Live messages are sent from{' '}
            <a className="font-medium text-brand" href={`https://t.me/${environment.botUsername}`} target="_blank" rel="noreferrer">
              @{environment.botUsername}
            </a>
            .
          </p>
        </Card>
        <BrandingChecklist username={environment.botUsername} />
        <PassInviteCard environment={environment} onSaved={(next) => mutate(next, false)} />
        </>
      ) : (
        <Card icon={Plug} title="Connect your bot">
          <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>
              Open{' '}
              <a className="font-medium text-brand" href="https://t.me/BotFather" target="_blank" rel="noreferrer">
                @BotFather
              </a>{' '}
              in Telegram and send <code className="font-mono text-ink">/newbot</code>.
            </li>
            <li>Choose a name (e.g. your business name) and a username ending in &quot;bot&quot;.</li>
            <li>Copy the token BotFather gives you and paste it below.</li>
          </ol>
          <div className="mb-5">
            <Alert tone="blue">
              Tip: customers trust a bot that looks like your business. After connecting, add your logo and a description. We&apos;ll show you how.
            </Alert>
          </div>
          <form onSubmit={connect} className="space-y-3">
            <Input name="token" label="Bot token" placeholder="123456789:AAH…" required autoComplete="off" hint="Stored encrypted. Don't use this bot with any other service; we take over its webhook." />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={loading}>
              Connect bot
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}

// The business decides whether its bot invites customers to Telenotify Pass.
function PassInviteCard({ environment, onSaved }: { environment: EnvironmentInfo; onSaved: (env: EnvironmentInfo) => void }) {
  const { orgId, env } = useOrgParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api<EnvironmentInfo>(`${envPath(orgId, env)}/pass-invite`, { method: 'PUT', body: { enabled: !environment.passInvite } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className="mt-6"
      icon={Fingerprint}
      title="Invite customers to Telenotify Pass"
      description="After a customer verifies their phone with your bot, it can offer Telenotify Pass, so next time they verify with one tap. Your customers benefit too: returning ones confirm faster."
      actions={
        <button
          type="button"
          role="switch"
          aria-checked={environment.passInvite}
          aria-label="Invite customers to Telenotify Pass"
          disabled={saving}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${environment.passInvite ? 'bg-brand' : 'bg-line'}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${environment.passInvite ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      }
    >
      <p className="text-sm text-muted">
        {environment.passInvite
          ? `On: after verifying, @${environment.botUsername} sends one short message with a "Use Telenotify Pass" button.`
          : `Off: @${environment.botUsername} only confirms the verification. Customers can still join Pass from the Telenotify verify page.`}
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

const brandingSteps = [
  { command: '/setname', title: 'Use your business name', body: 'The name customers see at the top of the chat, e.g. "Abebe Pharmacy".' },
  { command: '/setuserpic', title: 'Upload your logo', body: 'A square image (at least 512×512). This is the biggest trust signal.' },
  { command: '/setdescription', title: 'Say what the bot is for', body: 'Shown before a customer presses Start, e.g. "Order updates and receipts from Abebe Pharmacy."' },
  { command: '/setabouttext', title: 'Add a short bio', body: 'Shown on the bot\'s profile. Include your website or phone number so customers can verify it\'s you.' },
];

function BrandingChecklist({ username }: { username: string | null }) {
  return (
    <Card
      className="mt-6"
      icon={Sparkles}
      title="Make your bot look official"
      description={'Customers ignore messages from bots that look anonymous. In @BotFather, send each command, choose ' + (username ? '@' + username : 'your bot') + ', then follow the prompt.'}
    >
      <ol className="divide-y divide-line">
        {brandingSteps.map((step, i) => (
          <li key={step.command} className="flex gap-4 py-3 first:pt-0 last:pb-0">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {step.title} <code className="ml-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-xs text-ink">{step.command}</code>
              </p>
              <p className="mt-0.5 text-sm text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <a
        href="https://t.me/BotFather"
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink shadow-soft hover:bg-subtle"
      >
        Open @BotFather
      </a>
    </Card>
  );
}
