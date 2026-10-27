'use client';

import { BadgeCheck, Bot, Clock, ExternalLink, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, Card, Input, Skeleton, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { useOrg } from '@/lib/hooks';
import type { BusinessVerification } from '@/lib/types';

// The "Verified business" badge: send legal details, an operator checks them,
// and customers then see "✓ Verified business" wherever Telenotify shows the org.
export function BusinessVerificationCard() {
  const { data: org, mutate: refreshOrg } = useOrg();
  const path = org ? `/portal/orgs/${org.id}/business` : null;
  const { data: business, mutate } = useSWR<BusinessVerification>(path, fetcher);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [botLine, setBotLine] = useState<string | null>(null);

  if (!org || !business) return <Skeleton className="h-48" />;
  const isOwner = org.role === 'OWNER';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const website = String(form.get('website') ?? '').trim();
      mutate(
        await api<BusinessVerification>(path!, {
          method: 'POST',
          body: { legalName: form.get('legalName'), tin: String(form.get('tin') ?? '').replace(/\D/g, ''), tradeLicense: form.get('tradeLicense'), ...(website ? { website } : {}) },
        }),
        false,
      );
      refreshOrg();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function showOnBot() {
    setBusy(true);
    setError(null);
    try {
      const { shortDescription } = await api<{ shortDescription: string }>(`${path}/show-on-bot`, { method: 'POST' });
      setBotLine(shortDescription);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (business.status === 'verified') {
    return (
      <Card icon={BadgeCheck} title="Verified business" description={`Verified ${business.verifiedAt ? timeAgo(business.verifiedAt) : ''}. Customers see this badge, so they know messages really come from you.`}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
            <BadgeCheck className="size-3.5" /> Verified business
          </span>
          <span className="font-medium text-ink">{business.legalName}</span>
          <span className="text-xs text-muted">TIN {business.tin}</span>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          <li>• On the Telenotify verify page your customers open.</li>
          <li>
            • At{' '}
            <Link href={org.liveBotUsername ? `/check?bot=${org.liveBotUsername}` : '/check'} className="font-medium text-brand hover:underline">
              /check
            </Link>
            , where anyone can confirm a bot is really yours before sharing their number.
          </li>
        </ul>
        {isOwner && (
          <div className="mt-5 rounded-xl border border-line bg-subtle/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Bot className="size-4" /> Show it on your bot&apos;s profile
            </p>
            <p className="mt-1 text-sm text-muted">Sets your live bot&apos;s short description (the line under its name) to the badge. It replaces the current one.</p>
            {botLine ? (
              <div className="mt-3">
                <Alert tone="green">Done. Your bot now shows: “{botLine}”</Alert>
              </div>
            ) : (
              <Button className="mt-3" variant="secondary" loading={busy} disabled={!org.liveBotConnected} onClick={showOnBot}>
                {org.liveBotConnected ? `Add to @${org.liveBotUsername}` : 'Connect your live bot first'}
              </Button>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    );
  }

  if (business.status === 'pending') {
    return (
      <Card icon={Clock} title="Business verification in review" description={`Sent ${business.requestedAt ? timeAgo(business.requestedAt) : ''}. We check the trade registry, usually within a day, and email you.`}>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <Detail label="Legal name" value={business.legalName} />
          <Detail label="TIN" value={business.tin} />
          <Detail label="Trade license" value={business.tradeLicense} />
        </dl>
      </Card>
    );
  }

  return (
    <Card
      icon={BadgeCheck}
      title="Get the Verified business badge"
      description="Free. Show customers that messages and verification requests really come from your registered business, not someone pretending to be you."
    >
      {business.status === 'rejected' && (
        <div className="mb-4">
          <Alert tone="amber">
            <span className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Not approved: {business.rejectReason}. Correct the details below and send again.
              </span>
            </span>
          </Alert>
        </div>
      )}
      {isOwner ? (
        <form onSubmit={submit} className="space-y-4">
          <Input name="legalName" label="Registered business name" defaultValue={business.legalName ?? ''} placeholder="Abebe Pharmacy PLC" required maxLength={120} hint="Exactly as on your trade license." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="tin" label="TIN" defaultValue={business.tin ?? ''} placeholder="0012345678" inputMode="numeric" required maxLength={12} hint="10 digits, from your TIN certificate." />
            <Input name="tradeLicense" label="Trade license number" defaultValue={business.tradeLicense ?? ''} placeholder="AA/14/1/1234/2016" required maxLength={60} />
          </div>
          <Input name="website" type="url" label="Website (optional)" defaultValue={business.website ?? ''} placeholder="https://abebe.et" />
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              Request verification
            </Button>
            <a href="https://etrade.gov.et" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              We check it against the Ministry of Trade registry <ExternalLink className="size-3" />
            </a>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">Ask an owner of this organization to request verification.</p>
      )}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-ink">{value ?? '—'}</dd>
    </div>
  );
}
