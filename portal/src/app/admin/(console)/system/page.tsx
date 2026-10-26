'use client';

import { AlertTriangle, CheckCircle2, Clock, Database, Mail, RefreshCw, Send, Server } from 'lucide-react';
import useSWR from 'swr';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';

interface QueueHealth {
  name: string;
  ok: boolean;
  error?: string;
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  completed?: number;
}

interface SystemHealth {
  database: boolean;
  queues: QueueHealth[];
  sandboxBot: { configured: boolean; username: string | null };
  email: { configured: boolean; from: string | null };
  publicBaseUrl: string | null;
  portalUrl: string | null;
  uptimeSeconds: number;
  node: string;
}

export default function AdminSystem() {
  const { data, mutate, isValidating } = useSWR<SystemHealth>('/admin/system', fetcher, { refreshInterval: 15_000 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink sm:text-[1.75rem]">System</h1>
          <p className="mt-1.5 text-sm text-muted">Health of the server, queues and integrations. Refreshes every 15 seconds.</p>
        </div>
        <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Status icon={Database} label="Database" ok={data.database} detail={data.database ? 'Connected' : 'Not reachable'} />
            <Status
              icon={Send}
              label="Sandbox bot"
              ok={data.sandboxBot.configured && Boolean(data.sandboxBot.username)}
              detail={data.sandboxBot.username ? `@${data.sandboxBot.username}` : data.sandboxBot.configured ? 'Starting…' : 'Not configured'}
            />
            <Status icon={Mail} label="Email" ok={data.email.configured} detail={data.email.configured ? (data.email.from ?? 'SMTP set') : 'Printing to the log (no SMTP_URL)'} />
            <Status icon={Clock} label="API uptime" ok detail={`${formatUptime(data.uptimeSeconds)} · Node ${data.node}`} />
          </div>

          <Card icon={Server} title="Queues" description="Background jobs. Failed jobs have used up their retries; a growing 'waiting' count means sending is falling behind.">
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line/70 bg-subtle/50 text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                    {['Queue', 'Waiting', 'Active', 'Delayed', 'Failed', 'Completed (kept)'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-5 py-2 font-medium sm:px-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {data.queues.map((q) => (
                    <tr key={q.name}>
                      <td className="px-5 py-3 font-medium text-ink sm:px-6">
                        {q.name} {!q.ok && <Badge tone="red">{q.error ?? 'error'}</Badge>}
                      </td>
                      {(['waiting', 'active', 'delayed', 'failed', 'completed'] as const).map((k) => (
                        <td key={k} className={cn('px-5 py-3 tabular-nums sm:px-6', k === 'failed' && (q[k] ?? 0) > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted')}>
                          {q[k] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Addresses">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">API (PUBLIC_BASE_URL, used by Telegram)</dt>
                <dd className="mt-0.5 font-mono text-ink">{data.publicBaseUrl ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Portal (PORTAL_URL)</dt>
                <dd className="mt-0.5 font-mono text-ink">{data.portalUrl ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}

function Status({ icon: Icon, label, ok, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; ok: boolean; detail: string }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4 shadow-soft', ok ? 'border-line' : 'border-amber-300/60 dark:border-amber-500/30')}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon className="size-4" /> {label}
        </p>
        {ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertTriangle className="size-4 text-amber-500" />}
      </div>
      <p className="mt-2 truncate text-sm font-medium text-ink">{detail}</p>
    </div>
  );
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
