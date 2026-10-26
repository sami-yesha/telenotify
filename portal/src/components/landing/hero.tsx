'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { LogoMark } from '@/components/logo';
import { fetcher } from '@/lib/api';
import { SMS_PRICE_ETB } from '@/lib/plans';
import type { Me } from '@/lib/types';
import './hero.css';

const NBSP = ' ';
// Words inside each sentence are joined with no-break spaces, so the only place
// the subhead can wrap is between the two sentences.
const SUBHEAD = ['No codes, no resends, no SMS fees.', 'Customers confirm in one tap, free.'].map((s) => s.replaceAll(' ', NBSP)).join(' ');

const quint = 'cubic-bezier(0.22, 1, 0.36, 1)';
const expo = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Runs the one-time entrance. html.intro is added before paint by the inline
// script in page.tsx, only when Web Animations exist and motion is allowed.
function useEntrance(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const doc = document.documentElement;
    const hero = root.current;
    if (!hero || !doc.classList.contains('intro') || doc.dataset.intro) return;
    doc.dataset.intro = 'run';
    let cancelled = false;

    const ready = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 900))]);
    ready.then(() => {
      if (cancelled) return;
      const q = <T extends Element>(sel: string) => hero.querySelector<T>(sel);
      const logo = q<HTMLElement>('.vx-mark');
      const k = Math.min(1, Math.max(0.65, (logo?.offsetHeight ?? 23.5) / 23.5));
      const animations: Animation[] = [];
      const run = (el: Element | null, frames: Keyframe[], delay: number, duration: number, easing: string) => {
        if (el) animations.push(el.animate(frames, { delay, duration, easing, fill: 'both' }));
      };
      const rise = (px: number, extra: Keyframe = {}): Keyframe[] => [{ opacity: 0, transform: `translateY(${px * k}px)`, ...extra }, { opacity: 1, transform: 'none' }];

      run(logo, rise(-6), 60, 900, quint);
      run(q('.vx-rule'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 180, 1000, 'cubic-bezier(0.7, 0, 0.2, 1)');
      const links = hero.querySelectorAll('.vx-nav a');
      links.forEach((a, i) => run(a, rise(-4), i === 1 ? 420 : 490, 700, quint));
      hero.querySelectorAll('.vx-h1 .li').forEach((li, i) => run(li, [{ transform: 'translateY(104%)' }, { transform: 'none' }], i === 0 ? 200 : 290, 1100, expo));
      run(q('.vx-sub'), rise(10), 700, 850, quint);
      run(q('.vx-btn'), [{ opacity: 0, transform: `translateY(${12 * k}px) scale(0.975)` }, { opacity: 1, transform: 'none' }], 860, 900, expo);
      run(q('.vx-disc'), rise(6), 1040, 700, quint);
      run(q('.vx-disc svg'), [{ transform: `translateY(${-5 * k}px)` }, { transform: 'none' }], 1120, 820, expo);
      run(q('.vx-phone'), [{ opacity: 0, transform: `translateX(-50%) translateY(${40 * k}px)` }, { opacity: 1, transform: 'translateX(-50%)' }], 620, 1200, expo);
      hero.querySelectorAll('.vx-chip').forEach((chip, i) => run(chip, rise(14), 1180 + i * 120, 900, quint));

      Promise.all(animations.map((a) => a.finished))
        .then(() => {
          doc.classList.remove('intro');
          animations.forEach((a) => a.cancel());
          // One reflow without the hero so the line masks don't leave a GPU layer behind.
          if (!hero.contains(document.activeElement)) {
            hero.style.display = 'none';
            void hero.offsetHeight;
            hero.style.display = '';
          }
          doc.dataset.intro = 'done';
        })
        .catch(() => doc.classList.remove('intro'));
    });
    return () => {
      cancelled = true;
    };
  }, [root]);
}

