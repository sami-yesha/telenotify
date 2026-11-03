'use client';

import { Clock, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Alert, Button, Card, Input, timeAgo } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useOrg } from '@/lib/hooks';
import type { Org } from '@/lib/types';

// New organizations can't send live until an operator approves them; this asks for
// that approval. Hidden once approved.
export function LiveReviewCard() {
  const { data: org, mutate } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!org || org.liveApproved) return null;

  if (org.liveReviewRequestedAt) {
    return (
      <Card icon={Clock} title="Live review requested" description={`Sent ${timeAgo(org.liveReviewRequestedAt)}. We usually review within a day.`}>
        <p className="text-sm text-muted">
          Live sending starts once it&apos;s approved, and your sandbox keeps working until then. We&apos;ll email you when it&apos;s approved.
        </p>
      </Card>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);
    try {
      const website = String(form.get('website') ?? '').trim();
      mutate(await api<Org>(`/portal/orgs/${org!.id}/live-review`, { method: 'POST', body: { useCase: form.get('useCase'), website: website || undefined } }), false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card
      icon={ShieldCheck}
      title="Get approved to go live"
      description="New organizations need approval before sending live messages or verifications. Tell us a little about what you send and we'll review it, usually within a day."
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">What will you send, and to whom?</span>
          <textarea
            name="useCase"
            required
            maxLength={1000}
            rows={3}
            placeholder="e.g. Order and delivery updates to customers of our online pharmacy, about 300 a day."
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </label>
        <Input name="website" type="url" label="Website or app (optional)" placeholder="https://example.com" />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={sending}>
          Request review
        </Button>
      </form>
    </Card>
  );
}
