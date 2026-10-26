'use client';

import { Check, Gauge, KeyRound, ListChecks, MessageSquareText, Send, Server, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Reveal, SectionHeading } from './reveal';

const SETUP = [
  { title: 'Open an AfroMessage account', body: 'Sign up at AfroMessage, top up, and copy your API token. No code to write there.' },
  { title: 'Paste the token in Telenotify', body: 'We check it with AfroMessage on the spot and encrypt it. Set a daily SMS limit.' },
  { title: 'Keep calling our API', body: 'Same request as before. Customers Telegram can’t reach get an SMS automatically.' },
];

const POINTS = [
  { icon: Send, title: 'One integration: ours', body: 'You never call AfroMessage yourself. One API, one webhook, and every customer is covered.' },
  { icon: KeyRound, title: 'Your balance, no markup', body: 'SMS go through your own AfroMessage account. Telenotify adds no fee on top.' },
  { icon: Gauge, title: 'A daily limit you set', body: 'Cap how many SMS can ever be sent in 24 hours, so a mistake can’t drain your balance.' },
  { icon: ListChecks, title: 'Every SMS listed', body: 'Each one with AfroMessage’s message id, so you can match it against your AfroMessage log.' },
];

// 0 request → 1 Telegram can't reach them → 2 SMS sent → loop
function useFlowScript(active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % 3), [1600, 1800, 3200][step]);
    return () => clearTimeout(timer);
  }, [step, active]);
  return step;
}

export function SmsFallbackSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-120px' });
  const step = useFlowScript(inView);

  return (
    <section id="sms-fallback" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="SMS fallback"
          title={
            <>
              Not on Telegram? <span className="text-gradient">We send the SMS.</span>
            </>
          }
          body="One API call reaches every customer. If Telegram can't reach someone, we send the same message by SMS through your AfroMessage account. No second integration to build."
        />

        <div ref={ref} className="mt-14 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* The flow */}
          <Reveal className="rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-7">
            <FlowRow active icon={Server} tone="brand" title="Your server" detail={<code className="font-mono">POST /v1/messages</code>} />
            <Connector />
            <FlowRow
              active={step >= 1}
              icon={step >= 1 ? X : Send}
              tone={step >= 1 ? 'amber' : 'muted'}
              title="Telegram"
              detail={step >= 1 ? 'Can’t reach this customer: not on Telegram' : 'Trying Telegram first…'}
            />
            <Connector />
            <FlowRow
              active={step === 2}
              icon={step === 2 ? Check : MessageSquareText}
              tone={step === 2 ? 'green' : 'muted'}
              title="SMS through your AfroMessage"
              detail={step === 2 ? 'Delivered by SMS, automatically' : 'Waiting…'}
            />
            <AnimatePresence>
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-5 flex items-start gap-3 rounded-2xl bg-subtle/70 p-4 ring-1 ring-inset ring-line"
                >
                  <Smartphone className="mt-0.5 size-5 shrink-0 text-muted" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">Abebe Pharmacy</p>
                    <p className="text-muted">Your order #1042 is ready for pickup. Track: https://abebe.et/o/1042</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="mt-5 font-mono text-xs text-muted">webhook → message.fallback_sent</p>
          </Reveal>

          {/* Setup */}
          <Reveal delay={0.1}>
            <p className="text-sm font-semibold text-ink">Set up once, in the portal</p>
            <ol className="mt-5 space-y-5">
              {SETUP.map((item, i) => (
                <li key={item.title} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted">
              <b className="text-ink">Rather keep your token?</b> Turn on webhooks instead: we tell your server the moment Telegram can&apos;t reach someone, and you send the SMS yourself.
              <br />
              <b className="text-ink">Try it first:</b> in the sandbox, add your token and get a real SMS on your own phone.
            </p>
          </Reveal>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point, i) => (
            <Reveal key={point.title} delay={0.06 * i} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
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
            Start free, add SMS fallback anytime
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const tones = {
  brand: 'bg-brand text-white',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  green: 'bg-emerald-500 text-white',
  muted: 'bg-subtle text-muted',
};

function FlowRow({ active, icon: Icon, tone, title, detail }: { active: boolean; icon: React.ComponentType<{ className?: string }>; tone: keyof typeof tones; title: string; detail: React.ReactNode }) {
  return (
    <div className={cn('flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors duration-300', active ? 'border-line bg-surface' : 'border-dashed border-line/70 bg-transparent opacity-70')}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-300', tones[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="truncate text-sm text-muted">{detail}</p>
      </div>
    </div>
  );
}

function Connector() {
  return <div className="ml-9 h-5 w-px bg-line" />;
}
