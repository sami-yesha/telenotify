'use client';

import { animate, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SMS_PRICE_ETB } from '@/lib/plans';
import { Reveal, SectionHeading } from './reveal';

const etb = (value: number) => `${Math.round(value).toLocaleString('en-US')} ETB`;

function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(previous.current, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(v);
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, inView, format]);
  return <span ref={ref}>{format(0)}</span>;
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-mono text-sm font-semibold text-ink">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-subtle accent-sky-500 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:shadow-md"
        style={{ background: `linear-gradient(to right, var(--brand) ${pct}%, var(--subtle) ${pct}%)` }}
      />
    </label>
  );
}

export function Savings() {
  const [verifications, setVerifications] = useState(10_000);
  const [smsPerVerification, setSmsPerVerification] = useState(1.5);
  const [notifications, setNotifications] = useState(50_000);
  const [price, setPrice] = useState(SMS_PRICE_ETB);
  const [telegramShare, setTelegramShare] = useState(70);

  const smsPerMonth = verifications * smsPerVerification + notifications;
  const costToday = smsPerMonth * price;
  const avoided = costToday * (telegramShare / 100);
  // Telenotify volume: each verification counts once (no resends), plus notifications on Telegram.
  const telenotifyVolume = (verifications + notifications) * (telegramShare / 100);
  // Telenotify is free, so the saving is every SMS that moves to Telegram.
  const net = avoided;
  const costAfter = costToday - avoided;

  return (
    <section id="savings" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Savings calculator"
          title={
            <>
              Every SMS has a price. <span className="text-gradient">See what you’d stop paying.</span>
            </>
          }
          body="Move the sliders to match your business. Customers on Telegram get verified and notified there; everyone else still gets your SMS."
        />

        <Reveal className="mt-14 grid overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-lift lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-7 p-6 sm:p-9">
            <Slider label="Phone verifications (OTP) per month" value={verifications} onChange={setVerifications} min={0} max={100_000} step={500} display={verifications.toLocaleString('en-US')} />
            <Slider
              label="SMS per verification, including “Resend code”"
              value={smsPerVerification}
              onChange={setSmsPerVerification}
              min={1}
              max={3}
              step={0.1}
              display={smsPerVerification.toFixed(1)}
            />
            <Slider label="Transaction & order notifications per month" value={notifications} onChange={setNotifications} min={0} max={500_000} step={1_000} display={notifications.toLocaleString('en-US')} />
            <Slider label="Your price per SMS" value={price} onChange={setPrice} min={0.1} max={2} step={0.01} display={`${price.toFixed(2)} ETB`} />
            <Slider label="Customers reachable on Telegram (your estimate)" value={telegramShare} onChange={setTelegramShare} min={10} max={95} step={5} display={`${telegramShare}%`} />
          </div>

          <div className="relative flex flex-col justify-between gap-8 overflow-hidden tg-sky p-6 text-white sm:p-9">
            <div className="tg-doodles pointer-events-none absolute inset-0 opacity-[0.07]" />
            <div className="relative">
              <p className="text-sm text-sky-100/70">You save each month (Telenotify is free)</p>
              <p className="mt-2 font-display text-4xl font-normal tracking-tight text-white sm:text-5xl">
                <AnimatedNumber value={Math.max(0, net)} format={etb} />
              </p>
              <p className="mt-2 text-sm text-slate-300">
                That&apos;s <span className="font-semibold text-emerald-300">{etb(Math.max(0, net) * 12)}</span> a year, with nothing to pay us.
              </p>
            </div>

            <div className="relative space-y-4">
              <Bar label="Today, all SMS" value={costToday} max={costToday} tone="bg-slate-500" />
              <Bar label="With Telenotify: only the fallback SMS" value={costAfter} max={costToday} tone="bg-brand" />
              <p className="text-xs leading-relaxed text-slate-400">
                {Math.round(smsPerMonth).toLocaleString('en-US')} SMS/month today → {Math.round(smsPerMonth * (1 - telegramShare / 100)).toLocaleString('en-US')} with Telenotify, plus{' '}
                {Math.round(telenotifyVolume).toLocaleString('en-US')} Telegram messages & verifications, free. Estimate only.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono font-semibold text-white">{etb(value)}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-[4.5px] bg-white/10">
        <motion.div className={`h-full rounded-full ${tone}`} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
}
