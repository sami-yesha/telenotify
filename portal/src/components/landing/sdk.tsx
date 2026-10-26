'use client';

import { Check, Copy, MessageSquareText, Package, Repeat, Send, Server, ShieldCheck, Smartphone, Sparkles, Webhook, Zap } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/logo';
import { cn } from '@/lib/cn';
import { highlight } from '@/lib/highlight';
import { Reveal, SectionHeading } from './reveal';

const INSTALL = 'npm install @telenotify/node';

const STEPS = [
  {
    icon: Package,
    title: 'Install and create a client',
    body: 'Zero dependencies and full TypeScript types. Works in Node 18+, Bun and serverless functions.',
    code: `import { Telenotify } from '@telenotify/node';

const telenotify = new Telenotify({
  apiKey: process.env.TELENOTIFY_API_KEY, // tn_test_… or tn_live_…
  baseUrl: process.env.TELENOTIFY_API_URL,
});`,
  },
  {
    icon: Smartphone,
    title: 'Connect a customer',
    body: 'Show the one-time link as a button or QR code. One tap on Start and they get your updates on Telegram.',
    code: `const { url } = await telenotify.customers.createLink('customer_123', {
  phone: '0911223344',
});

// Render \`url\` as "Get updates on Telegram"`,
  },
  {
    icon: Send,
    title: 'Send in their language',
    body: 'Plain text or a template in English, Amharic, Afaan Oromo or Tigrinya. Retries never double-send.',
    code: `const message = await telenotify.messages.send({
  to: 'customer_123',
  template: 'payment_received',
  params: { amount: '1,250', payer: 'Abebe' },
  priority: 'high',
  idempotencyKey: 'tx-88-received',
});

if (message.status === 'UNDELIVERABLE') {
  // Not on Telegram: your SMS, or our AfroMessage fallback
}`,
  },
  {
    icon: Webhook,
    title: 'Know what happened',
    body: 'Signed webhooks for every outcome. The SDK verifies the signature for you.',
    code: `import { webhooks } from '@telenotify/node';

app.post('/telenotify', express.raw({ type: 'application/json' }), (req, res) => {
  const event = webhooks.constructEvent(
    req.body,
    req.headers['x-telenotify-signature'],
    process.env.TELENOTIFY_SIGNING_SECRET,
  );
  if (event.event === 'message.sent') markDelivered(event.data.id);
  res.sendStatus(200);
});`,
  },
];

const PERKS = [
  { icon: Sparkles, label: 'Typed end to end' },
  { icon: Repeat, label: 'Safe automatic retries' },
  { icon: ShieldCheck, label: 'Webhook signature check' },
  { icon: Zap, label: 'Zero dependencies' },
];

export function Sdk() {
  return (
    <section id="sdk" className="relative scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Official SDK"
          title={
            <>
              From <code className="font-mono">npm install</code> to <span className="text-gradient">first message in 5 minutes.</span>
            </>
          }
          body="The Node.js SDK wraps the whole flow: connect customers, send in their language, verify phone numbers and check webhook signatures. Python, Go, PHP and Java samples are in the docs."
        />

        <Reveal className="mt-10 flex flex-col items-center gap-5">
          <InstallPill />
          <ul className="flex flex-wrap justify-center gap-2">
            {PERKS.map((perk) => (
              <li key={perk.label} className="flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur">
                <perk.icon className="size-3.5 text-brand" /> {perk.label}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <FlowDiagram />
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <Walkthrough />
        </Reveal>
      </div>
    </section>
  );
}

function InstallPill() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(INSTALL);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-[#030a1c] px-5 py-3.5 font-mono text-sm text-slate-200 transition-colors hover:border-white/25"
      aria-label="Copy install command"
    >
      <span className="text-emerald-400">$</span>
      {INSTALL}
      <span className="ml-2 grid size-7 place-items-center rounded-lg bg-white/5 text-slate-400 transition-colors group-hover:text-white">
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}

// ---------- Flow diagram ----------

const NODES = [
  { id: 'app', label: 'Your server', sub: 'SDK or REST', icon: Server },
  { id: 'api', label: 'Telenotify API', sub: 'queue · templates · rate limits', icon: null },
  { id: 'bot', label: 'Your Telegram bot', sub: '@your_bot', icon: Send },
  { id: 'phone', label: 'Customer', sub: 'gets it in seconds', icon: Smartphone },
] as const;

// Request travels left to right; the result comes back as a webhook; customers
// who aren't on Telegram take the SMS branch.
function FlowDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  return (
    <div ref={ref} className="relative overflow-hidden rounded-3xl border border-line bg-surface/80 p-6 shadow-soft backdrop-blur sm:p-10">

      <div className="relative grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:gap-0">
        {NODES.map((node, i) => (
          <FlowItem key={node.id} node={node} index={i} last={i === NODES.length - 1} active={inView} />
        ))}
      </div>

      {/* Return path and fallback */}
      <div className="relative mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <Webhook className="size-4" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">Result comes back to you</p>
            <p className="truncate font-mono text-xs text-muted">message.sent · message.undeliverable · message.failed</p>
          </div>
          <TravelDot className="ml-auto" reverse active={inView} color="bg-emerald-500" />
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <MessageSquareText className="size-4" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">Not on Telegram? SMS fallback</p>
            <p className="truncate text-xs text-muted">Your provider, or ours through your AfroMessage account</p>
          </div>
          <TravelDot className="ml-auto" active={inView} color="bg-amber-500" />
        </div>
      </div>
    </div>
  );
}

function FlowItem({ node, index, last, active }: { node: (typeof NODES)[number]; index: number; last: boolean; active: boolean }) {
  const Icon = node.icon;
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={active ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: index * 0.15, duration: 0.4 }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border bg-surface p-4 shadow-soft md:flex-col md:text-center',
          node.id === 'api' ? 'border-brand/40 ring-4 ring-brand/10' : 'border-line',
        )}
      >
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-2xl',
            node.id === 'api' ? '' : 'bg-subtle text-ink ring-1 ring-inset ring-line',
          )}
        >
          {Icon ? <Icon className="size-5" /> : <LogoMark className="size-11" />}
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">{node.label}</span>
          <span className="block text-xs text-muted">{node.sub}</span>
        </span>
      </motion.div>
      {!last && (
        <div className="relative mx-auto h-8 w-px md:h-px md:w-16 lg:w-24">
          <div className="absolute inset-0 bg-brand/40" />
          <Pulse active={active} delay={index * 0.45} />
        </div>
      )}
    </>
  );
}

