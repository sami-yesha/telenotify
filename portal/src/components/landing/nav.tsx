'use client';

import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Logo } from '@/components/logo';
import { cn } from '@/components/ui';
import { fetcher } from '@/lib/api';
import type { Me } from '@/lib/types';

const links = [
  { href: '#verify', label: 'Verify phones' },
  { href: '#savings', label: 'Savings' },
  { href: '#developers', label: 'Developers' },
  { href: '#sdk', label: 'SDK' },
  { href: '#open-source', label: 'Open source' },
  { href: '#faq', label: 'FAQ' },
];

export function LandingNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // The hero has its own masthead; this bar only slides in once you scroll past it.
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > window.innerHeight * 0.85));
  const { data: me } = useSWR<Me>('/auth/me', fetcher, { shouldRetryOnError: false, revalidateOnFocus: false });

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b border-line bg-page/80 backdrop-blur-xl transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        scrolled || open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
      )}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-5">
        <Link href="/" aria-label="Telenotify home">
          <Logo product="Telenotify" />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="px-3 py-1.5 text-sm tracking-[-0.02em] text-muted transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {me ? (
            <PrimaryLink href="/dashboard">Open dashboard</PrimaryLink>
          ) : (
            <>
              <Link href="/login" className="px-3 py-2 text-sm text-muted transition-colors hover:text-ink">
                Sign in
              </Link>
              <PrimaryLink href="/signup">Start free</PrimaryLink>
            </>
          )}
        </div>
        <button className="ml-auto rounded-lg p-2 text-ink md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-line bg-page/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {links.map((link) => (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-ink hover:bg-subtle">
                  {link.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href={me ? '/dashboard' : '/login'} className="rounded-[4px] border border-line px-4 py-2 text-center text-sm font-medium text-ink">
                  {me ? 'Dashboard' : 'Sign in'}
                </Link>
                <PrimaryLink href="/signup">Start free</PrimaryLink>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// The landing's one button: flat white, square-ish corners, a soft blue ring on hover.
export function PrimaryLink({ href, children, size = 'md' }: { href: string; children: React.ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-[4.5px] bg-white font-medium tracking-[-0.02em] text-[#0a0a0a] transition-[background-color,box-shadow] duration-200 hover:bg-[#e8eef7] hover:shadow-[0_0_0_4px_rgba(120,200,255,0.12)]',
        size === 'lg' ? 'h-11 px-6 text-[15px]' : 'h-9 px-4 text-sm',
      )}
    >
      {children}
    </Link>
  );
}
