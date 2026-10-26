'use client';

import { ArrowRight, BarChart3, Bot, Check, MessageSquare, PiggyBank, Send, Users } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import useSWR from 'swr';
import { OutcomesChart } from '@/components/outcomes-chart';
import { CodeTabs } from '@/components/code-tabs';
import { Badge, Card, cn, Skeleton } from '@/components/ui';
import { API_BASE_URL, fetcher } from '@/lib/api';
import { envPath, useEnvironment, useOrg, useOrgParams } from '@/lib/hooks';
import { snippets, toJs } from '@/lib/snippets';
import type { Analytics, ApiKey } from '@/lib/types';

export default function GetStartedPage() {
  const { orgId, env } = useOrgParams();
  const { data: org } = useOrg();
  const { data: environment } = useEnvironment();
  const { data: keys } = useSWR<ApiKey[]>(`${envPath(orgId, env)}/keys`, fetcher);
  const { data: analytics } = useSWR<Analytics>(`${envPath(orgId, env)}/analytics?days=14`, fetcher, { refreshInterval: 30_000 });

  if (!environment || !org || !keys) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const base = `/o/${orgId}/${env}`;
  const hasKey = keys.some((k) => !k.revokedAt);
  const steps =
    env === 'sandbox'
      ? [
          { done: hasKey, title: 'Get a sandbox API key', body: 'Your first key was created with the organization.', href: `${base}/keys`, cta: 'API keys' },
          { done: environment.usage.linkedCustomers > 0, title: 'Connect your own Telegram', body: 'Link yourself to the sandbox bot and receive a real message.', href: `${base}/playground`, cta: 'Open playground' },
          { done: false, title: 'Test your fallback', body: 'Send to the built-in test customers to see every outcome your code must handle.', href: `${base}/docs#test-customers`, cta: 'Test customers' },
          { done: Boolean(environment.eventWebhookUrl), title: 'Receive webhook events', body: 'Get delivery results and replies pushed to your server.', href: `${base}/webhooks`, cta: 'Set webhook' },
          { done: org.liveBotConnected, title: 'Go live', body: 'Connect your own bot so customers see your brand, then use a live key.', href: `/o/${orgId}/live/bot`, cta: 'Switch to live' },
        ]
      : [
          { done: environment.botConnected, title: 'Connect your Telegram bot', body: 'Create a bot with @BotFather and paste its token.', href: `${base}/bot`, cta: 'Connect bot' },
          { done: hasKey, title: 'Create a live API key', body: 'Keep it on your server only.', href: `${base}/keys`, cta: 'API keys' },
          { done: Boolean(environment.eventWebhookUrl), title: 'Set your webhook URL', body: 'HTTPS endpoint for delivery results.', href: `${base}/webhooks`, cta: 'Set webhook' },
          { done: environment.usage.linkedCustomers > 0, title: 'Link your first customer', body: 'Show the t.me link from POST /v1/customers/link in your app or receipt.', href: `${base}/docs`, cta: 'Read the guide' },
        ];
  const doneCount = steps.filter((s) => s.done).length;

  const firstMessage = { to: env === 'sandbox' ? 'test_linked' : 'customer_123', text: 'Your order is on its way 🚚' };
  const samples = snippets(
    { method: 'POST', path: '/v1/messages', body: firstMessage, sdk: `const message = await telenotify.messages.send(${toJs(firstMessage)});` },
    { baseUrl: API_BASE_URL, apiKey: env === 'sandbox' ? 'tn_test_…' : 'tn_live_…' },
  );

  return (
    <div className="space-y-6">
      <section className="tg-panel overflow-hidden rounded-xl">
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:items-center">
          <div>
            <Badge tone={env === 'sandbox' ? 'amber' : 'green'} dot>
              {env === 'sandbox' ? 'Sandbox' : 'Live'}
            </Badge>
            <h1 className="mt-3 font-display text-[1.9rem] font-normal leading-[1.05] text-ink sm:text-[2.6rem]">
              {env === 'sandbox' ? `Welcome to ${org.name}` : `${org.name} is ${environment.botConnected ? 'ready for' : 'almost ready for'} production`}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
              {env === 'sandbox'
                ? 'Try the whole flow with test data. When a customer can’t be reached on Telegram, the API tells you immediately so your fallback can take over.'
                : 'Messages here reach real customers through your own bot. Finish the checklist to start sending.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="h-2 w-40 overflow-hidden rounded-full bg-subtle ring-1 ring-inset ring-line/60">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(doneCount / steps.length) * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-brand"
                  />
                </div>
                <span className="text-muted">
                  {doneCount} of {steps.length} done
                </span>
              </div>
              <span className="flex items-center gap-1.5 text-muted">
                <Bot className="size-4" />
                <span className="font-medium text-ink">{environment.botUsername ? `@${environment.botUsername}` : 'No bot yet'}</span>
                <span aria-hidden>·</span>
                {environment.usage.linkedCustomers}
                {environment.usage.linkedCustomerLimit !== undefined && ` / ${environment.usage.linkedCustomerLimit}`} linked
              </span>
            </div>
          </div>
          <NextStep step={steps.find((step) => !step.done)} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={PiggyBank}
          tone="emerald"
          label="SMS saved · 14 days"
          value={analytics ? formatEtb(analytics.smsSaved.etb) : '…'}
          hint={analytics ? `${analytics.smsSaved.count.toLocaleString('en-US')} messages & verifications at ${analytics.smsSaved.pricePerSmsEtb} ETB/SMS` : undefined}
        />
        <Stat
          icon={Check}
          tone="sky"
          label="Delivery rate"
          value={analytics?.deliveryRate == null ? '—' : `${Math.round(analytics.deliveryRate * 100)}%`}
          hint="Sent ÷ (sent + undeliverable + failed)"
        />
        <Stat
          icon={Users}
          tone="indigo"
          label="Customers on Telegram"
          value={analytics?.reachable.share == null ? '—' : `${Math.round(analytics.reachable.share * 100)}%`}
          hint={analytics ? `${analytics.reachable.reachable} of ${analytics.reachable.customers} reachable` : undefined}
        />
        <Stat icon={Send} tone="amber" label="Messages today" value={environment.usage.messagesToday} limit={environment.usage.dailyMessageLimit} />
      </div>

      <Card icon={BarChart3} title="Messages per day" description="Last 14 days, by outcome. Hover a day for details.">
        {analytics ? <OutcomesChart daily={analytics.daily} /> : <Skeleton className="h-48" />}
      </Card>

      <Card title="Checklist" description="Everything you need to send your first real notification.">
        <ol className="-my-1 divide-y divide-line">
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex flex-wrap items-center gap-4 py-3.5"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done ? 'bg-emerald-500 text-white shadow-soft' : 'border border-line bg-page text-muted',
                )}
              >
                {step.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.done ? 'text-muted line-through decoration-muted/40' : 'text-ink')}>{step.title}</p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
              <Link
                href={step.href}
                className="group inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand-soft"
              >
                {step.cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.li>
          ))}
        </ol>
      </Card>

      <Card icon={MessageSquare} title="Send your first message" description="One call. The response tells you right away if the customer can’t be reached.">
        <CodeTabs samples={samples} title="POST /v1/messages" />
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          Possible results:
          <Badge dot>queued</Badge>
          <Badge tone="green" dot>
            sent
          </Badge>
          <Badge tone="amber" dot>
            undeliverable
          </Badge>
          <Badge tone="red" dot>
            failed
          </Badge>
        </div>
      </Card>
    </div>
  );
}

