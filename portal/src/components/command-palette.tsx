'use client';

import {
  BookOpen,
  Bot,
  Braces,
  CreditCard,
  FileText,
  FlaskConical,
  KeyRound,
  MessageSquareText,
  MousePointerClick,
  MessagesSquare,
  Rocket,
  ScrollText,
  Search,
  Settings,
  ToggleLeft,
  UserCog,
  UserRound,
  Users,
  UsersRound,
  Webhook,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Customer, EnvName, Page } from '@/lib/types';
import { useProgressRouter } from '@/components/route-progress';

type Item = { id: string; label: string; hint?: string; icon: React.ComponentType<{ className?: string }>; href: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ⌘K / Ctrl+K: jump to any page, a customer by id, or a message by id.
export function CommandPalette({ orgId, env, open, onOpenChange }: { orgId: string; env: EnvName; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useProgressRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const base = `/o/${orgId}/${env}`;
  const other: EnvName = env === 'sandbox' ? 'live' : 'sandbox';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Customer suggestions, debounced.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || UUID.test(q)) return setCustomers([]);
    const timer = setTimeout(async () => {
      try {
        const page = await fetcher<Page<Customer>>(`/portal/orgs/${orgId}/envs/${env}/customers?search=${encodeURIComponent(q)}&limit=5`);
        setCustomers(page.data);
      } catch {
        setCustomers([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, orgId, env]);

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = [
      { id: 'start', label: 'Get started', icon: Rocket, href: base },
      ...(env === 'sandbox' ? [{ id: 'playground', label: 'Playground', icon: FlaskConical, href: `${base}/playground` }] : []),
      { id: 'docs', label: 'Docs: integration guide', icon: BookOpen, href: `${base}/docs` },
      { id: 'reference', label: 'API reference (try endpoints)', icon: Braces, href: `${base}/api-reference` },
      { id: 'keys', label: 'API keys & request log', icon: KeyRound, href: `${base}/keys` },
      { id: 'templates', label: 'Templates (English, Amharic…)', icon: FileText, href: `${base}/templates` },
      { id: 'verify-widget', label: 'Verify widget (Verify with Telegram button)', icon: MousePointerClick, href: `${base}/verify-widget` },
      { id: 'sms-fallback', label: 'SMS fallback (AfroMessage)', icon: MessageSquareText, href: `${base}/sms-fallback` },
      { id: 'webhooks', label: 'Webhooks & delivery log', icon: Webhook, href: `${base}/webhooks` },
      { id: 'bot', label: 'Telegram bot', icon: Bot, href: `${base}/bot` },
      { id: 'messages', label: 'Messages', icon: MessagesSquare, href: `${base}/messages` },
      { id: 'customers', label: 'Customers', icon: Users, href: `${base}/customers` },
      { id: 'team', label: 'Team', icon: UsersRound, href: `${base}/team` },
      { id: 'billing', label: 'Plan & usage', icon: CreditCard, href: `${base}/billing` },
      { id: 'audit', label: 'Audit log', icon: ScrollText, href: `${base}/audit` },
      { id: 'settings', label: 'Organization settings', icon: Settings, href: `${base}/settings` },
      { id: 'account', label: 'Account settings', icon: UserCog, href: '/account' },
      { id: 'switch', label: `Switch to ${other}`, icon: ToggleLeft, href: `/o/${orgId}/${other}` },
      { id: 'terms', label: 'Terms & privacy', icon: FileText, href: '/terms' },
    ];
    const q = query.trim().toLowerCase();
    const matches = q ? pages.filter((p) => p.label.toLowerCase().includes(q)) : pages;
    const dynamic: Item[] = [];
    if (UUID.test(query.trim())) {
      dynamic.push({ id: 'msg', label: `Open message ${query.trim().slice(0, 8)}…`, hint: 'message id', icon: MessagesSquare, href: `${base}/messages/${query.trim()}` });
    }
    for (const c of customers) {
      dynamic.push({ id: `c-${c.externalId}`, label: c.externalId, hint: c.reachable ? 'customer · reachable' : 'customer · not reachable', icon: UserRound, href: `${base}/customers/${encodeURIComponent(c.externalId)}` });
    }
    return [...dynamic, ...matches];
  }, [query, customers, base, env, orgId, other]);

  useEffect(() => setActive(0), [query]);

  function go(item: Item) {
    onOpenChange(false);
    router.push(item.href);
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#01061a]/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
          <motion.div
            role="dialog"
            aria-label="Search"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, items.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter' && items[active]) {
                    go(items[active]);
                  } else if (e.key === 'Escape') {
                    onOpenChange(false);
                  }
                }}
                placeholder="Search pages, customer ids or a message id…"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No results</li>}
              {items.map((item, i) => (
                <li key={item.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm', i === active ? 'bg-subtle text-ink' : 'text-muted')}
                  >
                    <item.icon className={cn('size-4', i === active && 'text-brand')} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
