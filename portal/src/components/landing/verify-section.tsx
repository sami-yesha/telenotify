'use client';

import { BadgeCheck, Check, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Reveal } from './reveal';

const sms = ['Pay for every code you send', 'Pay again for every “Resend code”', 'Codes delayed or never arrive', 'Customers mistype the 6 digits'];
const telegram = ['No SMS, no code to type', 'One tap: “Share my phone number”', 'Telegram confirms the number is theirs', 'They’re linked for future notifications'];

// 0 prompt → 1 tapping → 2 contact shared → 3 verified → loop
function useVerifyScript() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setStep((step + 1) % 4), [2200, 700, 1300, 3000][step]);
    return () => clearTimeout(timer);
  }, [step]);
  return step;
}

export function VerifySection() {
  const step = useVerifyScript();
  return (
    <section id="verify" className="relative scroll-mt-20 overflow-hidden border-y border-line bg-[#020920] py-24 sm:py-32">
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <Reveal>
            <p className="text-[13px] font-medium tracking-[-0.005em] text-brand">Phone verification</p>
            <h2 className="mt-3 font-display text-[2.1rem] text-ink sm:text-[3.25rem]">
              Verify phone numbers <span className="text-gradient">without sending a single SMS.</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Every signup OTP costs you an SMS, and every “resend code” costs another. With Telenotify, the customer taps <b className="text-ink">Verify with Telegram</b>, shares their number with your bot, and Telegram vouches it’s really theirs.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Reveal delay={0.1} className="rounded-2xl border border-line bg-page p-5">
              <p className="text-sm font-semibold text-muted">SMS one-time codes</p>
              <ul className="mt-3 space-y-2.5 text-sm text-muted">
                {sms.map((item) => (
                  <li key={item} className="flex gap-2">
                    <X className="mt-0.5 size-4 shrink-0 text-red-500" /> {item}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.2} className="rounded-2xl border border-brand/30 bg-surface p-5 shadow-soft ring-1 ring-brand/10">
              <p className="text-sm font-semibold text-ink">Verify with Telegram</p>
              <ul className="mt-3 space-y-2.5 text-sm text-ink">
                {telegram.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.15} className="relative mx-auto w-full max-w-sm">
          <div className="rounded-[2.4rem] border border-white/10 bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 shadow-lift">
            <div className="overflow-hidden rounded-[2rem] bg-[#0e1621]">
              <div className="flex items-center gap-3 bg-[#17212b] px-4 pb-3 pt-6">
                <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-bold text-white">AP</div>
                <p className="flex items-center gap-1 text-sm font-semibold text-white">
                  Abebe Pharmacy <BadgeCheck className="size-3.5 text-sky-400" />
                </p>
              </div>
              <div className="flex h-[330px] flex-col justify-end gap-2 px-3 pb-3">
                <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-[#182533] px-3 py-2 text-[13px] leading-snug text-white">
                  Abebe Pharmacy wants to confirm your phone number. Tap “Share my phone number” below.
                </div>
                <AnimatePresence>
                  {step >= 2 && (
                    <motion.div
                      key="contact"
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2.5 self-end rounded-2xl rounded-br-md bg-[#2b5278] px-3 py-2"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-sky-400/30 text-white">
                        <Smartphone className="size-4" />
                      </span>
                      <span className="text-[13px] text-white">
                        You
                        <span className="block font-mono text-xs text-white/70">+251 9•• ••• 344</span>
                      </span>
                    </motion.div>
                  )}
                  {step >= 3 && (
                    <motion.div
                      key="ok"
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-[#182533] px-3 py-2 text-[13px] text-white"
                    >
                      ✅ Your phone number is verified.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="border-t border-white/5 bg-[#17212b] p-2">
                <motion.div
                  animate={step === 1 ? { scale: 0.96, backgroundColor: 'rgba(56,189,248,0.35)' } : { scale: 1, backgroundColor: 'rgba(56,189,248,0.15)' }}
                  className={cn('flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-sky-200', step >= 2 && 'opacity-40')}
                >
                  <Smartphone className="size-4" /> Share my phone number
                </motion.div>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {step >= 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="absolute -bottom-6 -left-4 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur sm:-left-12"
              >
                <p className="font-mono text-[11px] text-muted">webhook → your server</p>
                <p className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">verification.completed</p>
                <p className="font-mono text-[11px] text-ink">phone: 251911223344</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Reveal>
      </div>
    </section>
  );
}
