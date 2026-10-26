'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Thin progress bar at the top of the window while a page is opening.
// The App Router has no navigation events, so it starts on clicks on internal
// links (or startRouteProgress() before router.push) and finishes when the URL
// actually changes.

const START_EVENT = 'tn:route-progress:start';

export function startRouteProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [progress, setProgress] = useState<number | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval>>(undefined);
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const running = useRef(false);

  const done = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearInterval(trickle.current);
    clearTimeout(safety.current);
    setProgress(100);
    hide.current = setTimeout(() => setProgress(null), 350);
  }, []);

  const start = useCallback(() => {
    clearTimeout(hide.current);
    clearInterval(trickle.current);
    clearTimeout(safety.current);
    running.current = true;
    setProgress(12);
    // Move quickly at first, then ever slower towards 90%.
    trickle.current = setInterval(() => setProgress((p) => (p === null ? p : p + (90 - p) * 0.12)), 200);
    safety.current = setTimeout(done, 30_000);
  }, [done]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page (or just a #hash): nothing will load.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START_EVENT, start);
    };
  }, [start]);

  // The new page has rendered.
  useEffect(done, [pathname, search, done]);

  if (progress === null) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]" aria-hidden>
      <div
        className="relative h-full bg-brand shadow-[0_0_10px_rgb(42_171_238_/_0.7)] transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      >
        <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_4px_rgb(244_114_182_/_0.8)]" />
      </div>
    </div>
  );
}

/** useRouter() whose push() also starts the progress bar. */
export function useProgressRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        if (href !== location.pathname + location.search) startRouteProgress();
        router.push(href, options);
      },
    }),
    [router],
  );
}
