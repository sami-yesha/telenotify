'use client';

import { Bot, CheckCircle2, ChevronDown, Fingerprint, ImageUp, Plug, Send, ShieldCheck, Smartphone, Sparkles, Wand2 } from 'lucide-react';
import QRCode from 'qrcode';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, CopyButton, Input, PageHeader, Skeleton, Spinner } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { LiveReviewCard } from '@/components/live-review';
import { envPath, useEnvironment, useOrg, useOrgParams } from '@/lib/hooks';
import type { BotProfile, EnvironmentInfo } from '@/lib/types';

export default function BotPage() {
  const { orgId, env } = useOrgParams();
  const { data: environment, mutate } = useEnvironment();
  const { mutate: refreshOrg } = useOrg();
  // Set when the bot gets connected while this page is open, to say so.
  const [justConnected, setJustConnected] = useState(false);

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

  async function disconnect() {
    if (!confirm('Disconnect your bot? Live messages will be rejected until you connect a bot again.')) return;
    mutate(await api<EnvironmentInfo>(`${envPath(orgId, env)}/bot`, { method: 'DELETE' }), false);
    setJustConnected(false);
    refreshOrg();
  }

  function connected(next: EnvironmentInfo) {
    mutate(next, false);
    setJustConnected(true);
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
          {justConnected && (
            <div className="mb-6">
              <Alert tone="green">🎉 Your bot is ready. Add your logo below so customers recognize you.</Alert>
            </div>
          )}
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
              .{environment.botSetup?.managed && " You own this bot in Telegram; Telenotify created it and keeps it connected."}
            </p>
          </Card>
          <BotProfileCard username={environment.botUsername} />
          <PrivacyPolicyCard username={environment.botUsername} />
          <PassInviteCard environment={environment} onSaved={(next) => mutate(next, false)} />
        </>
      ) : environment.botSetup?.available ? (
        <>
          <GuidedSetup environment={environment} onChange={(next) => mutate(next, false)} onConnected={connected} refresh={() => mutate()} />
          <TokenFallback onConnected={connected} collapsible />
        </>
      ) : (
        <TokenFallback onConnected={connected} />
      )}
    </>
  );
}

// ---------- Guided setup: our setup bot creates the bot in Telegram ----------

const STEPS = [
  { icon: Smartphone, title: 'Open Telegram', body: 'Scan the code with your phone, or open the link.' },
  { icon: Wand2, title: 'Tap "Create my bot"', body: 'Your business name is filled in. Change it if you like, then confirm.' },
  { icon: CheckCircle2, title: "That's it", body: 'We connect the bot and set it up. This page updates by itself.' },
];

