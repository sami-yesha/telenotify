'use client';

import { FlaskConical, KeyRound, Search, ToggleLeft, Webhook } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './ui';

const steps = [
  { icon: ToggleLeft, title: 'Sandbox first, live when ready', body: 'The switch at the top flips between Sandbox (test data, shared bot) and Live (your own bot, real customers). Same API, different keys.' },
  { icon: FlaskConical, title: 'Try it without code', body: 'The Playground connects your own Telegram to the sandbox bot, sends test messages and verifies a phone number. All in a minute.' },
  { icon: KeyRound, title: 'Integrate with one key', body: 'Create a key under API keys and follow Docs. Every message comes back as sent, or undeliverable with a reason, so your SMS fallback runs only when needed.' },
  { icon: Webhook, title: 'See everything that happened', body: 'Messages, Customers and the Webhooks delivery log show each message’s timeline, every webhook attempt, and let you resend events.' },
  { icon: Search, title: 'Jump anywhere with ⌘K', body: 'Press ⌘K (Ctrl+K on Windows) to search pages, customers by id, or open a message by its id.' },
];

// Shown once per user on their first visit to an organization's dashboard.
export function WelcomeTour({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      // Storage unavailable: skip the tour.
    }
  }, [storageKey]);

  function close() {
    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {}
    setOpen(false);
  }

  const current = steps[step];
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#01061a]/60 backdrop-blur-sm" onClick={close} />
          <motion.div
            role="dialog"
            aria-label="Welcome tour"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-lift"
          >
            <div className="relative h-32 overflow-hidden bg-brand">
              <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
              <AnimatePresence mode="wait">
                <motion.span
                  key={step}
                  initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-white/20 text-white backdrop-blur"
                >
                  <current.icon className="size-8" />
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                Quick tour · {step + 1} of {steps.length}
              </p>
              <h2 className="mt-1 font-display text-xl font-medium text-ink">{current.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {steps.map((_, i) => (
                    <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-5 bg-brand' : 'w-1.5 bg-line')} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={close}>
                    Skip
                  </Button>
                  <Button onClick={() => (step === steps.length - 1 ? close() : setStep(step + 1))}>{step === steps.length - 1 ? 'Get started' : 'Next'}</Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
