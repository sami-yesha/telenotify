'use client';

import { ReactNode } from 'react';
import { LogoMark } from '@/components/logo';

// Frame shared by the hosted verify pages: a centered card on a calm background,
// "Secured by Telenotify" underneath. These pages are shown to our customers' users.
export function VerifyShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-page px-4 py-10">
      <main className="relative w-full max-w-md">{children}</main>
      <p className="relative mt-6 flex items-center gap-2 text-xs text-muted">
        <LogoMark className="size-4" /> Secured by <a href="/" className="font-medium text-ink hover:underline">Telenotify</a>
      </p>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface p-7 shadow-lift sm:p-8">{children}</div>;
}
