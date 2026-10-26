'use client';

import { Gauge, Heart, Mail, Server } from 'lucide-react';
import { motion } from 'motion/react';
import useSWR from 'swr';
import { Card, cn, PageHeader, Skeleton } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useOrgParams } from '@/lib/hooks';
import { GITHUB_URL } from '@/lib/site';
import type { BillingOverview } from '@/lib/types';

const n = (v: number) => v.toLocaleString('en-US');
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL;

export default function BillingPage() {
  const { orgId } = useOrgParams();
  const { data } = useSWR<BillingOverview>(`/portal/orgs/${orgId}/billing`, fetcher);

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
        {usage.quota !== null && pct >= 100 && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">Limit reached: live sends are paused until the month resets. Ask us to raise it, or self-host for no limit.</p>}
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <InfoCard icon={Heart} title={`${current?.name ?? 'Free'} plan`} tone="brand">
          Telenotify is free and open source. {usage.quota === null ? 'Your organization has no monthly limit.' : `Your organization can send ${n(usage.quota)} live messages and verifications each month.`}
        </InfoCard>
        <InfoCard icon={Mail} title="Need a higher limit?">
          {SALES_EMAIL ? (
            <>
              <a className="font-medium text-brand hover:underline" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Telenotify: raise our monthly limit')}`}>
                Email us
              </a>{' '}
              with your organization name and expected volume, and we&apos;ll raise it.
            </>
          ) : (
            'Contact us with your organization name and expected volume, and we’ll raise it.'
          )}
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
