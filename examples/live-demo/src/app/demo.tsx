'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '@telenotify/node';
import { formatPhone, LOCALES, SAMPLES, SampleKind } from '@/lib/samples';
import type { LogEntry } from '@/lib/store';

interface State {
  configured: boolean;
  verification: { status: string; url: string | null; qrSvg: string | null; expiresAt: string } | null;
  phone: string | null;
  verifiedBy: 'webhook' | 'polling' | null;
  webhooksReceived: number;
  log: LogEntry[];
}

const CODE = {
  verify: `// 1. Your server starts a verification for this user
const verification = await telenotify.verifications.create({
  externalId: user.id,
});
// Show verification.url as a button or QR code`,
  webhook: `// 2. Telenotify calls your webhook when they share their number
const event = webhooks.constructEvent(rawBody, signature, SIGNING_SECRET);
if (event.event === 'verification.completed') {
  markVerified(user, event.data.phone); // e.g. "251911223344"
}`,
  notify: `// 3. Send to the verified user by your own id
await telenotify.messages.send({
  to: user.id,
  layout: { type: 'receipt', title: 'Payment received', rows: [...] },
});`,
  sms: `// 4. Not on Telegram? You know right away
const message = await telenotify.messages.send({ to: user.id, text });
if (message.status === 'UNDELIVERABLE') {
  // Telenotify's SMS fallback sends it through your AfroMessage
  // account, or send message.plainText by SMS yourself.
}`,
};

