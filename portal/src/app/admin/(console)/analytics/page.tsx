'use client';

import { CheckCircle2, CircleDashed, CircleHelp, Clock, Code2, Globe, Hexagon, MinusCircle, Terminal, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { OutcomesChart } from '@/components/outcomes-chart';
import { StackedBarChart } from '@/components/stacked-bar-chart';
import { Badge, Card, Skeleton, Table, timeAgo } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DayOutcome } from '@/lib/types';

type Client = 'node' | 'python' | 'cli' | 'http' | 'other';

interface Analytics {
  days: number;
  /** API calls are kept for 30 days, so API numbers cover at most that. */
  apiDays: number;
  users: { signups: number; verified: number };
  funnel: { created: number; tested: number; liveBot: number; approved: number; sentLive: number };
  messages: { daily: DayOutcome[]; totals: { sent: number; undeliverable: number; failed: number; received: number; queued: number } };
  verifications: { started: number; verified: number; failed: number; expired: number; open: number; byMethod: Record<string, number> };
  smsFallback: Record<string, number>;
  webhooks: Record<string, number>;
  api: {
    total: number;
    live: number;
    clientErrors: number;
    serverErrors: number;
    p50: number;
    p95: number;
    orgs: number;
    daily: ({ date: string } & Record<Client, number>)[];
    clients: { client: Client; requests: number; orgs: number; errors: number; p95: number; versions: { detail: string | null; requests: number; orgs: number; lastSeen: string }[] }[];
    endpoints: { method: string; endpoint: string; requests: number; errors: number; p95: number }[];
    errors: { status: number; message: string | null; n: number; orgs: number; lastSeen: string }[];
  };
  cli: { sessions: number; triggers: number; requests: number; orgs: number; listeningNow: number };
  topOrgs: { id: string; name: string; status: string; liveApproved: boolean; messages: number; verifications: number; requests: number; errors: number; clients: Client[] }[];
}

const RANGES = [7, 30, 90] as const;

// Fixed order: a client keeps its color whatever the range or filter.
const CLIENTS: { key: Client; label: string; color: string; icon: LucideIcon }[] = [
  { key: 'node', label: 'Node.js SDK', color: 'var(--series-1)', icon: Hexagon },
  { key: 'python', label: 'Python SDK', color: 'var(--series-2)', icon: Code2 },
  { key: 'cli', label: 'CLI', color: 'var(--series-3)', icon: Terminal },
  { key: 'http', label: 'curl / Postman', color: 'var(--series-4)', icon: Globe },
  { key: 'other', label: 'Other', color: 'var(--series-5)', icon: CircleHelp },
];
const clientInfo = (key: Client) => CLIENTS.find((c) => c.key === key)!;

const n = (v: number) => v.toLocaleString('en-US');
const pct = (part: number, whole: number) => {
  if (!whole) return '–';
  const value = (part / whole) * 100;
  return `${value > 0 && value < 10 ? value.toFixed(1) : Math.round(value)}%`;
};

export default function AdminAnalytics() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error } = useSWR<Analytics>(`/admin/analytics?days=${days}`, fetcher, { refreshInterval: 60_000, keepPreviousData: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink sm:text-[1.75rem]">Analytics</h1>
          <p className="mt-1.5 text-sm text-muted">Growth, delivery and how developers use the API, SDKs and CLI. Live traffic only, except API calls. Updates every minute.</p>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1 text-sm" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={cn('rounded-lg px-3 py-1.5 font-medium transition-colors', days === r ? 'bg-brand text-white' : 'text-muted hover:bg-subtle hover:text-ink')}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <Card>
          <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load analytics: {error.message}</p>
        </Card>
      ) : !data ? (
        <div className="space-y-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <Report data={data} />
      )}
    </div>
  );
}