function GuidedSetup({
  environment,
  onChange,
  onConnected,
  refresh,
}: {
  environment: EnvironmentInfo;
  onChange: (env: EnvironmentInfo) => void;
  onConnected: (env: EnvironmentInfo) => void;
  refresh: () => Promise<EnvironmentInfo | undefined>;
}) {
  const { orgId, env } = useOrgParams();
  const setup = environment.botSetup!;
  // The link exists only in this page's memory: the server keeps just its hash.
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in refs so the polling timer isn't restarted on every render.
  const callbacks = useRef({ refresh, onConnected });
  callbacks.current = { refresh, onConnected };

  // While the person is in Telegram, check every 2 seconds whether the bot is connected.
  useEffect(() => {
    if (!link) return;
    const timer = setInterval(async () => {
      const next = await callbacks.current.refresh();
      if (next?.botConnected) callbacks.current.onConnected(next);
    }, 2000);
    return () => clearInterval(timer);
  }, [link]);

  useEffect(() => {
    if (!link) return setQr(null);
    QRCode.toDataURL(link.url, { width: 480, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }).then(setQr);
  }, [link]);

  // The server drops the setup when it expires or fails; forget our link too.
  useEffect(() => {
    if (link && !setup.pending) setLink(null);
  }, [link, setup.pending]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const created = await api<{ url: string; expiresAt: string }>(`${envPath(orgId, env)}/bot/setup`, { method: 'POST' });
      await refresh();
      setLink(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    setLink(null);
    onChange(await api<EnvironmentInfo>(`${envPath(orgId, env)}/bot/setup`, { method: 'DELETE' }));
  }

  return (
    <Card
      icon={Sparkles}
      title="Create your bot"
      description="We create your bot in Telegram for you. No @BotFather, no tokens to copy. It takes about 30 seconds."
      actions={<Badge tone="blue">Recommended</Badge>}
    >
      {link ? (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-xl border border-line bg-white p-2 shadow-soft">
            {qr ? <img src={qr} alt="QR code that opens the Telenotify setup bot in Telegram" className="size-44" /> : <div className="size-44 animate-pulse rounded-lg bg-slate-100" />}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-sm font-medium text-ink">Scan with your phone&apos;s camera, or open it on this device</p>
              <p className="mt-1 text-sm text-muted">Use the Telegram account that should own the bot. The link works once and expires in 15 minutes.</p>
            </div>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-medium text-white shadow-soft hover:bg-[#229ED9]"
            >
              <Send className="size-4" /> Open in Telegram
            </a>
            <WaitingStatus opened={setup.opened} />
            <button type="button" onClick={cancel} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <ol className="mb-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-line bg-subtle/50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                  <step.icon className="size-4 text-brand" />
                </div>
                <p className="text-sm font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          {setup.error && (
            <div className="mb-4">
              <Alert>The last attempt didn&apos;t finish: {setup.error}. Please try again.</Alert>
            </div>
          )}
          {setup.pending && (
            <div className="mb-4">
              <Alert tone="blue">A setup was started earlier. Start again to get a fresh link.</Alert>
            </div>
          )}
          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}
          <Button onClick={start} loading={starting}>
            <Wand2 className="size-4" /> Create my bot in Telegram
          </Button>
          <p className="mt-3 text-xs text-muted">The bot belongs to your Telegram account. You can disconnect it from Telenotify at any time.</p>
        </>
      )}
    </Card>
  );
}

function WaitingStatus({ opened }: { opened: boolean }) {
  const spinner = <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
  return (
    <ul className="space-y-2 text-sm" aria-live="polite">
      <li className="flex items-center gap-2">
        {opened ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : spinner}
        <span className={opened ? 'text-ink' : 'text-muted'}>{opened ? 'Opened in Telegram' : 'Waiting for you to open Telegram…'}</span>
      </li>
      <li className="flex items-center gap-2">
        {opened ? spinner : <span className="size-4 shrink-0 rounded-full border-2 border-line" />}
        <span className="text-muted">{opened ? 'Now tap "Create my bot" and confirm…' : 'Create the bot'}</span>
      </li>
    </ul>
  );
}

// ---------- Pasting a token (bots made in @BotFather) ----------

function TokenFallback({ onConnected, collapsible }: { onConnected: (env: EnvironmentInfo) => void; collapsible?: boolean }) {
  const { orgId, env } = useOrgParams();
  const [open, setOpen] = useState(!collapsible);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onConnected(await api<EnvironmentInfo>(`${envPath(orgId, env)}/bot`, { method: 'PUT', body: { botToken: new FormData(event.currentTarget).get('token') } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <>
      <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Open{' '}
          <a className="font-medium text-brand" href="https://t.me/BotFather" target="_blank" rel="noreferrer">
            @BotFather
          </a>{' '}
          in Telegram and send <code className="font-mono text-ink">/newbot</code> (or <code className="font-mono text-ink">/mybots</code> for a bot you already have).
        </li>
        <li>Choose a name (e.g. your business name) and a username ending in &quot;bot&quot;.</li>
        <li>Copy the token BotFather gives you and paste it below.</li>
      </ol>
      <form onSubmit={connect} className="space-y-3">
        <Input name="token" label="Bot token" placeholder="123456789:AAH…" required autoComplete="off" hint="Stored encrypted. Don't use this bot with any other service; we take over its webhook." />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} variant={collapsible ? 'secondary' : 'primary'}>
          Connect bot
        </Button>
      </form>
    </>
  );

  if (!collapsible) {
    return (
      <Card icon={Plug} title="Connect your bot">
        {form}
      </Card>
    );
  }
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
            <Plug className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-ink">I already have a bot</span>
            <span className="block text-sm text-muted">Connect a bot you made in @BotFather with its token.</span>
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line/70 px-5 py-5 sm:px-6">{form}</div>}
    </section>
  );
}

// ---------- Bot profile: name, descriptions and photo, without @BotFather ----------

