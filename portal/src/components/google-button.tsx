'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';

// Hidden when the server has no Google credentials configured.
export function GoogleButton({ label }: { label: string }) {
  const { data } = useSWR<{ googleEnabled: boolean }>('/auth/config', fetcher);
  if (!data?.googleEnabled) return null;
  return (
    <>
      <a
        href="/api/auth/google"
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-soft transition-all hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)] hover:bg-subtle"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1Z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9l3.7-2.8Z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
        </svg>
        {label}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
