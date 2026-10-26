'use client';

import { BadgeCheck, FlaskConical, MessageSquareReply, MousePointerClick, ShieldCheck, Signal } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/components/ui';
import { Reveal, SectionHeading } from './reveal';

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Why Telenotify"
          title={<>Everything SMS does, <span className="text-gradient">with more room to talk.</span></>}
          body="Telegram messages are free to send, can carry buttons and replies, and come from a bot with your name on it. We handle the bot plumbing; you make one API call."
        />

        <div className="mt-16 grid gap-4 md:grid-cols-6">
          <Tile className="md:col-span-4" icon={BadgeCheck} title="Your brand, your bot" body="Customers chat with @YourBusinessBot, with your name, logo and description. Not a shared sender ID, not our brand.">
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {['Abebe Pharmacy', 'Selam Delivery', 'Tena Clinic'].map((name, i) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 * i }}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-page py-2 pl-2 pr-4"
                >
                  <span className={cn('grid size-8 place-items-center rounded-full text-xs font-bold text-white', ['bg-emerald-500', 'bg-orange-500', 'bg-violet-500'][i])}>
                    {name.split(' ').map((w) => w[0]).join('')}
                  </span>
                  <span className="text-sm font-medium text-ink">{name}</span>
                  <BadgeCheck className="size-3.5 text-sky-500" />
                </motion.div>
              ))}
            </div>
          </Tile>

          <Tile className="md:col-span-2" icon={Signal} title="Know when to fall back" body="Can't reach someone? You hear about it right away, with a reason.">
            <div className="mt-6 space-y-2 font-mono text-xs">
              {[
                ['SENT', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
                ['UNDELIVERABLE · blocked', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
                ['UNDELIVERABLE · not_linked', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
              ].map(([label, tone], i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.12 * i }}
                  className={cn('w-fit rounded-md px-2 py-1 font-semibold', tone)}
                >
                  {label}
                </motion.div>
              ))}
            </div>
          </Tile>

          <Tile className="md:col-span-2" icon={MousePointerClick} title="Buttons, not bare links" body="Attach Track order, Pay now or View receipt buttons to any message.">
            <div className="mt-6 rounded-xl bg-[#0e1621] p-3">
              <div className="rounded-xl rounded-bl-sm bg-[#182533] px-3 py-2 text-xs text-white">Your bill of 1,250 ETB is due Friday.</div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <span className="rounded-lg bg-[#182533]/80 py-1.5 text-center text-xs font-medium text-sky-300">Pay now</span>
                <span className="rounded-lg bg-[#182533]/80 py-1.5 text-center text-xs font-medium text-sky-300">Details</span>
              </div>
            </div>
          </Tile>

          <Tile className="md:col-span-2" icon={MessageSquareReply} title="Two-way by default" body="Customer replies reach your server as a message.received webhook.">
            <pre className="mt-6 overflow-hidden rounded-xl border border-line bg-page p-3 font-mono text-[11px] leading-relaxed text-muted">
              {`{ "event": "message.received",\n  "data": { "to": "cust_88",\n    "text": "Can I pick it up?" } }`}
            </pre>
          </Tile>

          <Tile className="md:col-span-2" icon={ShieldCheck} title="Signed, retried webhooks" body="Every event is HMAC-signed, has an id for de-duplication, and is retried for about 40 minutes.">
            <div className="mt-6 flex items-center gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ scaleY: 0.3, opacity: 0.3 }}
                  whileInView={{ scaleY: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.06 * i }}
                  className={cn('h-8 flex-1 origin-bottom rounded-md', i < 9 ? 'bg-line' : 'bg-emerald-500')}
                />
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted">attempt 10 → 200 OK</p>
          </Tile>

          <Tile className="md:col-span-6" icon={FlaskConical} title="A real sandbox, ready the moment you sign up" body="Get a test key instantly, connect your own Telegram to our sandbox bot, and use built-in test customers to rehearse every outcome before going live.">
            <div className="mt-6 grid gap-2 sm:grid-cols-5">
              {[
                ['test_linked', 'SENT', 'text-emerald-600 dark:text-emerald-400'],
                ['test_not_linked', 'not_linked', 'text-amber-600 dark:text-amber-400'],
                ['test_blocked', 'blocked', 'text-amber-600 dark:text-amber-400'],
                ['test_chat_gone', 'chat_gone', 'text-amber-600 dark:text-amber-400'],
                ['test_telegram_down', 'FAILED', 'text-red-600 dark:text-red-400'],
              ].map(([id, result, tone], i) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.08 * i }}
                  className="rounded-xl border border-line bg-page px-3 py-2.5"
                >
                  <p className="truncate font-mono text-xs text-ink">{id}</p>
                  <p className={cn('mt-0.5 font-mono text-[11px] font-semibold', tone)}>→ {result}</p>
                </motion.div>
              ))}
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal className={cn('group relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-soft transition-shadow hover:shadow-lift sm:p-7', className)}>
      <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-brand/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 font-display text-lg font-medium tracking-tight text-ink">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
      {children}
    </Reveal>
  );
}
