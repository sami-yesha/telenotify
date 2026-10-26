'use client';

import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Verification } from '@/lib/types';
import { Alert, Badge, Button, Card, Input } from './ui';

const statusLabel: Record<Verification['status'], string> = {
  PENDING: 'Waiting for the link to be opened',
  AWAITING_CONTACT: 'Opened. Waiting for “Share my phone number”',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

// Sandbox playground card for "Verify with Telegram".
export function VerifyCard({ basePath }: { basePath: string }) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const open = verification && ['PENDING', 'AWAITING_CONTACT'].includes(verification.status);

  useEffect(() => {
    if (!verification || !open) return;
    const timer = setTimeout(async () => setVerification(await api<Verification>(`${basePath}/verifications/${verification.id}`)), 2000);
    return () => clearTimeout(timer);
  }, [verification, open, basePath]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      setVerification(
        await api<Verification>(`${basePath}/playground/verify`, {
          method: 'POST',
          body: { phone: String(form.get('phone') ?? ''), externalId: String(form.get('externalId') ?? '') },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card icon={ShieldCheck} title="3. Verify a phone number, no SMS" description="Replace SMS OTP: the person shares their number with the bot, and Telegram vouches it’s theirs.">
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={create} className="space-y-4">
          <Input name="phone" label="Expected phone (optional)" placeholder="0911 22 33 44" hint="If set, verification fails unless the Telegram number matches." />
          <Input name="externalId" label="Customer id (optional)" placeholder="customer_123" hint="If set, the person is also linked for notifications once verified." />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading}>
            Create verification link
          </Button>
        </form>

        <div className="rounded-xl border border-dashed border-line p-5">
          {!verification ? (
            <p className="text-sm text-muted">Create a link, open it on your phone and tap “Share my phone number”. The result appears here live.</p>
          ) : (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center gap-2.5">
                {verification.status === 'VERIFIED' ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : verification.status === 'FAILED' || verification.status === 'EXPIRED' ? (
                  <XCircle className="size-5 text-red-500" />
                ) : (
                  <Loader2 className="size-5 animate-spin text-brand" />
                )}
                <span className="text-sm font-medium text-ink">{statusLabel[verification.status]}</span>
                {verification.reason && <Badge tone="red">{verification.reason}</Badge>}
              </div>
              {verification.url && (
                <a
                  href={verification.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-shadow hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]"
                >
                  Verify with Telegram
                </a>
              )}
              {verification.phone && (
                <p className="text-sm text-muted">
                  Telegram number: <span className="font-mono text-ink">+{verification.phone}</span>
                </p>
              )}
              <p className="font-mono text-xs text-muted">id {verification.id}</p>
            </motion.div>
          )}
        </div>
      </div>
    </Card>
  );
}