function BotProfileCard({ username }: { username: string | null }) {
  const { orgId, env } = useOrgParams();
  const path = `${envPath(orgId, env)}/bot/profile`;
  const { data: profile, error: loadError, mutate } = useSWR<BotProfile>(path, fetcher);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const next = await api<BotProfile>(path, {
        method: 'PUT',
        body: { name: data.get('name'), shortDescription: data.get('shortDescription'), description: data.get('description') },
      });
      mutate(next, false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className="mt-6"
      icon={Sparkles}
      title="Make your bot look official"
      description={`Customers trust a bot that looks like your business. Changes show up in Telegram for ${username ? '@' + username : 'your bot'} right away.`}
    >
      <PhotoUpload />
      <div className="my-5 border-t border-line/70" />
      {loadError ? (
        <Alert>Couldn&apos;t load the bot profile from Telegram. {loadError instanceof ApiError ? loadError.message : ''}</Alert>
      ) : !profile ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4" onChange={() => setSaved(false)}>
          <Input name="name" label="Name" defaultValue={profile.name} maxLength={64} required hint='Shown at the top of the chat, e.g. "Abebe Pharmacy".' />
          <Input
            name="shortDescription"
            label="About"
            defaultValue={profile.shortDescription}
            maxLength={120}
            hint="On the bot's profile. Add your website or phone number so customers can check it's really you."
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Description</span>
            <textarea
              name="description"
              defaultValue={profile.description}
              maxLength={512}
              rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-muted/60 hover:border-muted/40 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
            <span className="mt-1.5 block text-xs text-muted">Shown before a customer presses Start: what they&apos;ll get from this bot.</span>
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>
              Save profile
            </Button>
            {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved in Telegram ✓</span>}
          </div>
        </form>
      )}
    </Card>
  );
}

// Telegram only takes a JPEG profile photo: crop the image to a square and convert it here.
function toSquareJpeg(file: File, size = 640): Promise<{ base64: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!;
      // Transparent logos get a white background instead of black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const preview = canvas.toDataURL('image/jpeg', 0.88);
      resolve({ base64: preview.slice(preview.indexOf(',') + 1), preview });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image we can read"));
    };
    image.src = url;
  });
}

function PhotoUpload() {
  const { orgId, env } = useOrgParams();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setDone(false);
    setUploading(true);
    try {
      const { base64, preview } = await toSquareJpeg(file);
      setPreview(preview);
      await api(`${envPath(orgId, env)}/bot/photo`, { method: 'PUT', body: { jpegBase64: base64 } });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-subtle">
        {preview ? <img src={preview} alt="New bot photo" className="size-full object-cover" /> : <Bot className="size-6 text-muted" />}
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium text-ink">Logo</p>
        <p className="text-sm text-muted">The biggest trust signal. Square images work best; we crop others to the middle.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={choose} />
          <Button type="button" variant="secondary" loading={uploading} onClick={() => input.current?.click()}>
            <ImageUp className="size-4" /> {preview ? 'Change logo' : 'Upload logo'}
          </Button>
          {done && <span className="text-sm text-emerald-600 dark:text-emerald-400">Updated in Telegram ✓</span>}
        </div>
        {error && <Alert>{error}</Alert>}
      </div>
    </div>
  );
}

// Telegram's bot terms require every bot to have a privacy policy, set in @BotFather.
// The Bot API can't set it, so this is the one BotFather step left.
function PrivacyPolicyCard({ username }: { username: string | null }) {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(`${window.location.origin}/privacy#customers`), []);

  return (
    <Card
      className="mt-6"
      icon={ShieldCheck}
      title="Add the privacy policy (required by Telegram)"
      description="Telegram requires every bot to have a privacy policy. Ours covers your customers' data; set it once for your bot."
    >
      <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Open{' '}
          <a className="font-medium text-brand" href="https://t.me/BotFather" target="_blank" rel="noreferrer">
            @BotFather
          </a>{' '}
          and send <code className="font-mono text-ink">/mybots</code>, then choose {username ? <b className="text-ink">@{username}</b> : 'your bot'}.
        </li>
        <li>Open its settings, choose Privacy Policy, and send the link below.</li>
      </ol>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-subtle px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{url}</code>
        {url && <CopyButton value={url} />}
      </div>
      <p className="mt-3 text-xs text-muted">Your bot also answers /privacy with a short summary and this link. Using your own policy instead? It must cover the same data.</p>
    </Card>
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
