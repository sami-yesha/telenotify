'use client';

import { AlertTriangle, ArrowRight, Check, Clock, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Spinner } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Card, VerifyShell } from '../verify-shell';

interface HostedVerification {
  id: string;
  status: 'PENDING' | 'AWAITING_CONTACT' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  reason: string | null;
  url: string | null;
  expiresAt: string;
  environment: 'sandbox' | 'live';
  orgName: string;
  botUsername: string | null;
  returnUrl: string | null;
  origin: string | null;
  phone: string | null;
  token: string | null;
}

const FINAL = ['VERIFIED', 'FAILED', 'EXPIRED'];

// The page a person lands on to verify their phone: Telegram button (QR code on a
// computer), live status, then the signed result goes back to the site that sent them.
export default function HostedVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useSWR<HostedVerification>(`/v1/public/verifications/${id}`, fetcher, {
    refreshInterval: (latest) => (latest && FINAL.includes(latest.status) ? 0 : 2000),
    // The person is in the Telegram app while we wait, so this window is often in the
    // background: keep checking anyway, or the result would never reach the site.
    refreshWhenHidden: true,
    refreshWhenOffline: false,
  });
  const [handedBack, setHandedBack] = useState<'popup' | 'redirect' | null>(null);
  const delivered = useRef(false);

  // Hand the result back exactly once: to the opener window (popup) or by redirect.
  useEffect(() => {
    if (!data || delivered.current || (data.status !== 'VERIFIED' && data.status !== 'FAILED')) return;
    delivered.current = true;
    const message = { type: 'telenotify:verification', id: data.id, status: data.status, phone: data.phone, reason: data.reason, token: data.token };
    if (window.opener && data.origin) {
      // Only the allowed website that opened this popup can receive it.
      window.opener.postMessage(message, data.origin);
      setHandedBack('popup');
      if (data.status === 'VERIFIED') setTimeout(() => window.close(), 1600);
    } else if (data.returnUrl) {
      setHandedBack('redirect');
      const target = new URL(data.returnUrl);
      target.searchParams.set('telenotify_verification', data.id);
      if (data.token) target.searchParams.set('telenotify_token', data.token);
      setTimeout(() => window.location.assign(target.toString()), data.status === 'VERIFIED' ? 1600 : 3500);
    }
  }, [data]);

  if (error) {
    return (
      <VerifyShell>
        <Card>
          <Problem title="Verification not found">This link isn&apos;t valid. Go back to the site and start again.</Problem>
        </Card>
      </VerifyShell>
    );
  }
  if (!data) {
    return (
      <VerifyShell>
        <Card>
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        </Card>
      </VerifyShell>
    );
  }

  const site = data.origin ? new URL(data.origin).host : data.returnUrl ? new URL(data.returnUrl).host : null;
  return (
    <VerifyShell>
      <Card>
        <header className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#2b5278] font-display text-lg font-medium text-white">
            {data.orgName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{data.orgName}</p>
            <p className="text-xs text-muted">wants to confirm your phone number</p>
          </div>
          {data.environment === 'sandbox' && <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-inset ring-amber-400/30 dark:text-amber-300">Test mode</span>}
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={data.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="mt-7">
            {data.status === 'VERIFIED' ? (
              <Verified phone={data.phone} handedBack={handedBack} site={site} />
            ) : data.status === 'FAILED' ? (
              <Problem title="That number doesn't match">
                The phone number on this Telegram account isn&apos;t the one you entered at {data.orgName}. Go back and check the number.
              </Problem>
            ) : data.status === 'EXPIRED' ? (
              <Problem title="This link has expired" icon={Clock}>
                Go back to {site ?? data.orgName} and start the verification again.
              </Problem>
            ) : (
              <Waiting data={data} />
            )}
          </motion.div>
        </AnimatePresence>
      </Card>
    </VerifyShell>
  );
}

function Waiting({ data }: { data: HostedVerification }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (data.url) QRCode.toDataURL(data.url, { width: 440, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }).then(setQr);
  }, [data.url]);
  const opened = data.status === 'AWAITING_CONTACT';

  return (
    <div>
      <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink">Verify with Telegram</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">No code to type. Telegram shares only your phone number, nothing else.</p>

      <ol className="mt-6 space-y-3">
        <Step done={opened} active={!opened} n={1}>
          Open Telegram
        </Step>
        <Step done={false} active={opened} n={2}>
          Tap <b className="text-ink">“Share my phone number”</b>
        </Step>
      </ol>

      {data.url && (
        <>
          <a
            href={data.url}
            // Open Telegram separately so this page stays and can hand the result back.
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-5 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-shadow hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]"
          >
            <Smartphone className="size-5" /> {opened ? 'Back to Telegram' : 'Open Telegram'} <ArrowRight className="size-4" />
          </a>
          {/* On a computer, scan with the phone instead. */}
          <div className="mt-5 hidden items-center gap-4 rounded-xl border border-line bg-subtle/50 p-4 sm:flex">
            <div className="shrink-0 rounded-xl bg-white p-1.5">{qr ? <img src={qr} alt="QR code to open Telegram" className="size-28" /> : <div className="size-28 animate-pulse rounded-lg bg-slate-100" />}</div>
            <p className="text-sm text-muted">On a computer? Scan this with your phone&apos;s camera to open Telegram there.</p>
          </div>
        </>
      )}

      <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-brand" />
        </span>
        {opened ? 'Waiting for you to share your number in Telegram…' : 'Waiting for you to open Telegram…'}
      </p>
    </div>
  );
}

function Step({ n, done, active, children }: { n: number; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors', active ? 'border-brand/40 bg-brand/5 text-ink' : 'border-line text-muted')}>
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', done ? 'bg-emerald-500 text-white' : active ? 'bg-brand text-white' : 'bg-subtle text-muted')}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Verified({ phone, handedBack, site }: { phone: string | null; handedBack: 'popup' | 'redirect' | null; site: string | null }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        className="grid size-20 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_18px_40px_-10px_rgb(16_185_129_/_0.6)]"
      >
        <motion.svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.4 }} />
        </motion.svg>
      </motion.span>
      <h1 className="mt-5 font-display text-2xl font-medium text-ink">Phone number verified</h1>
      {phone && <p className="mt-1 font-mono text-sm text-muted">+{phone.replace(/^(\d{3})(\d{2})\d+(\d{2})$/, '$1 $2•• ••• •$3')}</p>}
      <p className="mt-4 text-sm text-muted">
        {handedBack === 'popup' ? 'All done. This window will close.' : handedBack === 'redirect' ? `Taking you back to ${site ?? 'the site'}…` : `You can go back to ${site ?? 'the site'} now.`}
      </p>
    </div>
  );
}

function Problem({ title, icon: Icon = AlertTriangle, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <span className="grid size-14 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
        <Icon className="size-7" />
      </span>
      <h1 className="mt-4 font-display text-xl font-medium text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
