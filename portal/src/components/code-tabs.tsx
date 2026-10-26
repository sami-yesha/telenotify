'use client';

import { motion } from 'motion/react';
import { useId, useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { highlight } from '@/lib/highlight';
import { type Lang, LANGUAGES, type Samples } from '@/lib/snippets';

// The chosen language is shared by every code block and remembered per browser,
// so picking "Python" once switches the whole page.
const STORAGE_KEY = 'tn_code_lang';
const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current) return current;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.id === saved)) current = saved as Lang;
  } catch {
    // Storage blocked: fall back to the default.
  }
  return current ?? 'curl';
}

export function setCodeLanguage(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function useCodeLanguage(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => 'curl',
  );
}

const DOTS: Record<Lang, string> = {
  curl: 'bg-slate-400',
  node: 'bg-emerald-400',
  python: 'bg-yellow-300',
  go: 'bg-cyan-400',
  php: 'bg-indigo-400',
  java: 'bg-orange-400',
};

export function CodeTabs({ samples, title, className }: { samples: Samples; title?: string; className?: string }) {
  const chosen = useCodeLanguage();
  const id = useId();
  const available = LANGUAGES.filter((l) => samples[l.id]);
  const active = available.find((l) => l.id === chosen) ?? available[0];
  if (!active) return null;
  const code = samples[active.id]!;

  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/5 bg-[#030a1c] shadow-soft', className)}>
      <div className="flex items-center gap-2 border-b border-white/10 pl-1.5 pr-2">
        <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={title ?? 'Code language'}>
          {available.map((lang) => (
            <button
              key={lang.id}
              type="button"
              role="tab"
              aria-selected={lang.id === active.id}
              onClick={() => setCodeLanguage(lang.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-xs font-medium transition-colors',
                lang.id === active.id ? 'text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <span className={cn('size-1.5 rounded-full', DOTS[lang.id], lang.id !== active.id && 'opacity-50')} />
              {lang.label}
              {lang.id === active.id && <motion.span layoutId={`${id}-tab`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
        {title && <span className="hidden shrink-0 text-[11px] text-slate-500 sm:block">{title}</span>}
        <CopyButton value={code} dark />
      </div>
      <motion.pre
        key={active.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="max-h-[28rem] overflow-auto p-4 text-[13px] leading-relaxed text-slate-200"
      >
        <code>{highlight(code, active.highlight)}</code>
      </motion.pre>
    </div>
  );
}
