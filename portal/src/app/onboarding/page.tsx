'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { SplashScreen } from '@/components/splash';
import { Logo } from '@/components/logo';
import { Alert, Button, Input, Secret } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useRequireUser } from '@/lib/hooks';
import type { ApiKey } from '@/lib/types';

export default function OnboardingPage() {
  const { user } = useRequireUser();
  const [created, setCreated] = useState<{ org: { id: string; name: string }; sandboxKey: ApiKey } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setCreated(await api('/portal/orgs', { method: 'POST', body: { name: new FormData(event.currentTarget).get('name') } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <SplashScreen messages={['Getting things ready…']} />;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="relative mb-8">
        <Logo />
      </div>
      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-7 shadow-lift">
        {!created ? (
          <>
            <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Create your organization</h1>
            <p className="mb-5 mt-1 text-sm text-muted">
              Hi {user.name.split(' ')[0]}. You&apos;ll get a sandbox right away to try everything before going live.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <Alert>{error}</Alert>}
              <Input label="Organization name" name="name" placeholder="e.g. Abebe Pharmacy" required maxLength={120} hint="Customers see this name in the sandbox and when they connect." />
              <Button type="submit" loading={loading} className="w-full">
                Create organization
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Your sandbox is ready 🎉</h1>
            <p className="mb-4 mt-1 text-sm text-muted">This is your sandbox API key. Copy it now; we only show it once.</p>
            <Secret value={created.sandboxKey.key!} />
            <div className="mt-4">
              <Alert tone="blue">Sandbox keys start with <code className="font-mono">tn_test_</code>. Nothing you do in the sandbox reaches real customers.</Alert>
            </div>
            <Link
              href={`/o/${created.org.id}/sandbox`}
              className="mt-6 flex w-full items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-page shadow-soft transition-shadow hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]"
            >
              Continue to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
