'use client';

import { ArrowRight, Ban, Bot, Building2, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Badge, Card, Skeleton, timeAgo } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { AdminOrg } from '@/lib/types';

interface Overview {
  totals: { users: number; verifiedUsers: number; orgs: number; suspended: number; approved: number; liveBots: number; waitingReview: number };
  days: { date: string; signups: number; live: number; sandbox: number }[];
}

const n = (v: number) => v.toLocaleString('en-US');

export default function AdminOverview() {
  const { data } = useSWR<Overview>('/admin/overview', fetcher, { refreshInterval: 60_000 });
  const { data: orgs } = useSWR<AdminOrg[]>('/admin/orgs', fetcher);
  const queue = (orgs ?? []).filter((o) => o.status === 'ACTIVE' && !o.liveApprovedAt && (o.liveReviewRequestedAt || o.liveBotUsername)).slice(0, 5);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { totals, days } = data;
  const liveTotal = days.reduce((sum, d) => sum + d.live, 0);
  const signupTotal = days.reduce((sum, d) => sum + d.signups, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink sm:text-[1.75rem]">Overview</h1>
        <p className="mt-1.5 text-sm text-muted">How the hosted service is doing. Updates every minute.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon={Users} label="Users" value={n(totals.users)} sub={`${n(totals.verifiedUsers)} verified`} />
        <Tile icon={Building2} label="Organizations" value={n(totals.orgs)} sub={`${n(totals.approved)} approved for live`} />
        <Tile icon={Bot} label="Live bots" value={n(totals.liveBots)} />
        <Tile icon={ShieldCheck} label="Waiting for review" value={n(totals.waitingReview)} tone={totals.waitingReview ? 'amber' : undefined} href="/admin/orgs" />
        <Tile icon={Ban} label="Suspended" value={n(totals.suspended)} tone={totals.suspended ? 'red' : undefined} href="/admin/orgs" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Messages per day" description={`${n(liveTotal)} live messages in the last 30 days, plus sandbox tests.`}>
          <Bars days={days} series={[{ key: 'live', label: 'Live', className: 'bg-brand' }, { key: 'sandbox', label: 'Sandbox', className: 'bg-amber-400/70' }]} />
        </Card>
        <Card title="Sign-ups per day" description={`${n(signupTotal)} new users in the last 30 days.`}>
          <Bars days={days} series={[{ key: 'signups', label: 'Sign-ups', className: 'bg-emerald-500' }]} />
        </Card>
      </div>

      <Card
        title="Review queue"
        description="Organizations with a live bot or a review request, not yet approved."
        actions={
          <Link href="/admin/orgs" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            All organizations <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. 🎉</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {queue.map((org) => (
              <li key={org.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-sm font-semibold text-ink">{org.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{org.name}</p>
                  <p className="truncate text-xs text-muted">
                    {org.owners[0]?.email}
                    {org.liveBotUsername ? ` · @${org.liveBotUsername}` : ''}
                  </p>
                </div>
                {org.liveReviewRequestedAt ? <Badge tone="amber">requested {timeAgo(org.liveReviewRequestedAt)}</Badge> : <Badge>live bot, no request</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone?: 'amber' | 'red'; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <Icon className={cn('size-4', tone === 'amber' ? 'text-amber-500' : tone === 'red' ? 'text-red-500' : 'text-muted')} />
      </div>
      <p className={cn('mt-1 font-display text-2xl font-medium tabular-nums', tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  const className = 'block rounded-xl border border-line bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift';
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// Small stacked bar chart; hover a day for its numbers.
function Bars({ days, series }: { days: Overview['days']; series: { key: 'live' | 'sandbox' | 'signups'; label: string; className: string }[] }) {
  const max = Math.max(1, ...days.map((d) => series.reduce((sum, s) => sum + d[s.key], 0)));
  return (
    <div>
      <div className="flex h-44 items-end gap-[3px]">
        {days.map((d) => {
          const total = series.reduce((sum, s) => sum + d[s.key], 0);
          return (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${series.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`}
            >
              <div className="flex flex-col-reverse overflow-hidden rounded-t-[4px] transition-opacity group-hover:opacity-80" style={{ height: `${(total / max) * 100}%` }}>
                {series.map((s) => (
                  <div key={s.key} className={s.className} style={{ height: total ? `${(d[s.key] / total) * 100}%` : 0 }} />
                ))}
              </div>
              {total === 0 && <div className="h-px bg-line" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{new Date(days[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span className="flex gap-3">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className={cn('size-2 rounded-sm', s.className)} /> {s.label}
            </span>
          ))}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
