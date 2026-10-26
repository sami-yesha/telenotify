'use client';

import { ArrowRight, Minus, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { PrimaryLink } from './nav';
import { Reveal, SectionHeading } from './reveal';
import { GITHUB_URL } from '@/lib/site';

const faqs = [
  {
    q: 'Do my customers need to install anything?',
    a: 'Only Telegram, which most already use. They tap your link, press Start once, and they’re connected. No app, no account, no forms.',
  },
  {
    q: 'Can I replace SMS one-time codes (OTP)?',
    a: 'Yes. Create a verification, show the “Verify with Telegram” link, and the customer shares their number with your bot in one tap. Telegram confirms the number belongs to that account. No code to send, no resends to pay for. Keep SMS OTP only for people without Telegram.',
  },
  {
    q: 'What happens if a customer isn’t on Telegram?',
    a: 'The API returns UNDELIVERABLE with reason not_linked immediately. Your system sends that message through your existing SMS or email provider. We tell you exactly when it’s needed.',
  },
  {
    q: 'Will messages show my business name?',
    a: 'Yes. In live mode you connect your own @BotFather bot, so customers see your name, logo and description. Only the sandbox uses our shared test bot.',
  },
  {
    q: 'Can I try it without affecting real customers?',
    a: 'Every organization gets a sandbox with its own keys and data, a shared test bot, and built-in test customers that simulate every outcome. Nothing in the sandbox reaches real customers.',
  },
  {
    q: 'How do I know a webhook really came from Telenotify?',
    a: 'Every event carries an HMAC-SHA256 signature over the timestamp and body using your signing secret, plus a stable event id so retries can be de-duplicated.',
  },
  {
    q: 'How fast can I add phone verification to my website?',
    a: 'Minutes. Add our script and the <telenotify-verify> button with your publishable key. Your users tap it, confirm in Telegram, and your page gets the verified number plus a signed token you check on your server. No OTP form and no backend endpoint to start the flow.',
  },
  {
    q: 'Is Telenotify really free?',
    a: 'Yes. The hosted service is free with a fair-use limit of 10,000 live messages and verifications a month per organization (ask us if you need more), and the code is open source under AGPL-3.0, so you can also run it yourself with no limit.',
  },
  {
    q: 'Can I run Telenotify on my own server?',
    a: 'Yes. Clone the repository and start it with Docker Compose: the API, portal, Postgres and Redis. Your data, your bot tokens and your limits stay with you.',
  },
  {
    q: 'Is sending on Telegram really free?',
    a: 'Telegram doesn’t charge bots to send messages. That’s what makes it a much cheaper first channel than SMS for customers who use Telegram.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-12 divide-y divide-line border-y border-line">
          {faqs.map((faq, i) => (
            <div key={faq.q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-1 py-5 text-left">
                <span className="text-[17px] tracking-[-0.015em] text-ink">{faq.q}</span>
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted">
                  {open === i ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <p className="px-1 pb-6 pr-12 leading-relaxed text-muted">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-5 py-24 sm:py-32">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[1.25rem] tg-sky px-6 py-16 text-center sm:px-16 sm:py-24">
        <div className="tg-doodles pointer-events-none absolute inset-0 opacity-[0.07]" />
        <h2 className="relative font-display text-[2.2rem] font-normal leading-[0.98] tracking-[-0.03em] text-white sm:text-[4rem]">
          Stop paying for OTPs.
          <br className="hidden sm:block" /> Start on Telegram today.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg text-sky-100/75">Create an account, grab your sandbox key and send yourself a message in minutes. Free and open source, no card required.</p>
        <div className="relative mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-[4.5px] bg-white px-6 py-3 text-[15px] font-medium text-[#0a0a0a] transition-[background-color,box-shadow] hover:bg-[#e8eef7] hover:shadow-[0_0_0_4px_rgba(120,200,255,0.12)]"
          >
            Start free 
          </Link>
          <Link href="/login" className="rounded-[4.5px] border border-white/20 px-6 py-3 text-[15px] font-medium text-white hover:bg-white/10">
            Sign in
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-[#000412]">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted">Phone verification and notifications on Telegram. No SMS bill.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#developers" className="hover:text-ink">Developers</a>
          <a href="#open-source" className="hover:text-ink">Open source</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
          <Link href="/login" className="hover:text-ink">Sign in</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        </div>
        <p className="text-sm text-muted">© {new Date().getFullYear()} Telenotify</p>
      </div>
    </footer>
  );
}

export { PrimaryLink };