function Report({ data }: { data: Analytics }) {
  const { messages, verifications, api, funnel } = data;
  const delivered = messages.totals.sent;
  const attempted = messages.totals.sent + messages.totals.undeliverable + messages.totals.failed;
  const apiErrors = api.clientErrors + api.serverErrors;
  const apiRange = data.apiDays < data.days ? `last ${data.apiDays} days (API calls are kept for 30 days)` : `last ${data.apiDays} days`;
  const cliVersions = api.clients.find((c) => c.client === 'cli')?.versions ?? [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="New users" value={n(data.users.signups)} sub={`${n(data.users.verified)} verified their email`} />
        <Stat label="New organizations" value={n(funnel.created)} sub={`${n(funnel.sentLive)} already sending live`} />
        <Stat label="Live messages" value={n(attempted)} sub={`${pct(delivered, attempted)} delivered`} />
        <Stat label="Verifications" value={n(verifications.started)} sub={`${pct(verifications.verified, verifications.started)} completed`} />
        <Stat label="API calls" value={n(api.total)} sub={`${pct(apiErrors, api.total)} errors · ${n(api.orgs)} orgs`} tone={api.serverErrors ? 'red' : undefined} />
        <Stat label="Response time" value={`${n(api.p95)} ms`} sub={`95th percentile · median ${n(api.p50)} ms`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card title="From sign-up to live" description={`Organizations created in the last ${data.days} days, and how far each one got.`}>
          <Funnel
            steps={[
              { label: 'Created an organization', value: funnel.created },
              { label: 'Tested in the sandbox', value: funnel.tested },
              { label: 'Connected a live bot', value: funnel.liveBot },
              { label: 'Approved for live', value: funnel.approved },
              { label: 'Sent a live message or verification', value: funnel.sentLive },
            ]}
          />
        </Card>
        <Card title="Live messages per day" description={`${n(attempted)} sent to customers, ${n(messages.totals.received)} replies received.`}>
          <OutcomesChart daily={messages.daily} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Verifications" description="Live phone verifications started in this range.">
          <Breakdown
            total={verifications.started}
            rows={[
              { label: 'Verified', value: verifications.verified, icon: CheckCircle2, tone: 'good' },
              { label: 'Failed (wrong number)', value: verifications.failed, icon: XCircle, tone: 'bad' },
              { label: 'Expired', value: verifications.expired, icon: Clock, tone: 'warn' },
              { label: 'Still open', value: verifications.open, icon: CircleDashed },
            ]}
          />
          <p className="mt-4 border-t border-line/70 pt-3 text-xs text-muted">
            Completed with Telegram: <b className="text-ink">{n(verifications.byMethod.telegram ?? 0)}</b> · with Telenotify Pass: <b className="text-ink">{n(verifications.byMethod.pass ?? 0)}</b>
          </p>
        </Card>
        <Card title="Webhook events" description="Live events sent to customers' servers.">
          <Breakdown
            total={Object.values(data.webhooks).reduce((s, v) => s + v, 0)}
            rows={[
              { label: 'Delivered', value: data.webhooks.delivered ?? 0, icon: CheckCircle2, tone: 'good' },
              { label: 'Failed after retries', value: data.webhooks.failed ?? 0, icon: XCircle, tone: 'bad' },
              { label: 'Retrying', value: data.webhooks.pending ?? 0, icon: Clock, tone: 'warn' },
              { label: 'CLI only (no webhook URL)', value: data.webhooks.cli_only ?? 0, icon: Terminal },
            ]}
          />
        </Card>
        <Card title="SMS fallback" description="Live messages Telegram couldn't deliver, sent by SMS instead.">
          <Breakdown
            total={Object.values(data.smsFallback).reduce((s, v) => s + v, 0)}
            rows={[
              { label: 'Sent by SMS', value: data.smsFallback.sent ?? 0, icon: CheckCircle2, tone: 'good' },
              { label: 'SMS failed', value: data.smsFallback.failed ?? 0, icon: XCircle, tone: 'bad' },
              { label: 'Skipped (no phone or daily limit)', value: data.smsFallback.skipped ?? 0, icon: MinusCircle, tone: 'warn' },
              { label: 'Waiting', value: data.smsFallback.queued ?? 0, icon: Clock },
            ]}
          />
        </Card>
      </div>

      <Card title="API calls by tool" description={`Every authenticated API call, sandbox and live, in the ${apiRange}.`}>
        <StackedBarChart rows={api.daily} series={CLIENTS} label="API calls per day by tool" />
        <div className="mt-6">
          <Table head={['Tool', 'Calls', 'Organizations', 'Error rate', 'Slowest 5%', 'Versions in use']}>
            {api.clients.map((c) => {
              const info = clientInfo(c.client);
              return (
                <tr key={c.client}>
                  <td className="whitespace-nowrap">
                    <ClientLabel client={c.client} />
                  </td>
                  <td className="tabular-nums text-ink">{n(c.requests)}</td>
                  <td className="tabular-nums text-ink">{n(c.orgs)}</td>
                  <td className={cn('tabular-nums', c.errors ? 'text-ink' : 'text-muted')}>{pct(c.errors, c.requests)}</td>
                  <td className="tabular-nums text-muted">{c.requests ? `${n(c.p95)} ms` : '–'}</td>
                  <td>
                    {c.versions.length === 0 ? (
                      <span className="text-muted">–</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {c.versions.map((v) => (
                          <span key={v.detail ?? 'none'} title={`${n(v.orgs)} organization${v.orgs === 1 ? '' : 's'} · last seen ${timeAgo(v.lastSeen)}`} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink">
                            {v.detail ?? (info.key === 'other' ? 'not recorded' : 'unknown')}
                            <span className="text-muted">· {n(v.requests)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Endpoints" description={`The 15 most-called endpoints, ${apiRange}.`}>
          {api.endpoints.length === 0 ? (
            <p className="text-sm text-muted">No API calls yet.</p>
          ) : (
            <Table head={['Endpoint', 'Calls', 'Errors', 'Slowest 5%']}>
              {api.endpoints.map((e) => (
                <tr key={`${e.method} ${e.endpoint}`}>
                  <td className="whitespace-nowrap font-mono text-xs text-ink">
                    <span className="mr-2 inline-block w-11 font-semibold text-muted">{e.method}</span>
                    {e.endpoint}
                  </td>
                  <td className="tabular-nums text-ink">{n(e.requests)}</td>
                  <td className={cn('tabular-nums', e.errors ? 'text-ink' : 'text-muted')}>{pct(e.errors, e.requests)}</td>
                  <td className="tabular-nums text-muted">{n(e.p95)} ms</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Most common errors" description="What developers run into most. A 5xx error is our bug.">
          {api.errors.length === 0 ? (
            <p className="text-sm text-muted">No errors. 🎉</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {api.errors.map((e) => (
                <li key={`${e.status} ${e.message}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Badge tone={e.status >= 500 ? 'red' : 'amber'}>{e.status}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-ink">{e.message ?? 'No message'}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {n(e.orgs)} organization{e.orgs === 1 ? '' : 's'} · last {timeAgo(e.lastSeen)}
                    </p>
                  </div>
                  <span className="tabular-nums text-sm font-medium text-ink">{n(e.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="CLI" icon={Terminal} description={`telenotify listen, trigger and send, ${apiRange}.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Mini label="Listening right now" value={n(data.cli.listeningNow)} />
          <Mini label="listen sessions started" value={n(data.cli.sessions)} />
          <Mini label="Test events triggered" value={n(data.cli.triggers)} />
          <Mini label="Organizations using it" value={n(data.cli.orgs)} sub={`${n(data.cli.requests)} calls`} />
        </div>
        {cliVersions.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Versions:{' '}
            {cliVersions.map((v, i) => (
              <span key={v.detail ?? 'none'}>
                {i > 0 && ', '}
                <b className="font-mono text-ink">{v.detail ?? 'before 0.1.1'}</b> ({n(v.orgs)} org{v.orgs === 1 ? '' : 's'})
              </span>
            ))}
          </p>
        )}
      </Card>

      <Card title="Most active organizations" description={`By live messages, verifications and API calls in the last ${data.days} days.`}>
        {data.topOrgs.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <Table head={['Organization', 'Live messages', 'Verified', 'API calls', 'API errors', 'Tools']}>
            {data.topOrgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{o.name}</span>
                    {o.status === 'SUSPENDED' ? <Badge tone="red">suspended</Badge> : !o.liveApproved && <Badge>not approved</Badge>}
                  </div>
                </td>
                <td className="tabular-nums text-ink">{n(o.messages)}</td>
                <td className="tabular-nums text-ink">{n(o.verifications)}</td>
                <td className="tabular-nums text-ink">{n(o.requests)}</td>
                <td className={cn('tabular-nums', o.errors ? 'text-ink' : 'text-muted')}>{pct(o.errors, o.requests)}</td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {o.clients.map((c) => (
                      <ClientLabel key={c} client={c} small />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-soft">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-medium tabular-nums', tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-subtle/70 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-display text-xl font-medium tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ClientLabel({ client, small }: { client: Client; small?: boolean }) {
  const info = clientInfo(client);
  return (
    <span className={cn('inline-flex items-center gap-1.5', small ? 'text-xs text-muted' : 'text-ink')}>
      <span className="size-2.5 rounded-sm" style={{ background: info.color }} />
      <info.icon className="size-3.5 text-muted" aria-hidden />
      {info.label}
    </span>
  );
}

// Each step as a share of the first, so drop-off between steps is easy to see.
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = steps[0]?.value ?? 0;
  if (!first) return <p className="text-sm text-muted">No new organizations in this range.</p>;
  return (
    <ol className="space-y-3.5">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">
              <span className="mr-1.5 tabular-nums text-muted">{i + 1}.</span>
              {s.label}
            </span>
            <span className="whitespace-nowrap tabular-nums">
              <b className="font-medium text-ink">{n(s.value)}</b> <span className="text-muted">{pct(s.value, first)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (s.value / first) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

const TONES = { good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-500', bad: 'text-red-500' } as const;

function Breakdown({ total, rows }: { total: number; rows: { label: string; value: number; icon: LucideIcon; tone?: keyof typeof TONES }[] }) {
  if (!total) return <p className="text-sm text-muted">Nothing in this range.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2.5 text-sm">
          <r.icon className={cn('size-4 shrink-0', r.tone ? TONES[r.tone] : 'text-muted')} aria-hidden />
          <span className="min-w-0 flex-1 text-ink">{r.label}</span>
          <span className="tabular-nums font-medium text-ink">{n(r.value)}</span>
          <span className="w-12 text-right tabular-nums text-xs text-muted">{pct(r.value, total)}</span>
        </li>
      ))}
    </ul>
  );
}
