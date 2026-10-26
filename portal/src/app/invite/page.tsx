'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Logo } from '@/components/logo';
import { Alert, Button, Spinner } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { forgetInvite, rememberInvite } from '@/lib/invite';
import type { InvitationPreview, Me } from '@/lib/types';

function Invite() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { data: invite, error: inviteError } = useSWR<InvitationPreview>(token ? `/auth/invitations/${token}` : null, fetcher, { shouldRetryOnError: false });
  const { data: me, error: meError } = useSWR<Me>('/auth/me', fetcher, { shouldRetryOnError: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const signedOut = meError instanceof ApiError && meError.status === 401;

  const wrongAccount = Boolean(me && invite && me.email !== invite.email);

  // Remember the invitation so it survives sign-in, sign-up and email verification,
  // but only while signed out: otherwise it would keep coming back after every login.
  useEffect(() => {
    if (token && signedOut) rememberInvite(token);
  }, [token, signedOut]);

  // A dead link, or one for another account, shouldn't come back on its own.
  useEffect(() => {
    if (inviteError || wrongAccount) forgetInvite();
  }, [inviteError, wrongAccount]);

  async function switchAccount() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    rememberInvite(token);
    router.replace('/login');
  }

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      const { orgId } = await api<{ orgId: string }>('/portal/invitations/accept', { method: 'POST', body: { token } });
      forgetInvite();
      router.replace(`/o/${orgId}/sandbox`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  let body: React.ReactNode;
  if (!token || inviteError) {
    body = <Alert>{inviteError instanceof ApiError ? inviteError.message : 'This invitation link is incomplete.'}</Alert>;
  } else if (!invite || (!me && !signedOut)) {
    body = <Spinner />;
  } else {
    body = (
      <>
        <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Join {invite.orgName}</h1>
        <p className="mt-2 text-sm text-muted">
          {invite.invitedBy ?? 'A teammate'} invited <span className="font-medium text-ink">{invite.email}</span> to join as {invite.role === 'OWNER' ? 'an owner' : 'a member'}.
        </p>
        <div className="mt-6 space-y-3">
          {error && <Alert>{error}</Alert>}
          {signedOut ? (
            <>
              <Link href="/signup" className="flex w-full items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-page">
                Create an account with {invite.email}
              </Link>
              <Link href="/login" className="flex w-full items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink">
                I already have an account
              </Link>
              <p className="text-xs text-muted">You&apos;ll come back here automatically after signing in.</p>
            </>
          ) : me && !me.emailVerified ? (
            <Alert tone="amber">Verify your email first, then reopen this link.</Alert>
          ) : me && wrongAccount ? (
            <>
              <Alert tone="amber">
                This invitation is for {invite.email}, but you&apos;re signed in as {me.email}.
              </Alert>
              <Button onClick={switchAccount} className="w-full">
                Sign in as {invite.email}
              </Button>
              <Link href="/dashboard" className="flex w-full items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink">
                Continue as {me.email}
              </Link>
            </>
          ) : (
            <Button onClick={accept} loading={loading} className="w-full">
              Accept invitation
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-7 shadow-lift">{body}</div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <Invite />
    </Suspense>
  );
}
