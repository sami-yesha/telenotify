'use client';

import { ArrowDownLeft, ArrowUpRight, Inbox, Search } from 'lucide-react';
import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card, Empty, formatDate, PageHeader, Select, Skeleton, Table, timeAgo } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { envPath, useOrgParams } from '@/lib/hooks';
import type { Message, MessageStatus, Page } from '@/lib/types';
import { useProgressRouter } from '@/components/route-progress';

const statuses: MessageStatus[] = ['QUEUED', 'SENT', 'UNDELIVERABLE', 'FAILED', 'RECEIVED'];

export default function MessagesPage() {
  const { orgId, env } = useOrgParams();
  const router = useProgressRouter();
  const [status, setStatus] = useState('');
  const [customer, setCustomer] = useState('');
  const query = new URLSearchParams({ limit: '25', ...(status ? { status } : {}), ...(customer ? { customer } : {}) });
  const { data, size, setSize, isLoading } = useSWRInfinite<Page<Message>>(
    (index, previous) => (previous && !previous.nextCursor ? null : `${envPath(orgId, env)}/messages?${query}${previous ? `&cursor=${previous.nextCursor}` : ''}`),
    fetcher,
    { refreshInterval: 5000 },
  );
  const messages = data?.flatMap((p) => p.data) ?? [];
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every message sent and received in this environment. Click one to see its timeline and webhook events."
        actions={
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative size-2 rounded-full bg-emerald-500" />
            </span>
            Live updates
          </span>
        }
      />
      <Card>
        <div className="mb-5 flex flex-wrap gap-3">
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              placeholder="Exact customer id"
              value={customer}
              onChange={(e) => setCustomer(e.target.value.trim())}
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <Empty
            title="No messages yet"
            icon={Inbox}
            action={env === 'sandbox' ? { label: 'Send one from the Playground', href: `/o/${orgId}/${env}/playground` } : { label: 'Read the integration guide', href: `/o/${orgId}/${env}/docs` }}
          >
            Send one from the {env === 'sandbox' ? 'playground' : 'API'} and it will appear here with its full timeline.
          </Empty>
        ) : (
          <Table head={['', 'Customer', 'Message', 'Status', 'Time']}>
            {messages.map((m) => (
              <tr key={m.id} className="cursor-pointer align-top" onClick={() => router.push(`/o/${orgId}/${env}/messages/${m.id}`)}>
                <td className="w-10">
                  <span
                    title={m.direction === 'INBOUND' ? 'Reply from customer' : 'Sent to customer'}
                    className={
                      m.direction === 'INBOUND'
                        ? 'grid size-7 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400'
                        : 'grid size-7 place-items-center rounded-lg bg-subtle text-muted'
                    }
                  >
                    {m.direction === 'INBOUND' ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                  </span>
                </td>
                <td className="font-mono text-xs text-ink">{m.to}</td>
                <td className="max-w-sm text-ink">
                  <p className="line-clamp-2 break-words">{m.plainText ?? m.text}</p>
                  {m.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{m.error}</p>}
                </td>
                <td>
                  <StatusBadge status={m.status} />
                  {m.reason && <div className="mt-1 font-mono text-[11px] text-muted">{m.reason}</div>}
                </td>
                <td className="whitespace-nowrap text-muted" title={formatDate(m.createdAt)}>
                  {timeAgo(m.createdAt)}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {hasMore && (
          <div className="mt-5 text-center">
            <Button variant="secondary" onClick={() => setSize(size + 1)}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