// A glowing dot running along a connector.
function Pulse({ active, delay }: { active: boolean; delay: number }) {
  if (!active) return null;
  return (
    <>
      <motion.span
        className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_2px_rgb(42_171_238_/_0.6)] md:hidden"
        initial={{ top: '0%', opacity: 0 }}
        animate={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
        transition={{ delay, duration: 1.1, repeat: Infinity, repeatDelay: 0.7, ease: 'easeInOut' }}
      />
      <motion.span
        className="absolute top-1/2 hidden size-2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_2px_rgb(42_171_238_/_0.6)] md:block"
        initial={{ left: '0%', opacity: 0 }}
        animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
        transition={{ delay, duration: 1.1, repeat: Infinity, repeatDelay: 0.7, ease: 'easeInOut' }}
      />
    </>
  );
}

function TravelDot({ active, reverse, color, className }: { active: boolean; reverse?: boolean; color: string; className?: string }) {
  return (
    <span className={cn('relative hidden h-px w-16 shrink-0 bg-line sm:block', className)}>
      {active && (
        <motion.span
          className={cn('absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full', color)}
          animate={{ left: reverse ? ['100%', '0%'] : ['0%', '100%'], opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
}

// ---------- Step-by-step walkthrough ----------

function Walkthrough() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-120px' });

  // Move to the next step every few seconds while visible, unless hovered.
  useEffect(() => {
    if (paused || !inView) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), 5000);
    return () => clearTimeout(timer);
  }, [step, paused, inView]);

  const current = STEPS[step];
  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]"
    >
      <ol className="relative space-y-2">
        <span className="absolute bottom-6 left-[1.6rem] top-6 w-px bg-line" aria-hidden />
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={s.title}>
              <button
                onClick={() => setStep(i)}
                className={cn(
                  'relative flex w-full gap-4 rounded-2xl border p-4 text-left transition-all',
                  active ? 'border-line bg-surface shadow-lift' : 'border-transparent hover:bg-surface/60',
                )}
              >
                <span
                  className={cn(
                    'relative z-10 grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
                    active ? 'bg-brand text-white shadow-soft' : done ? 'bg-emerald-500 text-white' : 'bg-subtle text-muted ring-1 ring-inset ring-line',
                  )}
                >
                  {done ? <Check className="size-4" /> : <s.icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Step {i + 1}</span>
                  <span className={cn('block font-semibold', active ? 'text-ink' : 'text-ink/80')}>{s.title}</span>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="block overflow-hidden text-sm leading-relaxed text-muted"
                      >
                        <span className="block pt-1">{s.body}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {active && !paused && inView && (
                    <span className="mt-3 block h-0.5 overflow-hidden rounded-full bg-line">
                      <motion.span key={step} className="block h-full bg-gradient-to-r from-brand to-accent" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 5, ease: 'linear' }} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#030a1c] shadow-lift">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-2 font-mono text-xs text-slate-400">{['client.ts', 'connect.ts', 'notify.ts', 'webhooks.ts'][step]}</span>
          <span className="ml-auto rounded-md bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">@telenotify/node</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.pre
            key={step}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.25 }}
            className="min-h-[340px] overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-slate-200"
          >
            <code>{highlight(current.code, 'javascript')}</code>
          </motion.pre>
        </AnimatePresence>
      </div>
    </div>
  );
}
