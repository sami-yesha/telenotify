'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { GoogleButton } from '@/components/google-button';
import { Alert, Button, Input, TextLink } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { isStrongPassword } from '@/lib/password';

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!isStrongPassword(String(form.get('password') ?? ''))) return setError('Choose a stronger password: it needs every item in the checklist.');
    if (form.get('password') !== form.get('confirm')) return setError('The two passwords don’t match.');
    setLoading(true);
    setError(null);
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: { name: form.get('name'), email: form.get('email'), password: form.get('password') },
      });
      router.replace('/check-email');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Create your account</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">Start in the sandbox. No bot or credit card needed.</p>
      <GoogleButton label="Sign up with Google" />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input label="Full name" name="name" autoComplete="name" required />
        <Input label="Work email" name="email" type="email" autoComplete="email" required />
        <PasswordInput label="Password" name="password" autoComplete="new-password" minLength={8} required showStrength onChange={(e) => setPassword(e.target.value)} />
        <PasswordInput label="Confirm password" name="confirm" autoComplete="new-password" minLength={8} required matchWith={password} />
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
        <p className="text-center text-xs text-muted">
          By creating an account you agree to the <TextLink href="/terms">Terms</TextLink> and <TextLink href="/privacy">Privacy Policy</TextLink>.
        </p>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account? <TextLink href="/login">Sign in</TextLink>
      </p>
    </>
  );
}
