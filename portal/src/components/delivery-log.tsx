'use client';

import { History } from 'lucide-react';
import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { fetcher } from '@/lib/api';
import type { DeliveryStatus, Page, WebhookDelivery } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button, Card, Empty, formatDate, Skeleton, Table, timeAgo } from './ui';
import { DeliveryDialog, DeliveryStatusBadge, lastResponse } from './webhook-delivery';

const filters: { label: string; value: '' | DeliveryStatus }[] = [
  { label: 'All', value: '' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Retrying', value: 'PENDING' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'CLI only', value: 'CLI_ONLY' },
];

export function DeliveryLog({ basePath, messageHref }: { basePath: string; messageHref: (id: string) => string }) {
  const [status, setStatus] = useState<'' | DeliveryStatus>('');
  const [selected, setSelected] = useState<WebhookDelivery | null>(null);
  const query = new URLSearchParams({ limit: '20', ...(status ? { status } : {}) });
  const { data, size, setSize, isLoading, mutate } = useSWRInfinite<Page<WebhookDelivery>>(
    (index, previous) => (previous && !previous.nextCursor ? null : `${basePath}/webhooks/deliveries?${query}${previous ? `&cursor=${previous.nextCursor}` : ''}`),
    fetcher,
    { refreshInterval: 5000 },
  );
  const rows = data?.flatMap((p) => p.data) ?? [];
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);

  return (
    <Card
      icon={History}
      title="Delivery log"
      description="Every event we sent to your endpoint, with each attempt. Click one to see the payload or resend it."
    >
      <div className="mb-4 inline-flex rounded-xl border border-line bg-subtle p-1 text-sm">
        {filters.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={cn('rounded-lg px-3 py-1 font-medium transition-colors', status === f.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink')}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : rows.length === 0 ? (
        <Empty title="No events yet" icon={History}>
          Set a webhook URL above, then send a message. Every event and each delivery attempt appears here.
        </Empty>
      ) : (
        <Table head={['Event', 'Status', 'Attempts', 'Last response', 'Time']}>
          {rows.map((d) => (
            <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer">
              <td className="font-mono text-xs text-ink">{d.event}</td>
              <td>
                <DeliveryStatusBadge status={d.status} />
              </td>
              <td className="tabular-nums text-muted">{d.attempts}</td>
              <td className="max-w-56 truncate font-mono text-xs text-muted">{lastResponse(d)}</td>
              <td className="whitespace-nowrap text-muted" title={formatDate(d.createdAt)}>
                {timeAgo(d.createdAt)}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {hasMore && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setSize(size + 1)}>
            Load more
          </Button>
        </div>
      )}
      <DeliveryDialog delivery={selected} basePath={basePath} messageHref={messageHref} onClose={() => setSelected(null)} onResent={() => mutate()} />
    </Card>
  );
}