export function Demo({ repoUrl }: { repoUrl: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [sent, setSent] = useState<Partial<Record<SampleKind | 'sms', string>>>({});

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => document.visibilityState === 'visible' && void refresh(), 1500);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  async function call(name: string, path: string, body?: unknown): Promise<{ status?: string; reason?: string } | null> {
    setBusy(name);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return null;
      }
      return json;
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const v = state?.verification;
  const verified = Boolean(state?.phone && v?.status === 'VERIFIED');
  const waiting = v && ['PENDING', 'AWAITING_CONTACT'].includes(v.status);
  const ended = v && ['FAILED', 'EXPIRED'].includes(v.status);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <div className="space-y-4">
        {state && !state.configured && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            This demo isn&apos;t connected to Telenotify yet. Set TELENOTIFY_API_KEY and TELENOTIFY_SIGNING_SECRET.
          </p>
        )}
        {error && (
          <p role="alert" className="enter rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

        <Step n={1} title="Verify your phone number" done={verified} code={[CODE.verify, CODE.webhook]}>
          {verified ? (
            <div className="enter flex items-start gap-3 rounded-xl bg-green-50 p-4 ring-1 ring-green-200">
              <CheckIcon className="mt-0.5 size-6 shrink-0 text-good" />
              <div>
                <p className="font-semibold text-green-900">Verified {formatPhone(state!.phone!)}</p>
                <p className="mt-0.5 text-sm text-green-800">
                  Telegram confirmed this number belongs to you.
                  {state!.verifiedBy === 'webhook' ? ' This app learned it from a signed webhook.' : ' This app learned it by checking the verification.'}
                </p>
              </div>
            </div>
          ) : waiting && v ? (
            <div className="enter grid items-center gap-5 sm:grid-cols-[150px_1fr]">
              {v.qrSvg && (
                <div className="hidden rounded-xl border border-line bg-white p-3 sm:block">
                  <div className="qr" dangerouslySetInnerHTML={{ __html: v.qrSvg }} />
                </div>
              )}
              <div>
                <p className="font-medium">
                  <span className="hidden sm:inline">Scan the code with your phone, or open Telegram here.</span>
                  <span className="sm:hidden">Open Telegram and tap Start.</span>
                </p>
                <p className="mt-1 text-sm text-muted">Then tap “Share my phone number”. Telegram shares only your number.</p>
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-telegram px-4 py-2.5 font-semibold text-white shadow-sm hover:brightness-95">
                    <TelegramIcon className="size-5" /> Open Telegram
                  </a>
                )}
                <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <span className="pulse-dot size-2 rounded-full bg-telegram" />
                  {v.status === 'AWAITING_CONTACT' ? 'You opened the bot. Waiting for your number…' : 'Waiting for you in Telegram…'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {ended && (
                <p className="mb-3 text-sm text-muted">
                  {v!.status === 'EXPIRED' ? 'That verification expired before it was finished.' : 'That verification failed.'} Start a new one.
                </p>
              )}
              <button
                onClick={() => call('verify', '/api/verify')}
                disabled={busy !== null || state?.configured === false}
                className="inline-flex items-center gap-2 rounded-xl bg-telegram px-5 py-3 font-semibold text-white shadow-sm hover:brightness-95 disabled:opacity-60"
              >
                <TelegramIcon className="size-5" /> {busy === 'verify' ? 'Starting…' : 'Verify with Telegram'}
              </button>
              <p className="mt-2 text-sm text-muted">No code to type. You share your number with our demo bot in one tap.</p>
            </div>
          )}
        </Step>

        <Step n={2} title="Get a notification in Telegram" locked={!verified} code={[CODE.notify]}>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language">
            {LOCALES.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={locale === l.id}
                onClick={() => setLocale(l.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${locale === l.id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-line hover:ring-muted'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                disabled={!verified || busy !== null}
                onClick={async () => {
                  const r = await call(s.id, '/api/notify', { kind: s.id, locale });
                  if (r) setSent((x) => ({ ...x, [s.id]: r.status === 'UNDELIVERABLE' ? `Not delivered: ${r.reason}` : 'Sent. Check Telegram.' }));
                }}
                className="rounded-xl border border-line bg-white p-3 text-left hover:border-brand hover:shadow-sm disabled:pointer-events-none"
              >
                <span className="block font-semibold">{busy === s.id ? 'Sending…' : s.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{sent[s.id] ?? s.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">Reply to the bot in Telegram and your message shows up in the live log too.</p>
        </Step>

        <Step n={3} title="What if a customer isn't on Telegram?" locked={!verified} code={[CODE.sms]}>
          <p className="text-sm text-muted">
            This sends the receipt to a second customer with your number who never joined on Telegram. Telenotify answers right away that it
            can&apos;t deliver it, and SMS fallback takes over. In this demo the SMS is shown, not sent.
          </p>
          <button
            onClick={async () => {
              const r = await call('sms', '/api/sms', { locale });
              if (r) setSent((x) => ({ ...x, sms: r.status === 'UNDELIVERABLE' ? 'Undeliverable on Telegram: the SMS fallback is in the live log.' : `Status: ${r.status}` }));
            }}
            disabled={!verified || busy !== null}
            className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-50"
          >
            {busy === 'sms' ? 'Sending…' : 'Send to a customer without Telegram'}
          </button>
          {sent.sms && <p className="enter mt-2 text-sm font-medium text-ink">{sent.sms}</p>}
        </Step>

        <div className="flex flex-col gap-2 px-1 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>This demo forgets you after 24 hours. To stop its messages, block the bot in Telegram.</p>
          {state?.log.length ? (
            <button
              onClick={async () => {
                await call('reset', '/api/reset');
                setSent({});
              }}
              className="font-semibold text-brand-dark hover:underline"
            >
              Start over
            </button>
          ) : null}
        </div>
      </div>

      <BehindTheScenes log={state?.log ?? []} webhooks={state?.webhooksReceived ?? 0} repoUrl={repoUrl} />
    </div>
  );
}

function Step({ n, title, done, locked, code, children }: { n: number; title: string; done?: boolean; locked?: boolean; code: string[]; children: React.ReactNode }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${locked ? 'opacity-55' : ''}`} aria-disabled={locked}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          <span className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-good text-white' : 'bg-brand-soft text-brand-dark'}`}>
            {done ? <CheckIcon className="size-4" /> : n}
          </span>
          {title}
        </h2>
        <button onClick={() => setShowCode((s) => !s)} className="shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-medium text-muted ring-1 ring-line hover:text-ink" aria-expanded={showCode}>
          {showCode ? 'Hide code' : '</> Code'}
        </button>
      </div>
      {showCode && (
        <div className="enter mb-4 space-y-2">
          {code.map((c) => (
            <pre key={c} className="overflow-x-auto rounded-xl bg-night p-3 font-mono text-[12px] leading-relaxed text-slate-200">
              {c}
            </pre>
          ))}
        </div>
      )}
      {locked ? <div className="pointer-events-none select-none">{children}</div> : children}
      {locked && <p className="mt-3 text-xs font-medium text-muted">Verify your number in step 1 first.</p>}
    </section>
  );
}

function BehindTheScenes({ log, webhooks, repoUrl }: { log: LogEntry[]; webhooks: number; repoUrl: string }) {
  const newest = [...log].reverse();
  return (
    <aside className="overflow-hidden rounded-2xl bg-night text-slate-200 shadow-xl ring-1 ring-night-line lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-3 border-b border-night-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <span className="pulse-dot size-2 rounded-full bg-emerald-400" /> Behind the scenes
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Every call to the Telenotify API and every webhook for your session, live.</p>
        </div>
        <span className="shrink-0 rounded-full bg-night-2 px-2.5 py-1 text-xs text-slate-300 ring-1 ring-night-line">{webhooks} webhooks</span>
      </div>
      <div className="max-h-[70vh] min-h-72 space-y-2 overflow-y-auto p-4">
        {newest.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center text-center text-sm text-slate-400">
            <p className="font-medium text-slate-300">Nothing yet</p>
            <p className="mt-1 max-w-xs">Start with step 1. The requests this app sends to Telenotify, and the webhooks it gets back, appear here.</p>
          </div>
        ) : (
          newest.map((entry) => <Entry key={entry.id} entry={entry} />)
        )}
      </div>
      <div className="border-t border-night-line px-5 py-3 text-xs text-slate-400">
        Built with <code className="text-slate-300">@telenotify/node</code>.{' '}
        <a href={repoUrl} className="font-medium text-sky-300 hover:underline">
          Read the full source
        </a>
      </div>
    </aside>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (entry.kind === 'note') {
    const styles = { sms: 'bg-amber-400/10 ring-amber-400/30', reply: 'bg-sky-400/10 ring-sky-400/30', info: 'bg-night-2 ring-night-line', warn: 'bg-red-400/10 ring-red-400/30' }[entry.tone];
    return (
      <div className={`enter rounded-xl p-3 ring-1 ${styles}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-white">{entry.tone === 'sms' ? '✉️ ' : entry.tone === 'reply' ? '💬 ' : ''}{entry.title}</p>
          <span className="shrink-0 font-mono text-[11px] text-slate-500">{time}</span>
        </div>
        {entry.detail && <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-300">{entry.detail}</p>}
      </div>
    );
  }

  const isApi = entry.kind === 'api';
  const ok = !isApi || entry.status < 400;
  return (
    <div className="enter rounded-xl bg-night-2 ring-1 ring-night-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 p-3 text-left" aria-expanded={open}>
        <span className={`mt-0.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${isApi ? 'bg-sky-400/15 text-sky-300' : 'bg-violet-400/15 text-violet-300'}`}>
          {isApi ? 'API' : 'HOOK'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white">{entry.title}</span>
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-slate-400">
            {isApi ? (
              <>
                {entry.method} {entry.path} · <span className={ok ? 'text-emerald-300' : 'text-red-300'}>{entry.status}</span> · {entry.ms} ms
              </>
            ) : (
              <>
                {entry.event} · <span className="text-emerald-300">signature verified ✓</span>
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-slate-500">{time}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-night-line p-3">
          {isApi && entry.request !== undefined && <Json label="Request body" value={entry.request} />}
          {isApi && <Json label="Response" value={entry.response} />}
          {!isApi && <Json label={`Event ${entry.eventId}`} value={entry.data} />}
        </div>
      )}
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-black/30 p-2.5 font-mono text-[11.5px] leading-relaxed text-slate-300">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.94 4.3a1.1 1.1 0 0 0-1.5-1.18L2.84 9.9c-.97.38-.96 1.75.02 2.1l4.4 1.6 1.7 5.36c.24.74 1.16 1 1.74.48l2.45-2.2 4.62 3.4c.66.49 1.6.12 1.76-.69zM9.6 14.06l7.86-6.94c.18-.16-.04-.43-.25-.3l-9.5 5.98z" />
    </svg>
  );
}