// Small amounts keep their decimals so a few saved SMS don't show as "0 ETB".
function formatEtb(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 0 })} ETB`;
}

const statTones = {
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  sky: 'bg-brand-soft text-brand',
  indigo: 'bg-brand-soft text-brand',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
};

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  limit,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof statTones;
  label: string;
  value: number | string;
  limit?: number;
  hint?: string;
}) {
  const pct = typeof value === 'number' && limit ? Math.min(100, (value / limit) * 100) : null;
  return (
    <div className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-muted/40">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', statTones[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-1 truncate font-display text-[2rem] font-normal leading-tight tracking-[-0.03em] tabular-nums text-ink">
        {value}
        {limit !== undefined && <span className="text-base font-medium text-muted"> / {limit}</span>}
      </p>
      {hint && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{hint}</p>}
      {pct !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div className={cn('h-full rounded-full', pct > 80 ? 'bg-amber-500' : 'bg-brand')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

type Step = { done: boolean; title: string; body: string; href: string; cta: string };

function NextStep({ step }: { step?: Step }) {
  if (!step) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 backdrop-blur">
        <span className="grid size-9 place-items-center rounded-full bg-emerald-500 text-white shadow-soft">
          <Check className="size-5" />
        </span>
        <p className="mt-3 font-semibold text-ink">You&apos;re all set</p>
        <p className="mt-1 text-sm text-muted">Every step is done. Your messages and results show up under Monitor.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-page/70 p-5 shadow-soft backdrop-blur">
      <p className="text-[13px] font-medium text-brand">Next step</p>
      <p className="mt-2 font-semibold text-ink">{step.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
      <Link
        href={step.href}
        className="group mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-page shadow-soft transition-shadow hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]"
      >
        {step.cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
