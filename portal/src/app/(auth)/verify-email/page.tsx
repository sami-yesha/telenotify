'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Spinner, TextLink } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function Verify() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) return setError('This link is missing its token.');
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => router.replace('/dashboard'))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Something went wrong'));
  }, [token, router]);

  if (!error) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner /> Verifying your email…
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-4 font-display text-[2rem] font-normal leading-[1.05] text-ink">Couldn&apos;t verify email</h1>
      <Alert>{error}</Alert>
      <p className="mt-4 text-sm text-muted">
        <TextLink href="/check-email">Send a new link</TextLink>
      </p>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
