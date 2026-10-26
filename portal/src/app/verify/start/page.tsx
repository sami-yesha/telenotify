'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { Card, VerifyShell } from '../verify-shell';

// Opened by the embeddable button (verify.js) in a popup, or linked to directly:
// /verify/start?key=tn_pk_…&origin=https://shop.example  (popup)
// /verify/start?key=tn_pk_…&return_url=https://shop.example/done  (redirect)
function Start() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const key = params.get('key');
    if (!key) return setError('This verification link is missing its key.');
    api<{ id: string }>('/v1/public/verifications', {
      method: 'POST',
      body: {
        publishableKey: key,
        origin: params.get('origin') ?? undefined,
        returnUrl: params.get('return_url') ?? undefined,
        phone: params.get('phone') ?? undefined,
      },
    })
      .then(({ id }) => router.replace(`/verify/${id}`))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not start the verification. Please try again.'));
  }, [params, router]);

  return (
    <VerifyShell>
      <Card>
        {error ? (
          <div className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle className="size-6" />
            </span>
            <h1 className="mt-4 font-display text-xl font-medium text-ink">Can&apos;t start verification</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <Spinner />
            <p className="mt-4 text-sm text-muted">Preparing your secure verification…</p>
          </div>
        )}
      </Card>
    </VerifyShell>
  );
}

export default function VerifyStartPage() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
