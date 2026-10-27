'use client';

import { AtSign, BadgeCheck, HelpCircle, Search, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { BusinessLookup } from '@/lib/types';
import { Card, VerifyShell } from '../verify/verify-shell';

// Public: anyone can check that a bot really belongs to a verified business, e.g.
// before sharing their phone number. Linked from the badge and bot profiles.
function Check() {
  const router = useRouter();
  const initial = useSearchParams().get('bot') ?? '';
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<BusinessLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(bot: string) {
    const username = bot.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    if (!username) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<BusinessLookup>(`/v1/public/businesses/${encodeURIComponent(username)}`));
      router.replace(`/check?bot=${encodeURIComponent(username)}`, { scroll: false });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initial) void lookup(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <VerifyShell>
      <Card>
        <span className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand">
          <BadgeCheck className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-[2rem] font-normal leading-[1.05] text-ink">Is this bot real?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Before you share your phone number, check that a Telegram bot really belongs to the business it claims to be.</p>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void lookup(query);
          }}
          className="mt-6 flex gap-2"
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 shadow-soft focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <AtSign className="size-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="abebe_pharmacy_bot"
              aria-label="Bot username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted/60"
            />
          </label>
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-page shadow-soft disabled:opacity-60" disabled={loading}>
            {loading ? <Spinner /> : <Search className="size-4" />} Check
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <Result result={result} />
          </motion.div>
        )}
      </Card>
    </VerifyShell>
  );
}

function Result({ result }: { result: BusinessLookup }) {
  if (result.verified) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
          <BadgeCheck className="size-5" /> Verified business
        </p>
        <p className="mt-3 font-display text-xl text-ink">{result.legalName}</p>
        <p className="mt-1 font-mono text-sm text-muted">@{result.botUsername}</p>
        <dl className="mt-4 space-y-1.5 text-sm text-muted">
          {result.website && (
            <div>
              Website:{' '}
              <a href={result.website} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                {result.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {result.verifiedSince && <div>Verified since {new Date(result.verifiedSince).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted">Telenotify checked this business&apos;s registration (TIN and trade license). Messages from this bot come from them.</p>
      </div>
    );
  }
  if (result.onTelenotify) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
          <ShieldAlert className="size-5" /> Not verified
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <span className="font-mono">@{result.botUsername}</span> uses Telenotify, but the business behind it hasn&apos;t been verified by us. That doesn&apos;t mean it&apos;s fake: be careful, and confirm with the business another way before sharing personal details.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-subtle/50 p-5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <HelpCircle className="size-5 text-muted" /> We don&apos;t know this bot
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="font-mono">@{result.botUsername}</span> isn&apos;t a business on Telenotify, so we can&apos;t vouch for it. Check the username carefully: fake bots often copy a real name with one letter changed.
      </p>
    </div>
  );
}

export default function CheckPage() {
  return (
    <Suspense>
      <Check />
    </Suspense>
  );
}
