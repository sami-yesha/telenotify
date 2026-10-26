'use client';

import { FormEvent, useState } from 'react';
import { Alert, Button, Input, TextLink } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setLoading(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Reset your password</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">We&apos;ll email you a link to set a new one.</p>
      {sent ? (
        <Alert tone="green">If an account exists for that email, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" loading={loading} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        <TextLink href="/login">Back to sign in</TextLink>
      </p>
    </>
  );
}
