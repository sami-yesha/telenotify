'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { GoogleButton } from '@/components/google-button';
import { Alert, Button, Input, TextLink } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { PasswordInput } from '@/components/password-input';
import { rememberNext, safeNext, takeNext } from '@/lib/next-path';

const errors: Record<string, string> = {
  google_failed: 'Google sign-in failed. Please try again.',
  google_not_configured: 'Google sign-in is not set up on this server.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(errors[params.get('error') ?? ''] ?? null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get('next'));
  const forAdmin = next?.startsWith('/admin') ?? false;

  // Google sign-in comes back to /dashboard, which continues to this page.
  useEffect(() => rememberNext(next), [next]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
      takeNext(); // used directly here, so don't also follow it from /dashboard later
      router.replace(next ?? '/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">{forAdmin ? 'Admin sign-in' : 'Sign in'}</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">{forAdmin ? 'Operators only. Use the email listed in OPERATOR_EMAILS.' : 'Welcome back.'}</p>
      <GoogleButton label="Continue with Google" />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <PasswordInput label="Password" name="password" autoComplete="current-password" required />
        <div className="text-right text-sm">
          <TextLink href="/forgot-password">Forgot password?</TextLink>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        New here? <TextLink href="/signup">Create an account</TextLink>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
