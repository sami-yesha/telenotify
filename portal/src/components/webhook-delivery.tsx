'use client';

import { ArrowUpRight, CheckCircle2, Clock, RotateCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { DeliveryStatus, WebhookDelivery } from '@/lib/types';
import { Alert, Badge, Button, CodeBlock, Dialog, formatDate } from './ui';

const tones: Record<DeliveryStatus, 'green' | 'amber' | 'red' | 'blue'> = { DELIVERED: 'green', PENDING: 'amber', FAILED: 'red', CLI_ONLY: 'blue' };
const labels: Record<DeliveryStatus, string> = { DELIVERED: 'delivered', PENDING: 'retrying', FAILED: 'failed', CLI_ONLY: 'CLI only' };

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge tone={tones[status]} dot>
      {labels[status]}
    </Badge>
  );
}

export function lastResponse(d: WebhookDelivery) {
  if (d.lastStatusCode) return `HTTP ${d.lastStatusCode}`;
  return d.lastError ?? (d.attempts === 0 ? 'Not attempted yet' : '—');
}

// Details of one webhook event: payload, every attempt, and a resend button.
export function DeliveryDialog({
  delivery,
  basePath,
  messageHref,
  onClose,
  onResent,
}: {
  delivery: WebhookDelivery | null;
  basePath: string;
  messageHref?: (messageId: string) => string;
  onClose: () => void;
  onResent: () => void;
}) {
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!delivery) return;
    setResending(true);
    setError(null);
    try {
      await api(`${basePath}/webhooks/deliveries/${delivery.id}/resend`, { method: 'POST' });
      onResent();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setResending(false);
    }
  }

  return (
    <Dialog open={Boolean(delivery)} onClose={onClose} title={delivery?.event ?? ''} description={delivery ? `Event ${delivery.id}` : undefined}>
      {delivery && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <DeliveryStatusBadge status={delivery.status} />
            <span className="text-muted">
              {delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'} · created {formatDate(delivery.createdAt)}
            </span>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Attempts</p>
            {delivery.attemptLog.length === 0 ? (
              <p className="text-sm text-muted">Queued, not attempted yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {delivery.attemptLog.map((a, i) => {
                  const ok = a.statusCode !== undefined && a.statusCode >= 200 && a.statusCode < 300;
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                      {ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-red-500" />}
                      <span className="font-mono text-xs text-ink">{a.statusCode ? `HTTP ${a.statusCode}` : a.error}</span>
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted">
                        <Clock className="size-3" />
                        {a.durationMs !== undefined && `${a.durationMs} ms · `}
                        {new Date(a.at).toLocaleTimeString()}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Payload</p>
            <div className="max-h-64 overflow-auto">
              <CodeBlock language="json" code={JSON.stringify(delivery.payload, null, 2)} />
            </div>
          </div>

          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {delivery.messageId && messageHref ? (
              <Link href={messageHref(delivery.messageId)} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                View message <ArrowUpRight className="size-3.5" />
              </Link>
            ) : (
              <span />
            )}
            <Button onClick={resend} loading={resending} variant="secondary">
              <RotateCw className="size-4" /> Resend event
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
