'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { applyTheme, readTheme, type Theme } from '@/lib/theme';

const options: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(readTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('tn-theme-change', onChange);
    return () => window.removeEventListener('tn-theme-change', onChange);
  }, []);
  return [theme, applyTheme];
}

// Three-way switch: light / follow system / dark.
export function ThemeToggle({ withLabels, className }: { withLabels?: boolean; className?: string }) {
  const [theme, setTheme] = useTheme();
  const id = useId();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-xl border border-line bg-subtle p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.value)}
          className={cn('relative flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-xs font-medium transition-colors', theme === o.value ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {theme === o.value && <motion.span layoutId={`theme-pill-${id}`} className="absolute inset-0 rounded-[10px] bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <o.icon className="relative size-3.5" />
          {withLabels && <span className="relative">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