// 0 bot asks → 1 tapping the button → 2 contact shared → 3 verified → loop
function useVerifyLoop() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => (s + 1) % 4), [2600, 650, 1300, 3400][step]);
    return () => clearTimeout(timer);
  }, [step]);
  return step;
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  useEntrance(root);
  const step = useVerifyLoop();
  const { data: me } = useSWR<Me>('/auth/me', fetcher, { shouldRetryOnError: false, revalidateOnFocus: false });

  return (
    <section ref={root} className="vx-hero" id="top">
      <header className="vx-mast">
        <Link href="/" className="vx-mark" aria-label="Telenotify home">
          <LogoMark />
          <span>Telenotify</span>
        </Link>
        <div className="vx-rule" />
        <nav className="vx-nav" aria-label="Primary">
          <a href="#verify">Verify</a>
          <a href="#developers">Developers</a>
          <Link href={me ? '/dashboard' : '/login'}>{me ? 'Dashboard' : 'Sign in'}</Link>
        </nav>
      </header>

      <div className="vx-gap" />

      <div className="vx-copy">
        <h1 className="vx-h1">
          <span className="l">
            <span className="li">No more OTP bills.</span>
          </span>
          <span className="l l2">
            <span className="li">Verify on Telegram.</span>
          </span>
        </h1>
        <p className="vx-sub">{SUBHEAD}</p>
        <Link href="/signup" className="vx-btn">
          Start free, no card
        </Link>
        <a href="#savings" className="vx-disc">
          See what you’d save
          <svg viewBox="0 0 11 12.6" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5.5 .4V12M1 7.5L5.5 12L10 7.5" />
          </svg>
        </a>
      </div>

      <div className="vx-field" aria-hidden>
        <div className="vx-scene">
          <div className="vx-air" />
          <div className="vx-planet">
            <div className="tg-doodles" />
          </div>
          <svg className="vx-plane" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.6 3.1 2.9 10.3c-1 .4-1 1.8.1 2.1l4.6 1.4 1.8 5.6c.3.9 1.4 1.1 2 .4l2.6-2.7 4.6 3.4c.8.6 1.9.2 2.1-.8l3-15c.2-1.1-.9-2-2.1-1.6ZM9.5 14.2l8.6-7.4-6.8 8.6-.4 3-1.4-4.2Z" />
          </svg>
        </div>

        <div className="vx-chip vx-chip-sms">
          SMS OTP, plus every resend
          <strong>{SMS_PRICE_ETB.toFixed(2)} ETB each</strong>
        </div>
        <div className="vx-chip vx-chip-tg">
          Telegram verification
          <strong>0 ETB</strong>
        </div>

        <div className="vx-phone">
          <div className="vx-screen">
            <div className="vx-chat-head">
              <span className="vx-ava">AP</span>
              <span>
                <span className="vx-chat-name">Abebe Pharmacy</span>
                <span className="vx-chat-meta" style={{ display: 'block' }}>
                  bot
                </span>
              </span>
            </div>
            <div className="vx-chat-body">
              <div className="tg-doodles" />
              <span className="vx-day">Today</span>
              <div className="vx-bubble vx-in">
                Abebe Pharmacy wants to confirm your phone number. No code needed, just tap below.
                <time>9:41</time>
              </div>
              {step >= 2 && (
                <div className="vx-bubble vx-out vx-pop">
                  <span className="vx-contact">
                    <b>H</b>
                    <span>
                      Hana Tesfaye
                      <span style={{ display: 'block', opacity: 0.7 }}>+251 9•• ••• 344</span>
                    </span>
                  </span>
                  <time>9:41 ✓✓</time>
                </div>
              )}
              {step >= 3 && (
                <div className="vx-bubble vx-in vx-pop">
                  ✅ Verified. That cost you nothing.
                  <time>9:41</time>
                </div>
              )}
              <div className="vx-key" data-press={step === 1} data-done={step >= 2}>
                📱 Share my phone number
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
