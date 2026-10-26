'use client';

import { Link2, Send } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Button, Card, CodeBlock, Input, PageHeader, Select } from '@/components/ui';
import { ConnectQr } from '@/components/qr-code';
import { VerifyCard } from '@/components/verify-card';
import { api, ApiError, fetcher } from '@/lib/api';
import { envPath, useEnvironment, useOrgParams, useRequireUser } from '@/lib/hooks';
import type { Customer, LinkResult, Message, Page } from '@/lib/types';

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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const buttonText = String(form.get('buttonText') ?? '').trim();
    const buttonUrl = String(form.get('buttonUrl') ?? '').trim();
    setSending(true);
    setSendError(null);
    setResult(null);
    try {
      setResult(
        await api<Message>(`${base}/playground/send`, {
          method: 'POST',
          body: { to, text: form.get('text'), ...(buttonText && buttonUrl ? { buttons: [[{ text: buttonText, url: buttonUrl }]] } : {}) },
        }),
      );
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
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Message</span>
              <textarea
                name="text"
                required
                maxLength={4096}
                rows={3}
                defaultValue="Your order #1042 is out for delivery 🚚"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Button text (optional)" name="buttonText" placeholder="Track order" />
              <Input label="Button URL" name="buttonUrl" type="url" placeholder="https://…" />
            </div>
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
                <Alert tone="amber">This customer can&apos;t be reached on Telegram. In production, this is where your code sends SMS or email instead.</Alert>
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
