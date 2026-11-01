'use client';

import { Clock, Gauge, Heart, Server, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Card, cn, Input, PageHeader, Skeleton, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { useOrg, useOrgParams } from '@/lib/hooks';
import { GITHUB_URL } from '@/lib/site';
import type { BillingOverview } from '@/lib/types';

const n = (v: number) => v.toLocaleString('en-US');

export default function BillingPage() {
  const { orgId } = useOrgParams();
  const { data, mutate } = useSWR<BillingOverview>(`/portal/orgs/${orgId}/billing`, fetcher);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { usage } = data;
  const current = data.plans.find((plan) => plan.id === data.plan);
  const pct = usage.quota ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const resets = new Date(usage.end).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader title="Plan & usage" description="Telenotify is free. The monthly limit counts live messages we deliver and completed phone verifications; the sandbox doesn't count." />

      <Card icon={Gauge} title="This month" description={`Live usage resets on ${resets}.`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="font-display text-3xl font-medium tabular-nums text-ink">
            {n(usage.used)}
            <span className="text-lg font-medium text-muted"> / {usage.quota === null ? 'unlimited' : n(usage.quota)}</span>
          </p>
          <p className="text-sm text-muted">
            {n(usage.messages)} messages · {n(usage.verifications)} verifications
          </p>
        </div>
        {usage.quota !== null && (
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-subtle">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand')}
            />
          </div>
        )}
        {usage.quota !== null && pct >= 100 && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">Limit reached: live sends are paused until the month resets. Request a higher limit below, or self-host for no limit.</p>}
      </Card>

      {usage.quota !== null && (
        <div className="mt-6">
          <LimitRequestCard orgId={orgId} overview={data} onSent={() => mutate()} />
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoCard icon={Heart} title={`${current?.name ?? 'Free'} plan`} tone="brand">
          Telenotify is free and open source. {usage.quota === null ? 'Your organization has no monthly limit.' : `Your organization can send ${n(usage.quota)} live messages and verifications each month.`}
        </InfoCard>
        <InfoCard icon={Server} title="Self-host for no limit">
          Run Telenotify on your own server with Docker Compose.{' '}
          <a className="font-medium text-brand hover:underline" href={GITHUB_URL} target="_blank" rel="noreferrer">
            Get the code on GitHub
          </a>
          .
        </InfoCard>
      </div>
    </>
  );
}

// Owners ask for a higher monthly limit here; an operator approves or declines in /admin.
function LimitRequestCard({ orgId, overview, onSent }: { orgId: string; overview: BillingOverview; onSent: () => void }) {
  const { data: org } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { limitRequest: request, usage } = overview;

  if (request.status === 'pending') {
    return (
      <Card icon={Clock} title="Higher limit in review" description={`You asked for ${n(request.requested ?? 0)} a month ${timeAgo(request.requestedAt)}. We'll email the owners when it's decided.`}>
        <p className="rounded-xl bg-subtle px-3.5 py-2.5 text-sm text-ink">“{request.reason}”</p>
      </Card>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/portal/orgs/${orgId}/limit-request`, { method: 'POST', body: { monthlyLimit: Number(form.get('monthlyLimit')), reason: form.get('reason') } });
      onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={TrendingUp} title="Need a higher limit?" description="It's still free. Tell us how much you need and what for, and we'll review it.">
      {request.status === 'declined' && (
        <div className="mb-4">
          <Alert tone="amber">Your last request was declined: {request.declineReason}. You can send a new one.</Alert>
        </div>
      )}
      {request.status === 'approved' && (
        <div className="mb-4">
          <Alert tone="green">Your last request was approved. Your limit is now {n(usage.quota ?? 0)} a month.</Alert>
        </div>
      )}
      {org?.role === 'OWNER' ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Input name="monthlyLimit" type="number" label="Messages a month" min={(usage.quota ?? 0) + 1} max={100_000_000} step={1} placeholder={String((usage.quota ?? 0) * 5)} required />
            <Input name="reason" label="What are they for?" placeholder="e.g. Order receipts for about 300 customers a day" required maxLength={500} />
          </div>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>
            Request a higher limit
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Ask an owner of this organization to request a higher limit.</p>
      )}
    </Card>
  );
}

function InfoCard({ icon: Icon, title, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; tone?: 'brand'; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-5 shadow-soft', tone === 'brand' ? 'border-brand/40 ring-2 ring-brand/10' : 'border-line')}>
      <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
