'use client';

import { Link2, Send, Webhook } from 'lucide-react';
import { motion } from 'motion/react';
import { Reveal, SectionHeading } from './reveal';

const steps = [
  {
    icon: Link2,
    title: 'Customer taps “Get updates on Telegram”',
    body: 'Show a one-time link from POST /v1/customers/link in your app, checkout page or receipt. One tap on Start and they’re connected to your bot.',
    code: 'POST /v1/customers/link',
  },
  {
    icon: Send,
    title: 'You send with one call',
    body: 'Order updates, codes, reminders: plain text or with buttons. Use an idempotency key and retries never double-send.',
    code: 'POST /v1/messages',
  },
  {
    icon: Webhook,
    title: 'You always know what happened',
    body: 'SENT, or UNDELIVERABLE with a reason, so your own SMS or email fallback kicks in only for the customers who need it.',
    code: 'message.sent · message.undeliverable',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden border-y border-line bg-[#020920] py-24 sm:py-32">
      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="How it works" title="Live in an afternoon, not a quarter." body="Three steps, the same in the sandbox and in production. Switch your key and you're live." />
        <div className="relative mt-16 grid gap-6 lg:grid-cols-3">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="absolute left-[16%] right-[16%] top-11 hidden h-px origin-left bg-brand/40 lg:block"
          />
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={0.15 * i} className="relative rounded-3xl border border-line bg-surface p-7 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="relative grid size-12 place-items-center rounded-2xl bg-brand text-white shadow-lift">
                  <step.icon className="size-5" />
                </span>
                <span className="font-mono text-sm text-muted">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-medium tracking-tight text-ink">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.body}</p>
              <code className="mt-5 inline-block rounded-lg bg-subtle px-2.5 py-1 font-mono text-xs text-ink">{step.code}</code>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
