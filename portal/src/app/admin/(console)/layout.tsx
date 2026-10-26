'use client';

import { ArrowLeft, Building2, Gauge, LogOut, Menu, Server, ShieldAlert, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { SplashScreen } from '@/components/splash';
import { ThemeToggle } from '@/components/theme-toggle';
import { Empty } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRequireUser } from '@/lib/hooks';

const NAV = [
  { href: '/admin', label: 'Overview', icon: Gauge },
  { href: '/admin/orgs', label: 'Organizations', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/system', label: 'System', icon: Server },
];

// Shell of the operator portal. Only emails in OPERATOR_EMAILS get past it; the API
// enforces the same rule on every /admin endpoint.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useRequireUser();
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);

  if (!user) return <SplashScreen messages={['Opening the admin portal…']} />;
  if (!user.isOperator) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <Empty title="Operators only" icon={ShieldAlert} action={{ label: 'Back to dashboard', href: '/dashboard' }}>
          You&apos;re signed in as {user.email}, which isn&apos;t an operator of this server.
        </Empty>
      </div>
    );
  }

  const current = NAV.filter((item) => (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href))).at(-1);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href="/admin">
          <Logo suffix="Admin" />
        </Link>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 px-3">
        <p className="px-3 pb-1.5 text-xs font-medium tracking-[-0.005em] text-muted/70">Operate</p>
        {NAV.map((item) => {
          const active = item === current;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition-colors', active ? 'font-medium text-ink' : 'text-muted hover:bg-surface/60 hover:text-ink')}
            >
              {active && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-lg bg-surface shadow-soft ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <item.icon className={cn('relative size-4', active ? 'text-brand' : 'text-muted/80 group-hover:text-ink')} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 p-3">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface/70 hover:text-ink">
          <ArrowLeft className="size-4" /> Developer dashboard
        </Link>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{user.name.charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
          <button
            onClick={async () => {
              await api('/auth/logout', { method: 'POST' });
              router.replace('/admin/login');
            }}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-page lg:h-screen lg:overflow-hidden lg:bg-shell lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#01061a]/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-y-0 left-0 w-64 border-r border-line bg-shell"
            >
              <button onClick={() => setDrawer(false)} className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Close menu">
                <X className="size-4" />
              </button>
              {sidebar}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:h-full lg:py-2 lg:pr-2">
        <div className="relative lg:h-full lg:overflow-y-auto lg:rounded-xl lg:border lg:border-line lg:bg-page lg:shadow-soft">
          <div className="sticky top-0 z-30 h-0.5 bg-brand" />
          <header className="sticky top-0 z-20 border-b border-line/70 bg-page/75 backdrop-blur-xl">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-8">
              <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-1.5 text-ink hover:bg-subtle lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <span className="text-sm text-muted">Admin</span>
              <span className="text-sm text-muted/60">/</span>
              <span className="text-sm font-medium text-ink">{current?.label}</span>
              <span className="ml-auto hidden rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-inset ring-brand/20 sm:inline">Operator</span>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
            <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
