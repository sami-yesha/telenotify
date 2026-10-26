'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import type { Me } from '@/lib/types';

export default function CheckEmailPage() {
  const router = useRouter();
  const { data: me, error } = useSWR<Me>('/auth/me', fetcher, { shouldRetryOnError: false });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace('/login');
    if (me?.emailVerified) router.replace('/dashboard');
  }, [me, error, router]);

  async function resend() {
    setLoading(true);
    setFailure(null);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setSent(true);
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : 'Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Check your email</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a verification link to <span className="font-medium text-ink">{me?.email ?? 'your email'}</span>. Open it to continue.
      </p>
      {failure && (
        <div className="mt-4">
          <Alert>{failure}</Alert>
        </div>
      )}
      {sent && (
        <div className="mt-4">
          <Alert tone="green">A new link is on its way.</Alert>
        </div>
      )}
      <div className="mt-6 flex gap-2">
        <Button variant="secondary" onClick={resend} loading={loading}>
          Resend email
        </Button>
        <Button variant="ghost" onClick={logout}>
          Use another account
        </Button>
      </div>
    </>
  );
}
