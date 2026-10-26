'use client';

import { Check, Copy, Terminal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/components/ui';
import { API_BASE_URL } from '@/lib/api';
import { highlight } from '@/lib/highlight';
import { Reveal, SectionHeading } from './reveal';

const samples = {
  'Node.js': `const text = \`Order #\${order.id} is out for delivery 🚚\`;

const res = await fetch('https://api.telenotify.dev/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.TELENOTIFY_KEY,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    to: order.customerId,
    text,
    buttons: [[{ text: 'Track order', url: order.trackingUrl }]],
    idempotencyKey: \`order-\${order.id}-shipped\`,
  }),
});

const message = await res.json();
if (message.status === 'UNDELIVERABLE') {
  await sms.send(order.phone, text); // your fallback, only when needed
}`,
  Python: `import os, requests

text = f"Order #{order.id} is out for delivery 🚚"
res = requests.post(
    "https://api.telenotify.dev/v1/messages",
    headers={"x-api-key": os.environ["TELENOTIFY_KEY"]},
    json={
        "to": order.customer_id,
        "text": text,
        "idempotencyKey": f"order-{order.id}-shipped",
    },
)

message = res.json()
if message["status"] == "UNDELIVERABLE":
    sms.send(order.phone, text)  # your fallback, only when needed`,
  cURL: `curl -X POST https://api.telenotify.dev/v1/messages \\
  -H "x-api-key: tn_test_…" \\
  -H "content-type: application/json" \\
  -d '{
    "to": "customer_1042",
    "text": "Order #1042 is out for delivery 🚚",
    "idempotencyKey": "order-1042-shipped"
  }'`,
};

type Lang = keyof typeof samples;

const sample = (lang: Lang) => samples[lang].replaceAll('https://api.telenotify.dev', API_BASE_URL);

export function Developers() {
  const [lang, setLang] = useState<Lang>('Node.js');
  const [copied, setCopied] = useState(false);

  return (
    <section id="developers" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="For developers"
          title={<>An API you can learn <span className="text-gradient">over coffee.</span></>}
          body="Three endpoints, predictable statuses, signed webhooks and idempotency built in. The sandbox behaves exactly like production."
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Reveal className="overflow-hidden rounded-3xl border border-white/10 bg-[#030a1c] shadow-lift">
            <div className="flex items-center gap-1 border-b border-white/10 px-3 pt-3">
              {(Object.keys(samples) as Lang[]).map((key) => (
                <button key={key} onClick={() => setLang(key)} className="relative px-3.5 pb-3 pt-1 text-sm font-medium">
                  <span className={cn('relative z-10 transition-colors', lang === key ? 'text-white' : 'text-slate-400 hover:text-slate-200')}>{key}</span>
                  {lang === key && <motion.span layoutId="code-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
                </button>
              ))}
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(sample(lang));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-auto mb-2 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Copy code"
              >
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              </button>
            </div>
            <AnimatePresence mode="wait">
              <motion.pre
                key={lang}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="h-[400px] overflow-auto p-5 font-mono text-[13px] leading-relaxed text-slate-200"
              >
                <code>{highlight(sample(lang), lang === 'Python' ? 'python' : lang === 'cURL' ? 'bash' : 'javascript')}</code>
              </motion.pre>
            </AnimatePresence>
          </Reveal>

          <div className="flex flex-col gap-4">
            <Reveal delay={0.1} className="rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Terminal className="size-4 text-brand" /> Response
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-page p-4 font-mono text-xs leading-relaxed text-muted">
                {`{
  "id": "6f1c…",
  "to": "customer_1042",
  "status": "QUEUED",
  "reason": null
}`}
              </pre>
            </Reveal>
            <Reveal delay={0.2} className="flex-1 rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <p className="text-sm font-semibold text-ink">Every message ends in one of three states</p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  ['SENT', 'Delivered to Telegram.', 'bg-emerald-500'],
                  ['UNDELIVERABLE', 'Not linked, blocked or chat gone: use your fallback.', 'bg-amber-500'],
                  ['FAILED', 'Telegram unavailable after retries.', 'bg-red-500'],
                ].map(([status, text, dot]) => (
                  <li key={status} className="flex gap-3">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot)} />
                    <span>
                      <span className="font-mono text-xs font-semibold text-ink">{status}</span>
                      <span className="block text-muted">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
