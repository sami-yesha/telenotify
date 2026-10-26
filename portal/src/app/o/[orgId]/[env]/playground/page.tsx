'use client';

import { Link2, Plus, Send, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { FormatToolbar } from '@/components/format-toolbar';
import { StatusBadge } from '@/components/status-badge';
import { TelegramPreview } from '@/components/telegram-preview';
import { Alert, Button, Card, CodeBlock, Input, PageHeader, Select } from '@/components/ui';
import { ConnectQr } from '@/components/qr-code';
import { VerifyCard } from '@/components/verify-card';
import { api, ApiError, fetcher } from '@/lib/api';
import { envPath, useEnvironment, useOrgParams, useRequireUser } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { LAYOUT_TYPES, renderLayout, type Layout, type LayoutRow, type LayoutType } from '@/lib/rich-text';
import type { Customer, LinkResult, Message, Page } from '@/lib/types';

type Kind = 'text' | 'layout';

const DEFAULT_TEXT = '🚚 **Your order is on the way**\n\nOrder: `#1042`\nArrives: _today, 3-5 PM_\n\n>> Paid with Telebirr. Keep this message as your receipt.';
const DEFAULT_LAYOUT: Layout = {
  type: 'receipt',
  title: 'Payment received',
  rows: [
    { label: 'Amount', value: '1,250 ETB' },
    { label: 'From', value: 'Abebe Kebede' },
    { label: 'Reference', value: 'TX-88-4471', copy: true },
  ],
  footer: 'Abebe Pharmacy',
};

export default function PlaygroundPage() {
  const { orgId, env } = useOrgParams();
  const { user } = useRequireUser();
  const { data: environment } = useEnvironment();
  const base = envPath(orgId, env);
  const myId = user ? `dev_${user.id.slice(0, 8)}` : '';
  const { data: linked, mutate: refreshLinked } = useSWR<Page<Customer>>(`${base}/customers?linked=true&limit=50`, fetcher, { refreshInterval: 4000 });
  const me = linked?.data.find((c) => c.externalId === myId);

  const [link, setLink] = useState<LinkResult | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [to, setTo] = useState('test_linked');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Message | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [formatted, setFormatted] = useState(true);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [button, setButton] = useState({ text: '', url: '' });
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (me) setTo((current) => (current === 'test_linked' ? me.externalId : current));
  }, [me]);

  // Poll the queued message until it reaches a final state.
  useEffect(() => {
    if (!result || result.status !== 'QUEUED') return;
    const timer = setTimeout(async () => {
      const page = await api<Page<Message>>(`${base}/messages?customer=${encodeURIComponent(result.to)}&limit=5`);
      const latest = page.data.find((m) => m.id === result.id);
      if (latest) setResult(latest);
    }, 1200);
    return () => clearTimeout(timer);
  }, [result, base]);

  if (env !== 'sandbox') return <Alert tone="amber">The playground is only available in the sandbox.</Alert>;

  async function createLink() {
    setLinkError(null);
    try {
      setLink(await api<LinkResult>(`${base}/playground/link`, { method: 'POST', body: {} }));
    } catch (e) {
      setLinkError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  const buttons = button.text.trim() && button.url.trim() ? [[{ text: button.text.trim(), url: button.url.trim() }]] : undefined;
  const cleanLayout: Layout = { ...layout, rows: layout.rows?.filter((r) => r.label.trim() && r.value.trim()), footer: layout.footer?.trim() || undefined };
  const body =
    kind === 'layout'
      ? { to, layout: cleanLayout, ...(buttons ? { buttons } : {}) }
      : { to, text, ...(formatted ? { format: 'markdown' } : {}), ...(buttons ? { buttons } : {}) };

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setSendError(null);
    setResult(null);
    try {
      setResult(await api<Message>(`${base}/playground/send`, { method: 'POST', body }));
      refreshLinked();
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  const recipients = [
    ...(me ? [{ id: me.externalId, label: `You (@${me.telegramUsername ?? 'telegram'})` }] : []),
    ...(environment?.testCustomers ?? []).map((id) => ({ id, label: id })),
    ...(linked?.data ?? []).filter((c) => c.externalId !== myId && !c.testCustomer).map((c) => ({ id: c.externalId, label: c.externalId })),
  ];

  return (
    <>
      <PageHeader title="Playground" description="Try Telenotify without writing code. Everything here uses sandbox data." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card icon={Link2} title="1. Connect your Telegram" description="Link yourself to the sandbox bot to receive real messages.">
          {me ? (
            <Alert tone="green">
              Connected as <b>@{me.telegramUsername ?? 'you'}</b> (customer id <code className="font-mono">{me.externalId}</code>).
            </Alert>
          ) : link ? (
            <div className="space-y-3">
              <ConnectQr url={link.url} filename="telenotify-sandbox-connect" caption="Scan with your phone's camera, or open the link." />
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-shadow hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]"
              >
                Open in Telegram and press Start
              </a>
              <p className="text-xs text-muted">Waiting for you to press Start… this page updates automatically.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {!environment?.botUsername && <Alert tone="amber">The sandbox bot is not configured on this server, so only the test customers work.</Alert>}
              {linkError && <Alert>{linkError}</Alert>}
              <Button onClick={createLink} disabled={!environment?.botUsername}>
                Create my connect link
              </Button>
            </div>
          )}
          <p className="mt-4 text-sm text-muted">
            In your app, you&apos;d create this link with <code className="font-mono text-ink">POST /v1/customers/link</code> and show it to your customer as a button or QR code.
          </p>
        </Card>

        <Card icon={Send} title="2. Send a message" description="Send to yourself or a test customer.">
          <form onSubmit={send} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">To</span>
              <Select value={to} onChange={(e) => setTo(e.target.value)} className="w-full">
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex rounded-xl border border-line bg-subtle p-0.5 text-sm">
              {(
                [
                  ['text', 'Text'],
                  ['layout', 'Layout (receipt, alert…)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setKind(id)}
                  className={cn('flex-1 rounded-lg px-3 py-1.5 font-medium', kind === id ? 'bg-surface text-ink shadow-soft ring-1 ring-line' : 'text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>

            {kind === 'text' ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">Message</span>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={formatted} onChange={(e) => setFormatted(e.target.checked)} className="accent-[var(--color-brand)]" />
                    Formatting
                  </label>
                </div>
                {formatted && <FormatToolbar target={textarea} value={text} onChange={setText} />}
                <textarea
                  ref={textarea}
                  required
                  maxLength={4096}
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className={cn(
                    'w-full border border-line bg-surface px-3.5 py-2.5 font-mono text-[13px] text-ink shadow-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15',
                    formatted ? 'rounded-b-xl' : 'rounded-xl',
                  )}
                />
              </div>
            ) : (
              <LayoutEditor layout={layout} onChange={setLayout} />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Button text (optional)" value={button.text} onChange={(e) => setButton({ ...button, text: e.target.value })} placeholder="Track order" />
              <Input label="Button URL" type="url" value={button.url} onChange={(e) => setButton({ ...button, url: e.target.value })} placeholder="https://…" />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Preview</p>
              <TelegramPreview
                text={kind === 'layout' ? renderLayout(cleanLayout) : text}
                format={kind === 'layout' || formatted ? 'markdown' : 'plain'}
                botName={environment?.botUsername ? `@${environment.botUsername}` : 'Sandbox bot'}
                buttons={buttons}
              />
            </div>
            <CodeBlock language="the API call" code={`POST /v1/messages\n${JSON.stringify(body, null, 2)}`} />

            {sendError && <Alert>{sendError}</Alert>}
            <Button type="submit" loading={sending}>
              Send
            </Button>
          </form>
          {result && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                Result: <StatusBadge status={result.status} />
                {result.reason && <code className="font-mono text-xs text-muted">{result.reason}</code>}
              </div>
              {result.status === 'UNDELIVERABLE' && (
                <Alert tone="amber">This customer can&apos;t be reached on Telegram. With SMS fallback on, we send them the plain-text version by SMS instead.</Alert>
              )}
              <CodeBlock language="response" code={JSON.stringify(result, null, 2)} />
            </div>
          )}
        </Card>
      </div>
      <div className="mt-6">
        <VerifyCard basePath={base} />
      </div>
    </>
  );
}

function LayoutEditor({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const rows = layout.rows ?? [];
  const setRow = (i: number, row: Partial<LayoutRow>) => onChange({ ...layout, rows: rows.map((r, j) => (j === i ? { ...r, ...row } : r)) });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Type</span>
          <Select value={layout.type} onChange={(e) => onChange({ ...layout, type: e.target.value as LayoutType })} className="w-full">
            {LAYOUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        <Input label="Title" value={layout.title} onChange={(e) => onChange({ ...layout, title: e.target.value })} maxLength={120} required />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Rows</span>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="Label" maxLength={40} className="w-28 min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
              <input value={row.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="Value" maxLength={200} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Show as tap-to-copy">
                <input type="checkbox" checked={Boolean(row.copy)} onChange={(e) => setRow(i, { copy: e.target.checked })} /> copy
              </label>
              <button type="button" onClick={() => onChange({ ...layout, rows: rows.filter((_, j) => j !== i) })} className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Remove row">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        {rows.length < 15 && (
          <button type="button" onClick={() => onChange({ ...layout, rows: [...rows, { label: '', value: '' }] })} className="mt-2 flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <Plus className="size-4" /> Add row
          </button>
        )}
      </div>
      <Input label="Footer (optional)" value={layout.footer ?? ''} onChange={(e) => onChange({ ...layout, footer: e.target.value })} maxLength={120} />
    </div>
  );
}
