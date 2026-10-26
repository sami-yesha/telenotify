'use client';

import { Ban, Bot, Building2, CheckCircle2, Globe, Search, ShieldCheck, Undo2, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Dialog, Empty, Input, Select, Skeleton, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PLANS } from '@/lib/plans';
import type { AdminOrg } from '@/lib/types';

type Filter = 'review' | 'all' | 'suspended';

const n = (v: number) => v.toLocaleString('en-US');

// Operator console: approve live sending, suspend abusive organizations, raise limits.
export default function AdminPage() {
  const { data: orgs, mutate, error } = useSWR<AdminOrg[]>('/admin/orgs', fetcher, { refreshInterval: 30_000 });
  const [filter, setFilter] = useState<Filter>('review');
  const [query, setQuery] = useState('');
  const [suspending, setSuspending] = useState<AdminOrg | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const counts = useMemo(() => {
    const list = orgs ?? [];
    return {
      all: list.length,
      review: list.filter(needsReview).length,
      suspended: list.filter((o) => o.status === 'SUSPENDED').length,
      live: list.filter((o) => o.liveBotUsername).length,
    };
  }, [orgs]);

  const shown = (orgs ?? [])
    .filter((o) => (filter === 'review' ? needsReview(o) : filter === 'suspended' ? o.status === 'SUSPENDED' : true))
    .filter((o) => `${o.name} ${o.owners.map((x) => x.email).join(' ')} ${o.liveBotUsername ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  async function act(run: () => Promise<unknown>) {
    setFailure(null);
    try {
      await run();
      await mutate();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  return (
    <>

        <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink sm:text-[1.75rem]">Organizations</h1>
        <p className="mt-1.5 text-sm text-muted">Approve live sending, suspend abuse and raise limits. Every action is written to the organization&apos;s audit log.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Tile icon={Building2} label="Organizations" value={counts.all} />
          <Tile icon={ShieldCheck} label="Waiting for review" value={counts.review} tone={counts.review ? 'amber' : undefined} />
          <Tile icon={Bot} label="With a live bot" value={counts.live} />
          <Tile icon={Ban} label="Suspended" value={counts.suspended} tone={counts.suspended ? 'red' : undefined} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-line bg-subtle p-0.5 text-sm">
            {(
              [
                ['review', `Needs review (${counts.review})`],
                ['all', `All (${counts.all})`],
                ['suspended', `Suspended (${counts.suspended})`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className="relative px-3 py-1.5 font-medium">
                {filter === id && <motion.span layoutId="admin-filter" className="absolute inset-0 rounded-lg bg-surface shadow-soft ring-1 ring-line" />}
                <span className={cn('relative', filter === id ? 'text-ink' : 'text-muted hover:text-ink')}>{label}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, owner email or bot"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </label>
        </div>

        {failure && (
          <div className="mt-4">
            <Alert>{failure}</Alert>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Alert>Could not load organizations.</Alert>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {!orgs ? (
            <>
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          ) : shown.length === 0 ? (
            <Empty title={filter === 'review' ? 'Nothing waiting for review' : 'No organizations match'} icon={CheckCircle2}>
              {filter === 'review' ? 'New organizations that connect a live bot or ask for review show up here.' : 'Try another filter or search.'}
            </Empty>
          ) : (
            shown.map((org) => (
              <OrgRow
                key={org.id}
                org={org}
                onApprove={() => act(() => api(`/admin/orgs/${org.id}/approve-live`, { method: 'POST' }))}
                onUnsuspend={() => act(() => api(`/admin/orgs/${org.id}/unsuspend`, { method: 'POST' }))}
                onSuspend={() => setSuspending(org)}
                onPlan={(plan) => act(() => api(`/admin/orgs/${org.id}/plan`, { method: 'PUT', body: { plan } }))}
              />
            ))
          )}
        </div>

      <SuspendDialog
        org={suspending}
        onClose={() => setSuspending(null)}
        onSubmit={async (reason) => {
          await api(`/admin/orgs/${suspending!.id}/suspend`, { method: 'POST', body: { reason } });
          setSuspending(null);
          await mutate();
        }}
      />
    </>
  );
}

const needsReview = (o: AdminOrg) => o.status === 'ACTIVE' && !o.liveApprovedAt && (Boolean(o.liveReviewRequestedAt) || Boolean(o.liveBotUsername));

function OrgRow({
  org,
  onApprove,
  onSuspend,
  onUnsuspend,
  onPlan,
}: {
  org: AdminOrg;
  onApprove: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onPlan: (plan: string) => void;
}) {
  const blockRate = org.reached24h ? org.blocked24h / org.reached24h : 0;
  const suspended = org.status === 'SUSPENDED';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-xl border bg-surface p-5 shadow-soft', suspended ? 'border-red-200 dark:border-red-900/50' : 'border-line')}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#2b5278] text-sm font-medium text-white">{org.name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{org.name}</p>
            {suspended ? (
              <Badge tone="red" dot>
                Suspended
              </Badge>
            ) : org.liveApprovedAt ? (
              <Badge tone="green" dot>
                Live approved
              </Badge>
            ) : org.liveReviewRequestedAt ? (
              <Badge tone="amber" dot>
                Review requested {timeAgo(org.liveReviewRequestedAt)}
              </Badge>
            ) : (
              <Badge dot>Not approved</Badge>
            )}
            <Badge tone="blue">{org.planName}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3.5" /> {org.owners.map((o) => o.email).join(', ') || 'no owner'}
            </span>
            {org.liveBotUsername && (
              <a className="inline-flex items-center gap-1 text-brand hover:underline" href={`https://t.me/${org.liveBotUsername}`} target="_blank" rel="noreferrer">
                <Bot className="size-3.5" /> @{org.liveBotUsername}
              </a>
            )}
            {org.website && (
              <a className="inline-flex items-center gap-1 text-brand hover:underline" href={org.website} target="_blank" rel="noreferrer">
                <Globe className="size-3.5" /> {org.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span>created {timeAgo(org.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!suspended && !org.liveApprovedAt && (
            <Button onClick={onApprove} className="py-1.5">
              <CheckCircle2 className="size-4" /> Approve live
            </Button>
          )}
          {suspended ? (
            <Button variant="secondary" onClick={onUnsuspend} className="py-1.5">
              <Undo2 className="size-4" /> Unsuspend
            </Button>
          ) : (
            <Button variant="danger" onClick={onSuspend} className="py-1.5">
              <Ban className="size-4" /> Suspend
            </Button>
          )}
        </div>
      </div>

      {org.liveUseCase && <p className="mt-4 rounded-xl bg-subtle px-3.5 py-2.5 text-sm text-ink">“{org.liveUseCase}”</p>}
      {suspended && org.suspendedReason && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Reason: {org.suspendedReason}</p>}

      <div className="mt-4 grid gap-3 border-t border-line/70 pt-4 text-sm sm:grid-cols-3">
        <Metric label="Live used this month" value={`${n(org.usedThisMonth)} / ${org.monthlyQuota === null ? '∞' : n(org.monthlyQuota)}`} />
        <Metric
          label="Blocked the bot (24 h)"
          value={`${n(org.blocked24h)} of ${n(org.reached24h)} reached`}
          warn={org.blocked24h >= 5 && blockRate >= 0.2}
        />
        <div>
          <p className="text-xs text-muted">Limit</p>
          <Select value={org.plan} onChange={(e) => onPlan(e.target.value)} className="mt-1 w-full py-1.5" aria-label="Plan">
            {PLANS.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {plan.monthlyQuota === null ? 'no limit' : `${n(plan.monthlyQuota)}/month`}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-1 font-medium tabular-nums', warn ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{value}</p>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'amber' | 'red' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <Icon className={cn('size-4', tone === 'amber' ? 'text-amber-500' : tone === 'red' ? 'text-red-500' : 'text-muted')} />
      </div>
      <p className={cn('mt-1 font-display text-2xl font-medium tabular-nums', tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{value}</p>
    </div>
  );
}

function SuspendDialog({ org, onClose, onSubmit }: { org: AdminOrg | null; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Dialog
      open={Boolean(org)}
      onClose={onClose}
      title={`Suspend ${org?.name ?? ''}?`}
      description="All of its API keys stop working immediately and it can't send. The owners see your reason in their dashboard."
    >
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await onSubmit(String(new FormData(e.currentTarget).get('reason') ?? ''));
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Something went wrong');
          } finally {
            setLoading(false);
          }
        }}
        className="space-y-4"
      >
        <Input name="reason" label="Reason (shown to the organization)" placeholder="e.g. Customers reported phishing messages" required maxLength={500} />
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={loading}>
            Suspend
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
