'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, Button, TextLink } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { isStrongPassword } from '@/lib/password';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!isStrongPassword(String(form.get('password') ?? ''))) return setError('Choose a stronger password: it needs every item in the checklist.');
    if (form.get('password') !== form.get('confirm')) return setError('Passwords do not match');
    setLoading(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: form.get('password') } });
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-5 font-display text-[2rem] font-normal leading-[1.05] text-ink">Choose a new password</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <PasswordInput label="New password" name="password" autoComplete="new-password" minLength={8} required showStrength onChange={(e) => setPassword(e.target.value)} />
        <PasswordInput label="Confirm password" name="confirm" autoComplete="new-password" minLength={8} required matchWith={password} />
        <Button type="submit" loading={loading} className="w-full">
          Update password
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        <TextLink href="/forgot-password">Request a new link</TextLink>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
