'use client';

import { ArrowDownLeft, ArrowLeft, Check, CircleDot, Code2, History, MessageSquareText, Send, User, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { StatusBadge } from '@/components/status-badge';
import { TelegramPreview } from '@/components/telegram-preview';
import { Badge, Card, CodeBlock, Empty, formatDate, PageHeader, Skeleton, Table, timeAgo } from '@/components/ui';
import { DeliveryDialog, DeliveryStatusBadge, lastResponse } from '@/components/webhook-delivery';
import { API_BASE_URL, ApiError, fetcher } from '@/lib/api';
import { envPath, useOrgParams } from '@/lib/hooks';
import type { MessageDetail, MessageFallback, WebhookDelivery } from '@/lib/types';

const reasons: Record<string, string> = {
  not_linked: 'The customer has not connected Telegram yet. Send this through your fallback (SMS/email).',
  blocked: 'The customer blocked your bot. Use your fallback channel.',
  chat_gone: 'The Telegram chat no longer exists (account deleted or bot removed).',
  telegram_unavailable: 'Telegram kept failing after retries. Try again later or use your fallback.',
  telegram_rejected: 'Telegram rejected the message content. See the error below.',
};

export default function MessageDetailPage() {
  const { orgId, env } = useOrgParams();
  const { messageId } = useParams<{ messageId: string }>();
  const base = envPath(orgId, env);
  const { data: m, error, mutate } = useSWR<MessageDetail>(`${base}/messages/${messageId}`, fetcher, { refreshInterval: 5000 });
  const [selected, setSelected] = useState<WebhookDelivery | null>(null);

  if (error) {
    return <Empty title={error instanceof ApiError && error.status === 404 ? 'Message not found' : 'Could not load this message'} />;
  }
  if (!m) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const curl = m.request
    ? `curl -X POST ${API_BASE_URL}/v1/messages \\\n  -H "x-api-key: ${env === 'sandbox' ? 'tn_test_…' : 'tn_live_…'}" \\\n  -H "content-type: application/json" \\\n  -d '${JSON.stringify(m.request, null, 2).replace(/'/g, "'\\''")}'`
    : null;

  const final = m.status === 'SENT' || m.status === 'UNDELIVERABLE' || m.status === 'FAILED';
  const timeline = [
    { label: m.direction === 'INBOUND' ? 'Received from customer' : 'Accepted by API', at: m.createdAt, icon: m.direction === 'INBOUND' ? ArrowDownLeft : CircleDot, tone: 'text-brand' },
    ...(m.direction === 'OUTBOUND' && m.attempts > 0 ? [{ label: `Delivery attempted ${m.attempts}×`, at: null, icon: Send, tone: 'text-muted' }] : []),
    ...(m.status === 'SENT' ? [{ label: 'Delivered to Telegram', at: m.sentAt, icon: Check, tone: 'text-emerald-500' }] : []),
    ...(m.status === 'UNDELIVERABLE' || m.status === 'FAILED' ? [{ label: m.status === 'FAILED' ? 'Failed' : 'Undeliverable', at: null, icon: XCircle, tone: m.status === 'FAILED' ? 'text-red-500' : 'text-amber-500' }] : []),
  ];

  return (
    <>
      <Link href={`/o/${orgId}/${env}/messages`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Messages
      </Link>
      <PageHeader
        title={m.direction === 'INBOUND' ? 'Reply from customer' : 'Message'}
        description={<span className="font-mono text-xs">{m.id}</span>}
        actions={<StatusBadge status={m.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Content">
            {m.format === 'markdown' ? (
              <TelegramPreview text={m.text} format="markdown" botName="As the customer sees it" buttons={m.buttons ?? []} />
            ) : (
              <p className="whitespace-pre-wrap rounded-xl bg-subtle p-4 text-sm text-ink">{m.text}</p>
            )}
            {m.buttons && m.format !== 'markdown' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.buttons.flat().map((b) => (
                  <a key={b.url + b.text} href={b.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-sm text-brand hover:bg-subtle">
                    {b.text}
                  </a>
                ))}
              </div>
            )}
            {m.reason && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <span className="font-mono text-xs font-semibold">{m.reason}</span>
                <p className="mt-1">{reasons[m.reason] ?? 'See the error below.'}</p>
              </div>
            )}
            {m.error && <p className="mt-3 font-mono text-xs text-red-600 dark:text-red-400">{m.error}</p>}
            {m.fallback && <FallbackResult fallback={m.fallback} sandbox={env === 'sandbox'} href={`/o/${orgId}/${env}/sms-fallback`} />}
          </Card>

          {curl && (
            <Card icon={Code2} title="Request" description="The call that created this message. Copy it to reproduce it.">
              <CodeBlock language="bash" code={curl} />
            </Card>
          )}

          <Card icon={History} title="Webhook events" description="What we told your server about this message.">
            {m.events.length === 0 ? (
              <Empty title="No events for this message">
                {final ? 'No webhook URL was set when this message finished.' : 'Events appear when the message is delivered or fails.'}
              </Empty>
            ) : (
              <Table head={['Event', 'Status', 'Last response', 'Time']}>
                {m.events.map((d) => (
                  <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer">
                    <td className="font-mono text-xs text-ink">{d.event}</td>
                    <td>
                      <DeliveryStatusBadge status={d.status} />
                    </td>
                    <td className="font-mono text-xs text-muted">{lastResponse(d)}</td>
                    <td className="whitespace-nowrap text-muted">{timeAgo(d.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Timeline">
            <ol className="relative space-y-5 border-l border-line pl-6">
              {timeline.map((step) => (
                <li key={step.label} className="relative">
                  <span className="absolute -left-[33px] grid size-6 place-items-center rounded-full border border-line bg-surface">
                    <step.icon className={`size-3.5 ${step.tone}`} />
                  </span>
                  <p className="text-sm font-medium text-ink">{step.label}</p>
                  {step.at && <p className="text-xs text-muted">{formatDate(step.at)}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card icon={User} title="Customer">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Customer id</dt>
                <dd className="font-mono text-xs text-ink">{m.customer.externalId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Telegram</dt>
                <dd>
                  {m.customer.blocked ? (
                    <Badge tone="amber">blocked</Badge>
                  ) : m.customer.telegramLinked ? (
                    <Badge tone="green">{m.customer.telegramUsername ? `@${m.customer.telegramUsername}` : 'linked'}</Badge>
                  ) : (
                    <Badge tone="amber">not linked</Badge>
                  )}
                </dd>
              </div>
              {m.idempotencyKey && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Idempotency key</dt>
                  <dd className="truncate font-mono text-xs text-ink">{m.idempotencyKey}</dd>
                </div>
              )}
              {m.telegramMessageId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Telegram message id</dt>
                  <dd className="font-mono text-xs text-ink">{m.telegramMessageId}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>

      <DeliveryDialog delivery={selected} basePath={base} onClose={() => setSelected(null)} onResent={() => mutate()} />
    </>
  );
}

const fallbackCopy: Record<MessageFallback['status'], { tone: 'blue' | 'green' | 'red' | 'gray'; label: string; text: string }> = {
  queued: { tone: 'blue', label: 'SMS queued', text: 'Sending the same text by SMS through AfroMessage.' },
  sent: { tone: 'green', label: 'SMS sent', text: 'Delivered to AfroMessage as an SMS.' },
  failed: { tone: 'red', label: 'SMS failed', text: 'AfroMessage could not send the SMS.' },
  skipped: { tone: 'gray', label: 'SMS skipped', text: 'SMS fallback is on, but this customer has no phone number.' },
};

function FallbackResult({ fallback, sandbox, href }: { fallback: MessageFallback; sandbox: boolean; href: string }) {
  const copy = fallbackCopy[fallback.status];
  const text = sandbox && fallback.status === 'sent' ? 'Simulated in the sandbox: no SMS was sent. In live, this goes through your AfroMessage account.' : copy.text;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={copy.tone} dot>
            {copy.label}
            {sandbox && fallback.status === 'sent' ? ' (simulated)' : ''}
          </Badge>
          {fallback.at && <span className="text-xs text-muted">{timeAgo(fallback.at)}</span>}
          <Link href={href} className="ml-auto text-xs text-brand hover:underline">
            SMS fallback settings
          </Link>
        </div>
        <p className="mt-1 text-muted">{text}</p>
        {fallback.error && fallback.status !== 'skipped' && <p className="mt-1 break-words font-mono text-xs text-red-600 dark:text-red-400">{fallback.error}</p>}
      </div>
    </div>
  );
}
