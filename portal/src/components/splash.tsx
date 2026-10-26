'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

const DEFAULT_MESSAGES = ['Signing you in…', 'Loading your workspace…', 'Warming up your bots…', 'Almost there…'];

// Full-screen loading state: the logo assembles itself, the notification dot
// pings, and a status line cycles under it. Used after login and while a
// workspace loads.
export function SplashScreen({ messages = DEFAULT_MESSAGES }: { messages?: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), 1600);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[#01061a] text-white [--ink:#fff] [--muted:rgb(214_232_255/0.7)] [--subtle:rgb(255_255_255/0.08)]" role="status" aria-live="polite">
      {/* Telegram-blue horizon rising under the mark. */}
      <div className="pointer-events-none absolute inset-x-[-30%] top-[62%] h-[200%] rounded-[50%] bg-[#030b20] shadow-[0_-1px_0_rgba(200,238,255,0.8),0_-3px_14px_rgba(42,171,238,0.8),0_-24px_100px_rgba(42,171,238,0.35)]" />
      <div className="relative flex flex-col items-center">
        <AnimatedMark />

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="mt-7 font-display text-[1.75rem] font-normal tracking-[-0.03em] text-ink"
        >
          Telenotify
        </motion.p>

        <div className="mt-2 h-5 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-muted"
            >
              {messages[index]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Indeterminate progress line. */}
        <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-subtle ring-1 ring-inset ring-line/60">
          <motion.div
            className="h-full w-1/3 rounded-full bg-brand"
            animate={{ x: ['-110%', '320%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
          />
        </div>
      </div>
    </div>
  );
}

const BUBBLE =
  'M11.5 8.5H20.5A5 5 0 0 1 25.5 13.5V17A5 5 0 0 1 20.5 22H14.9L10.6 25.1C10 25.55 9.2 25 9.4 24.3L10.1 21.6A5 5 0 0 1 6.5 17V13.5A5 5 0 0 1 11.5 8.5Z';

function AnimatedMark() {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="relative"
    >
      {/* Ripples from the notification dot. */}
      {[0, 0.9].map((delay) => (
        <motion.span
          key={delay}
          className="absolute left-[59px] top-[9.5px] size-8 rounded-full border-2 border-pink-400/60"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 2.4], opacity: [0.8, 0] }}
          transition={{ delay: 0.9 + delay, duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
      <motion.svg
        viewBox="0 0 32 32"
        className="size-24 drop-shadow-[0_18px_40px_rgb(14_165_233_/_0.35)]"
        animate={{ y: [0, -6, 0] }}
        transition={{ delay: 1, duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <defs>
          <linearGradient id="tn-splash-gradient" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#tn-splash-gradient)" />
        {/* The bubble outline draws itself, then fills in. */}
        <motion.path
          d={BUBBLE}
          fill="#fff"
          stroke="#fff"
          strokeWidth="0.6"
          initial={{ pathLength: 0, fillOpacity: 0 }}
          animate={{ pathLength: 1, fillOpacity: 1 }}
          transition={{ pathLength: { delay: 0.15, duration: 0.6, ease: 'easeInOut' }, fillOpacity: { delay: 0.6, duration: 0.25 } }}
        />
        <motion.rect
          x="11"
          y="11.6"
          width="10"
          height="2.6"
          rx="1.3"
          fill="url(#tn-splash-gradient)"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ originX: '50%', transformBox: 'fill-box' }}
          transition={{ delay: 0.75, duration: 0.3, ease: 'easeOut' }}
        />
        <motion.rect
          x="14.7"
          y="11.6"
          width="2.6"
          height="7.6"
          rx="1.3"
          fill="url(#tn-splash-gradient)"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          style={{ originY: '0%', transformBox: 'fill-box' }}
          transition={{ delay: 0.9, duration: 0.3, ease: 'easeOut' }}
        />
        <motion.circle
          cx="25"
          cy="8.5"
          r="3.6"
          fill="#f472b6"
          stroke="url(#tn-splash-gradient)"
          strokeWidth="2"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.35, 1] }}
          style={{ transformBox: 'fill-box', originX: '50%', originY: '50%' }}
          transition={{ delay: 1.05, duration: 0.45 }}
        />
      </motion.svg>
    </motion.div>
  );
}
