import { Check, Cloud, GitFork, Heart, Server, Star } from 'lucide-react';
import { GithubIcon } from '@/components/github-icon';
import Link from 'next/link';
import { FREE_MONTHLY_LIMIT, GITHUB_URL } from '@/lib/site';
import { Reveal, SectionHeading } from './reveal';

const hosted = [
  `${FREE_MONTHLY_LIMIT.toLocaleString('en-US')} live messages & verifications a month`,
  'Free sandbox with test customers',
  'Your own branded bot',
  'Phone verification without SMS',
  'Templates in Amharic, Afaan Oromo, Tigrinya',
  'Signed webhooks with retries',
];

const selfHosted = ['No limits at all', 'Your own server and database', 'One Docker Compose command', 'AGPL-3.0: use it, change it, share it'];

export function OpenSource() {
  return (
    <section id="open-source" className="scroll-mt-20 border-y border-line bg-[#020920] py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Free & open source"
          title={
            <>
              No plans. No card. <span className="text-gradient">No catch.</span>
            </>
          }
          body="Telenotify is free to use and its code is open. Use our hosted service, or run it on your own server. Telegram doesn’t charge for messages, so neither do we."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Reveal className="relative flex flex-col overflow-hidden rounded-3xl border border-brand bg-surface p-7 shadow-lift ring-4 ring-brand/10">
            <span className="absolute right-6 top-6 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Start here</span>
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
              <Cloud className="size-5" />
            </span>
            <p className="mt-4 font-display text-2xl font-medium text-ink">Hosted</p>
            <p className="mt-1 text-sm text-muted">We run it for you. Sign up and send in minutes.</p>
            <p className="mt-6 font-display text-5xl font-normal tracking-tight text-ink">
              0 <span className="text-lg font-semibold text-muted">ETB, forever</span>
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-muted">
              {hosted.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted">Fair use: need more each month? Ask us and we&apos;ll raise your limit.</p>
            <div className="mt-auto pt-7">
              <Link href="/signup" className="block rounded-[4.5px] bg-ink px-5 py-3 text-center text-sm font-semibold text-page transition-colors hover:bg-[#e8eef7]">
                Create a free account
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#030a1c] p-7 text-white shadow-lift">
            <span className="relative grid size-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
              <Server className="size-5" />
            </span>
            <p className="relative mt-4 font-display text-2xl font-medium">Self-hosted</p>
            <p className="relative mt-1 text-sm text-slate-400">Run Telenotify on your own server, for full control over data.</p>
            <pre className="relative mt-6 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-slate-200">
              <span className="text-emerald-400">$</span> git clone {GITHUB_URL}.git{'\n'}
              <span className="text-emerald-400">$</span> cd telenotify/deploy{'\n'}
              <span className="text-emerald-400">$</span> cp .env.production.example .env.production{'\n'}
              <span className="text-emerald-400">$</span> docker compose --env-file .env.production up -d --build
            </pre>
            <ul className="relative mt-6 space-y-2.5 text-sm text-slate-300">
              {selfHosted.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {item}
                </li>
              ))}
            </ul>
            <div className="relative mt-auto flex flex-wrap gap-3 pt-7">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[4.5px] bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-[#e8eef7]"
              >
                <GithubIcon className="size-4" /> View on GitHub
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-[4.5px] border border-white/15 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <Star className="size-4" /> Star
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.12} className="mt-6 flex flex-col items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-6 shadow-soft sm:flex-row">
          <p className="flex items-center gap-3 text-sm text-muted">
            <Heart className="size-5 shrink-0 text-pink-500" />
            Built in Ethiopia, in the open. Bug reports, ideas and pull requests are welcome.
          </p>
          <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-brand hover:underline">
            <GitFork className="size-4" /> How to contribute
          </a>
        </Reveal>
      </div>
    </section>
  );
}
