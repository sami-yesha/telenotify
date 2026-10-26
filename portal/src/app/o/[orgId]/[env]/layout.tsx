'use client';

import {
  BookOpen,
  Bot,
  Braces,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  FileText,
  MessageSquareText,
  MousePointerClick,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Search,
  Settings,
  UserCog,
  FlaskConical,
  KeyRound,
  LogOut,
  Menu,
  MessagesSquare,
  Plus,
  Rocket,
  Users,
  UsersRound,
  Webhook,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { CommandPalette } from '@/components/command-palette';
import { Logo } from '@/components/logo';
import { SplashScreen } from '@/components/splash';
import { ThemeToggle } from '@/components/theme-toggle';
import { WelcomeTour } from '@/components/welcome-tour';
import { cn } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useOrg, useOrgParams, useRequireUser } from '@/lib/hooks';
import type { EnvName, Org, OrgSummary } from '@/lib/types';
import { useProgressRouter } from '@/components/route-progress';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; sandboxOnly?: boolean };

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Build',
    items: [
      { href: '', label: 'Get started', icon: Rocket },
      { href: '/playground', label: 'Playground', icon: FlaskConical, sandboxOnly: true },
      { href: '/docs', label: 'Docs', icon: BookOpen },
      { href: '/api-reference', label: 'API reference', icon: Braces },
    ],
  },
  {
    label: 'Configure',
    items: [
      { href: '/keys', label: 'API keys', icon: KeyRound },
      { href: '/templates', label: 'Templates', icon: FileText },
      { href: '/verify-widget', label: 'Verify widget', icon: MousePointerClick },
      { href: '/sms-fallback', label: 'SMS fallback', icon: MessageSquareText },
      { href: '/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/bot', label: 'Telegram bot', icon: Bot },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { href: '/messages', label: 'Messages', icon: MessagesSquare },
      { href: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Organization',
    items: [
      { href: '/team', label: 'Team', icon: UsersRound },
      { href: '/billing', label: 'Plan & usage', icon: CreditCard },
      { href: '/audit', label: 'Audit log', icon: ScrollText },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function OrgLayout({ children }: { children: ReactNode }) {
  const { user } = useRequireUser();
  const { orgId, env } = useOrgParams();
  const { data: org, error: orgError } = useOrg();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const base = `/o/${orgId}/${env}`;
  const subpath = pathname.slice(base.length);

  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrawer(false);
    // On large screens the page scrolls inside the panel, which Next doesn't reset.
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  if (orgError) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        <p>
          Organization not found.{' '}
          <Link className="text-brand" href="/dashboard">
            Go home
          </Link>
        </p>
      </div>
    );
  }
  if (!user || !org) {
    return <SplashScreen messages={['Loading your workspace…', 'Checking your bots…', 'Almost there…']} />;
  }

  // Keep the current page when switching environments (playground has no live twin).
  const switchTo = (target: EnvName) => `/o/${orgId}/${target}${target === 'live' && subpath.startsWith('/playground') ? '' : subpath}`;

  const nav = (
    <Sidebar
      base={base}
      env={env}
      subpath={subpath}
      orgSwitcher={<OrgSwitcher currentId={orgId} currentName={org.name} />}
      footer={<UserMenu name={user.name} email={user.email} isOperator={Boolean(user.isOperator)} />}
    />
  );

  const current = currentPage(subpath);

  return (
    // lg+: the sidebar sits on the darker "shell" color and the page is an inset,
    // rounded panel that scrolls on its own. Smaller screens use a normal page.
    <div className="min-h-screen bg-page lg:h-screen lg:overflow-hidden lg:bg-shell lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{nav}</aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#01061a]/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-shell"
            >
              <button onClick={() => setDrawer(false)} className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Close menu">
                <X className="size-4" />
              </button>
              {nav}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:h-full lg:py-2 lg:pr-2">
        <div
          ref={scroller}
          className="relative lg:h-full lg:overflow-y-auto lg:rounded-xl lg:border lg:border-line lg:bg-page lg:shadow-soft"
        >
          {/* Sandbox gets a thin amber edge instead of a full-width banner. */}
          {env === 'sandbox' && <div className="sticky top-0 z-30 h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500" />}
          <header className="sticky top-0 z-20 border-b border-line/70 bg-page/75 backdrop-blur-xl">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-8">
              <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-1.5 text-ink hover:bg-subtle lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                <Link href={base} className="hidden truncate rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-subtle hover:text-ink sm:inline">
                  {org.name}
                </Link>
                <ChevronRight className="hidden size-3.5 shrink-0 text-muted/60 sm:block" />
                {current.detail ? (
                  <>
                    <Link href={`${base}${current.href}`} className="truncate rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-subtle hover:text-ink">
                      {current.label}
                    </Link>
                    <ChevronRight className="size-3.5 shrink-0 text-muted/60" />
                    <span aria-current="page" className="truncate px-1 font-medium text-ink">
                      Details
                    </span>
                  </>
                ) : (
                  <span aria-current="page" className="truncate px-1 font-medium text-ink">
                    {current.label}
                  </span>
                )}
              </nav>
              {env === 'sandbox' && (
                <span
                  title="Sandbox: test data only. Messages go through the shared Telenotify sandbox bot."
                  className="hidden shrink-0 items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-400/30 md:inline-flex dark:text-amber-300"
                >
                  <FlaskConical className="size-3" /> Test data
                </span>
              )}
              <button
                onClick={() => setPalette(true)}
                className="ml-auto hidden w-56 items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 py-1.5 text-sm text-muted transition-colors hover:border-muted/40 hover:text-ink md:flex"
              >
                <Search className="size-4" /> Search…
                <kbd className="ml-auto rounded-md border border-line bg-subtle px-1.5 font-sans text-[10px] font-medium">⌘K</kbd>
              </button>
              <button onClick={() => setPalette(true)} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-subtle md:hidden" aria-label="Search">
                <Search className="size-5" />
              </button>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <EnvSwitch env={env} hrefFor={switchTo} />
            </div>
          </header>

          <CommandPalette orgId={orgId} env={env} open={palette} onOpenChange={setPalette} />
          <WelcomeTour storageKey={`tn_tour_done:${user.id}`} />

          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
            <OrgStatusBanner org={org} env={env} botHref={`${base}/bot`} onBotPage={subpath.startsWith('/bot')} />
            <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}

// The sidebar entry for the current path, for the breadcrumb.
function currentPage(subpath: string): { label: string; href: string; detail: boolean } {
  const items = groups.flatMap((g) => g.items);
  if (subpath === '' || subpath === '/') return { label: 'Get started', href: '', detail: false };
  const match = items.filter((i) => i.href && subpath.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return { label: 'Dashboard', href: '', detail: false };
  return { label: match.label, href: match.href, detail: subpath.length > match.href.length + 1 };
}

function Sidebar({ base, env, subpath, orgSwitcher, footer }: { base: string; env: EnvName; subpath: string; orgSwitcher: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href={base} className="inline-block">
          <Logo suffix="Developers" />
        </Link>
      </div>
      <div className="px-3 pt-1">{orgSwitcher}</div>
      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => {
          const items = group.items.filter((i) => !(i.sandboxOnly && env === 'live'));
          return (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-xs font-medium tracking-[-0.005em] text-muted/70">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === '' ? subpath === '' : subpath.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={`${base}${item.href}`}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition-colors',
                          active ? 'font-medium text-ink' : 'text-muted hover:bg-surface/60 hover:text-ink',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-lg bg-surface shadow-soft ring-1 ring-line"
                            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                          />
                        )}
                        <item.icon className={cn('relative size-4 transition-colors', active ? 'text-brand' : 'text-muted/80 group-hover:text-ink')} />
                        <span className="relative">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="p-3">{footer}</div>
    </div>
  );
}

function EnvSwitch({ env, hrefFor }: { env: EnvName; hrefFor: (env: EnvName) => string }) {
  return (
    <div className="relative flex shrink-0 rounded-xl border border-line bg-subtle p-0.5 text-[13px]">
      {(['sandbox', 'live'] as const).map((target) => (
        <Link key={target} href={hrefFor(target)} className="relative px-3 py-1 font-medium capitalize">
          {env === target && (
            <motion.span
              layoutId="env-pill"
              className={cn('absolute inset-0 rounded-lg shadow-soft', target === 'sandbox' ? 'bg-amber-400' : 'bg-emerald-500')}
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className={cn('relative flex items-center gap-1.5', env === target ? (target === 'sandbox' ? 'text-amber-950' : 'text-white') : 'text-muted hover:text-ink')}>
            {target === 'live' && <span className={cn('size-1.5 rounded-full', env === 'live' ? 'bg-white' : 'bg-emerald-500')} />}
            {target}
          </span>
        </Link>
      ))}
    </div>
  );
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
}

function OrgSwitcher({ currentId, currentName }: { currentId: string; currentName: string }) {
  const router = useProgressRouter();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const { data: orgs } = useSWR<OrgSummary[]>('/portal/orgs', fetcher);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 text-left shadow-soft transition-colors hover:border-muted/30"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#2b5278] text-xs font-medium text-white">
          {currentName.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{currentName}</span>
        <ChevronsUpDown className="size-4 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-40 mt-1.5 rounded-xl border border-line bg-surface p-1 shadow-lift"
          >
            {(orgs ?? []).map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setOpen(false);
                  router.push(`/o/${o.id}/sandbox`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-subtle"
              >
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.id === currentId && <Check className="size-4 text-brand" />}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <Link href="/onboarding" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-subtle hover:text-ink">
              <Plus className="size-4" /> New organization
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ name, email, isOperator }: { name: string; email: string; isOperator: boolean }) {
  const router = useProgressRouter();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 bottom-full z-40 mb-1.5 rounded-xl border border-line bg-surface p-1 shadow-lift"
          >
            <Link href="/account" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-subtle">
              <UserCog className="size-4 text-muted" /> Account settings
            </Link>
            {isOperator && (
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-subtle">
                <ShieldCheck className="size-4 text-muted" /> Admin
              </Link>
            )}
            <Link href="/" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-subtle">
              <Rocket className="size-4 text-muted" /> Telenotify home
            </Link>
            <button
              onClick={async () => {
                await api('/auth/logout', { method: 'POST' });
                router.replace('/login');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-subtle"
            >
              <LogOut className="size-4 text-muted" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface/70" aria-label="Account menu">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-muted">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted" />
      </button>
    </div>
  );
}

// Shown above every page: a suspended organization, or live sending still capped.
function OrgStatusBanner({ org, env, botHref, onBotPage }: { org: Org; env: EnvName; botHref: string; onBotPage: boolean }) {
  if (org.status === 'suspended') {
    return (
      <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">This organization is suspended</p>
          <p className="mt-0.5">
            {org.suspendedReason ?? 'Sending is disabled.'} API keys are rejected and no messages are sent. Contact Telenotify support if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }
  if (env === 'live' && !org.liveApproved && !onBotPage) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldCheck className="size-5 shrink-0" />
        <p className="min-w-0 flex-1">
          {org.liveReviewRequestedAt
            ? `Review requested. Until it's approved, you can send ${org.unapprovedDailyLimit} live messages a day.`
            : `Live sending is limited to ${org.unapprovedDailyLimit} messages a day until your organization is approved.`}
        </p>
        {!org.liveReviewRequestedAt && (
          <Link href={botHref} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
            Request review
          </Link>
        )}
      </div>
    );
  }
  return null;
}
