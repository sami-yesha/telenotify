'use client';

import { Check, Copy, Lock, MousePointerClick, ServerOff, ShieldCheck, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { highlight } from '@/lib/highlight';
import { SITE_URL } from '@/lib/site';
import { Reveal, SectionHeading } from './reveal';

const SNIPPET = `<script src="${SITE_URL}/verify.js"
        defer></script>

<telenotify-verify key="tn_pk_live_…"></telenotify-verify>`;

const POINTS = [
  { icon: ServerOff, title: 'No backend to start it', body: 'The button opens a secure, hosted verify page. Nothing to build on your server.' },
  { icon: ShieldCheck, title: 'A signed result', body: 'You get the phone number and a token signed with your secret. Check it in one line.' },
  { icon: Lock, title: 'Locked to your website', body: 'Live keys only work on the websites you allow, so nobody can reuse yours.' },
];

// 0 idle → 1 waiting for Telegram → 2 verified → loop
function useButtonScript() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => (s + 1) % 3), [2000, 2600, 3200][step]);
    return () => clearTimeout(timer);
  }, [step]);
  return step;
}

export function OneLineVerify() {
  const step = useButtonScript();
  const [copied, setCopied] = useState(false);

  return (
    <section id="verify-widget" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="New · Verify widget"
          title={
            <>
              Phone verification on your site, <span className="text-gradient">in one line.</span>
            </>
          }
          body="Drop in our button and your users verify their number with Telegram in two taps. No OTP form to build, no SMS to pay for, no endpoint to write."
        />

        <div className="mt-14 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* The code */}
          <Reveal className="overflow-hidden rounded-3xl border border-white/10 bg-[#030a1c] shadow-lift">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-red-400/70" />
                <span className="size-2.5 rounded-full bg-amber-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400/70" />
              </span>
              <span className="ml-2 font-mono text-xs text-slate-400">signup.html</span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(SNIPPET);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Copy code"
              >
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              </button>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-slate-200">
              <code>{highlight(SNIPPET, 'javascript')}</code>
            </pre>
            <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-xs text-slate-400">
              <Sparkles className="size-3.5 text-amber-300" /> That&apos;s it. Listen for the <code className="font-mono text-sky-300">verified</code> event to get the number.
            </div>
          </Reveal>

          {/* A website using it */}
          <Reveal delay={0.1} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
            <div className="flex items-center gap-2 border-b border-line bg-subtle/60 px-4 py-3">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1 text-xs text-muted ring-1 ring-line">
                <Lock className="size-3" /> yourshop.et/signup
              </span>
            </div>
            <div className="p-7">
              <p className="font-display text-xl font-medium text-ink">Create your account</p>
              <p className="mt-1 text-sm text-muted">Confirm your phone number to continue.</p>
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm text-muted">Hana Tesfaye</div>
                <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm text-muted">hana@example.com</div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <motion.div
                  animate={{ scale: step === 1 ? 0.98 : 1 }}
                  className={cn(
                    'inline-flex min-w-60 items-center justify-center gap-2.5 rounded-[14px] px-5 py-3 text-[15px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(42,171,238,.6)] transition-colors duration-300',
                    step === 2 ? 'bg-emerald-500' : 'bg-[#2aabee]',
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-2.5">
                      {step === 0 && (
                        <>
                          <ShieldCheck className="size-5" /> Verify with Telegram
                        </>
                      )}
                      {step === 1 && (
                        <>
                          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Waiting for Telegram…
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <Check className="size-5" strokeWidth={3} /> Phone verified
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>
                <AnimatePresence>
                  {step === 0 && (
                    <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-muted">
                      <MousePointerClick className="size-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {step === 2 && (
                  <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    verified → {'{'} phone: &quot;2519••••••44&quot;, token: &quot;eyJp…&quot; {'}'}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {POINTS.map((point, i) => (
            <Reveal key={point.title} delay={0.08 * i} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/15">
                <point.icon className="size-5" />
              </span>
              <p className="mt-3 font-semibold text-ink">{point.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{point.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-10 flex justify-center">
          <Link href="/signup" className="rounded-[4.5px] bg-ink px-6 py-3 text-[15px] font-semibold text-page shadow-soft transition-colors hover:bg-[#e8eef7]">
            Get your widget key, free
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
