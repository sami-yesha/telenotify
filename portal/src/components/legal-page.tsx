import Link from 'next/link';
import { ReactNode } from 'react';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';

// Company details come from env so the same pages work for any deployment.
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_ENTITY || 'Telenotify',
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || process.env.NEXT_PUBLIC_SALES_EMAIL || 'support@telenotify.example',
  updated: 'October 24, 2026',
};

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>

            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-4xl font-normal tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
        <p className="mt-6 text-lg leading-relaxed text-muted">{intro}</p>
        <div className="mt-10 space-y-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted">
          {children}
        </div>
        <p className="mt-14 border-t border-line pt-6 text-sm text-muted">
          Questions? Email <a className="font-medium text-brand" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </main>
    </div>
  );
}
