'use client';

import { Check, ChevronsUpDown, Copy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { ButtonHTMLAttributes, Children, InputHTMLAttributes, isValidElement, ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { highlight } from '@/lib/highlight';

export { cn } from '@/lib/cn';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-page hover:bg-ink/88 hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)] disabled:opacity-50 disabled:hover:shadow-none',
  secondary: 'border border-line bg-surface text-ink hover:border-muted/40 hover:bg-subtle disabled:opacity-50',
  danger: 'border border-red-200 bg-surface text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium tracking-[-0.01em] transition-[background-color,border-color,box-shadow,color] duration-200 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Input({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
      <input
        {...props}
        className={cn(
          'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-muted/60 hover:border-muted/40 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15',
          className,
        )}
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

type SelectOption = { value: string; label: ReactNode; text: string; disabled?: boolean };

/**
 * Themed replacement for <select>. Takes the same <option> children and calls
 * onChange with an event-like { target: { value } }, so it drops in for the
 * native element. With `name` it also works in forms (FormData).
 */
export function Select({
  value,
  defaultValue,
  onChange,
  name,
  className,
  disabled,
  children,
  'aria-label': ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  name?: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const options: SelectOption[] = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child)) return [];
    const label = child.props.children;
    const text = typeof label === 'string' ? label : Children.toArray(label).join('');
    return [{ value: String(child.props.value ?? text), label, text, disabled: child.props.disabled }];
  });
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? '');
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const height = Math.min(320, options.length * 38 + 12);
    const above = window.innerHeight - r.bottom < height + 12 && r.top > height + 12;
    setRect({ left: r.left, width: r.width, top: above ? r.top - height - 6 : r.bottom + 6, above });
  }, [options.length]);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === selected?.value)));
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (value === undefined) setInner(option.value);
    onChange?.({ target: { value: option.value, name } });
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!button.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    list.current?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const move = (delta: number) => {
    setActive((i) => {
      for (let step = 1; step <= options.length; step++) {
        const next = (i + delta * step + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return i;
    });
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(options.length - 1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), options[active] && choose(options[active]));
    else if (e.key === 'Escape') (e.preventDefault(), setOpen(false), button.current?.focus());
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      // Type to jump to an option.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const match = options.findIndex((o) => o.text.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          'inline-flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left text-sm text-ink transition-[border-color,box-shadow] hover:border-muted/40 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60',
          open && 'border-brand ring-4 ring-brand/15',
          className,
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>
      {name && <input type="hidden" name={name} value={selected?.value ?? ''} />}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.ul
                ref={list}
                id={`${id}-list`}
                role="listbox"
                tabIndex={-1}
                aria-activedescendant={`${id}-opt-${active}`}
                onKeyDown={onListKey}
                initial={{ opacity: 0, y: rect.above ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: rect.above ? 4 : -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={{ position: 'fixed', left: rect.left, top: rect.top, minWidth: rect.width, maxWidth: Math.max(rect.width, 360) }}
                className="z-[120] max-h-80 overflow-y-auto rounded-xl border border-line bg-surface/95 p-1.5 shadow-lift outline-none backdrop-blur-xl"
              >
                {options.map((option, i) => {
                  const isSelected = option.value === selected?.value;
                  return (
                    <li
                      key={option.value}
                      id={`${id}-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled}
                      onMouseEnter={() => !option.disabled && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(option)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        i === active ? 'bg-subtle text-ink' : 'text-ink/90',
                        isSelected && 'font-medium',
                        option.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="min-w-0 flex-1">{option.label}</span>
                      <Check className={cn('size-4 shrink-0 text-brand', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export function Card({
  title,
  description,
  actions,
  icon: Icon,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon className="size-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-medium tracking-[-0.015em] text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

const badgeTones = {
  gray: 'bg-subtle text-muted ring-line',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
};

const dotTones = { gray: 'bg-muted', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-sky-500' };

export function Badge({ tone = 'gray', dot, children }: { tone?: keyof typeof badgeTones; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', badgeTones[tone])}>
      {dot && <span className={cn('size-1.5 rounded-full', dotTones[tone])} />}
      {children}
    </span>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'green' | 'blue'; children: ReactNode }) {
  const tones = {
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    blue: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  };
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-lg border px-3.5 py-2.5 text-sm', tones[tone])}>
      {children}
    </motion.div>
  );
}

export function CopyButton({ value, label = 'Copy', dark }: { value: string; label?: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
        dark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'border border-line bg-surface text-muted hover:text-ink',
      )}
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function Secret({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-3.5 py-2.5">
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#030a1c]">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
          </span>
          {language}
        </span>
        <CopyButton value={code} dark />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-slate-200">
        <code>{highlight(code, codeLanguage(language, code))}</code>
      </pre>
    </div>
  );
}

// The label may be a language ("bash") or a caption ("send it"); fall back to sniffing the code.
function codeLanguage(label: string | undefined, code: string) {
  const known = ['bash', 'json', 'javascript', 'python', 'go', 'php', 'java'];
  if (label && known.includes(label)) return label;
  if (label === 'typescript' || label === 'js' || label === 'ts') return 'javascript';
  if (code.trimStart().startsWith('curl') || code.trimStart().startsWith('#')) return 'bash';
  if (/^\s*[{\[]/.test(code)) return 'json';
  return 'javascript';
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.75rem] font-normal leading-[1.05] text-ink sm:text-[2.25rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Empty({ title, icon: Icon, children, action }: { title: string; icon?: React.ComponentType<{ className?: string }>; children?: ReactNode; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-subtle/30 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && (
        <Link href={action.href} className="mt-4 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-page transition-[background-color,box-shadow] hover:bg-ink/88 hover:shadow-[0_0_0_4px_rgb(42_171_238_/_0.14)]">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Spinner() {
  return <div className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-subtle', className)} />;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}

export function Dialog({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#01061a]/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn('relative w-full rounded-xl border border-line bg-surface p-6 shadow-lift', wide ? 'max-w-2xl' : 'max-w-md')}
          >
            <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </button>
            <h2 className="pr-8 font-display text-xl font-normal text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            <div className="mt-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line/70 bg-subtle/50 text-left text-xs font-medium text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-2 font-medium sm:px-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-subtle/60 [&_td]:px-5 [&_td]:py-3 sm:[&_td]:px-6">{children}</tbody>
      </table>
    </div>
  );
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(value: string | null) {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day']];
  for (let i = units.length - 1; i >= 0; i--) {
    const [size, name] = units[i];
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n > 1 ? 's' : ''} ago`;
    }
  }
  return formatDate(value);
}
