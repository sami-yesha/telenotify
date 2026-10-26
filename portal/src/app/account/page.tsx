'use client';

import { ArrowLeft, Check, KeyRound, Mail, Monitor, Moon, Palette, ShieldAlert, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { PasswordInput } from '@/components/password-input';
import { SplashScreen } from '@/components/splash';
import { useTheme } from '@/components/theme-toggle';
import { Alert, Badge, Button, Dialog, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRequireUser } from '@/lib/hooks';
import { isStrongPassword } from '@/lib/password';
import type { Theme } from '@/lib/theme';

function useAction() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; done: string | null }>({ loading: false, error: null, done: null });
  async function run(action: () => Promise<unknown>, done: string) {
    setState({ loading: true, error: null, done: null });
    try {
      await action();
      setState({ loading: false, error: null, done });
      return true;
    } catch (e) {
      setState({ loading: false, error: e instanceof ApiError ? e.message : 'Something went wrong', done: null });
      return false;
    }
  }
  const fail = (error: string) => setState({ loading: false, error, done: null });
  return { ...state, run, fail };
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'sign-in', label: 'Sign-in methods', icon: ShieldCheck },
  { id: 'password', label: 'Password', icon: KeyRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'danger', label: 'Danger zone', icon: ShieldAlert },
] as const;

export default function AccountPage() {
  const router = useRouter();
  const { user, mutate } = useRequireUser();
  const profile = useAction();
  const password = useAction();
  const removal = useAction();
  const [deleting, setDeleting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordFormKey, setPasswordFormKey] = useState(0);
  const active = useActiveSection(Boolean(user));

  if (!user) return <SplashScreen messages={['Loading your account…']} />;

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-page/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard">
            <Logo suffix="Developers" />
          </Link>
          <Link href="/dashboard" className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Profile header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border border-line bg-surface"
        >
          <div className="tg-panel h-28 sm:h-32" />
          <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:gap-5 sm:px-8">
            <span className="-mt-12 grid size-24 shrink-0 place-items-center rounded-full border-4 border-surface bg-[#2b5278] font-display text-3xl font-normal text-white">
              {initials || '?'}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate font-display text-[2rem] font-normal leading-[1.05] text-ink">{user.name}</h1>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              <Badge tone={user.emailVerified ? 'green' : 'amber'} dot>
                {user.emailVerified ? 'Email verified' : 'Email not verified'}
              </Badge>
              {user.googleLinked && (
                <Badge tone="blue" dot>
                  Google linked
                </Badge>
              )}
              {user.hasPassword && <Badge dot>Password set</Badge>}
            </div>
          </div>
        </motion.section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Section navigation */}
          <nav className="hidden lg:block" aria-label="Account sections">
            <ul className="sticky top-24 space-y-0.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      active === section.id ? 'font-medium text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    {active === section.id && (
                      <motion.span layoutId="account-nav" className="absolute inset-0 rounded-lg bg-surface shadow-soft ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                    )}
                    <section.icon className={cn('relative size-4', active === section.id ? (section.id === 'danger' ? 'text-red-500' : 'text-brand') : '')} />
                    <span className="relative">{section.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-6">
            <Section id="profile" title="Profile" description="How you appear to teammates and in the audit log.">
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get('name');
                  if (await profile.run(() => api('/auth/me', { method: 'PATCH', body: { name } }), 'Profile saved.')) mutate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="name" label="Full name" defaultValue={user.name} required maxLength={100} />
                  <Input label="Email" value={user.email} disabled hint="Your email can't be changed yet." />
                </div>
                <Feedback error={profile.error} done={profile.done} />
                <div className="flex justify-end">
                  <Button type="submit" loading={profile.loading}>
                    Save profile
                  </Button>
                </div>
              </form>
            </Section>

            <Section id="sign-in" title="Sign-in methods" description="Ways you can sign in to Telenotify.">
              <ul className="divide-y divide-line/70">
                <MethodRow
                  icon={<Mail className="size-5" />}
                  title="Email and password"
                  detail={user.hasPassword ? user.email : 'No password set: you sign in with Google.'}
                  status={user.hasPassword ? <Badge tone="green" dot>Active</Badge> : <Badge>Not set</Badge>}
                  action={
                    !user.hasPassword && (
                      <a href="#password" className="text-sm font-medium text-brand hover:underline">
                        Set a password
                      </a>
                    )
                  }
                />
                <MethodRow
                  icon={<GoogleIcon />}
                  title="Google"
                  detail={user.googleLinked ? 'Sign in with your Google account.' : 'Link Google to sign in with one click.'}
                  status={user.googleLinked ? <Badge tone="green" dot>Linked</Badge> : <Badge>Not linked</Badge>}
                  action={
                    !user.googleLinked && (
                      <a href="/api/auth/google" className="inline-flex items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-soft hover:bg-subtle">
                        Link Google
                      </a>
                    )
                  }
                />
              </ul>
            </Section>

            <Section
              id="password"
              title={user.hasPassword ? 'Change password' : 'Set a password'}
              description={user.hasPassword ? 'Other devices are signed out when you change it.' : 'Add a password to also sign in with your email.'}
            >
              <form
                key={passwordFormKey}
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  const next = String(data.get('newPassword') ?? '');
                  if (!isStrongPassword(next)) return password.fail('Choose a stronger password: it needs every item in the checklist.');
                  if (next !== data.get('confirm')) return password.fail('New passwords do not match.');
                  const ok = await password.run(
                    () => api('/auth/change-password', { method: 'POST', body: { currentPassword: data.get('currentPassword') || undefined, newPassword: next } }),
                    'Password updated. Other devices were signed out.',
                  );
                  if (ok) {
                    setNewPassword('');
                    setPasswordFormKey((k) => k + 1);
                    mutate();
                  }
                }}
                className="space-y-4"
              >
                {user.hasPassword && <PasswordInput name="currentPassword" label="Current password" autoComplete="current-password" required />}
                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordInput name="newPassword" label="New password" autoComplete="new-password" minLength={8} required showStrength onChange={(e) => setNewPassword(e.target.value)} />
                  <PasswordInput name="confirm" label="Confirm new password" autoComplete="new-password" minLength={8} required matchWith={newPassword} />
                </div>
                <Feedback error={password.error} done={password.done} />
                <div className="flex justify-end">
                  <Button type="submit" loading={password.loading}>
                    {user.hasPassword ? 'Change password' : 'Set password'}
                  </Button>
                </div>
              </form>
            </Section>

            <Section id="appearance" title="Appearance" description="Saved in this browser.">
              <ThemePicker />
            </Section>

            <Section id="danger" title="Danger zone" description="Permanent actions. Take care." danger>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">Delete your account</p>
                  <p className="mt-0.5 max-w-md text-sm text-muted">Organizations where you&apos;re the only member are deleted too. Shared organizations stay.</p>
                </div>
                <Button variant="danger" onClick={() => setDeleting(true)}>
                  Delete my account
                </Button>
              </div>
            </Section>
          </div>
        </div>
      </div>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title="Delete your account?" description="This can't be undone. Organizations you share with others stay, and your actions remain in their audit log.">
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const confirmEmail = new FormData(e.currentTarget).get('confirmEmail');
            if (await removal.run(() => api('/auth/me', { method: 'DELETE', body: { confirmEmail } }), '')) router.replace('/');
          }}
          className="space-y-4"
        >
          <Input name="confirmEmail" type="email" label={`Type ${user.email} to confirm`} required autoComplete="off" />
          {removal.error && <Alert>{removal.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={removal.loading}>
              Delete account
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Section({ id, title, description, danger, children }: { id: string; title: string; description?: string; danger?: boolean; children: ReactNode }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('scroll-mt-24 rounded-xl border bg-surface shadow-soft', danger ? 'border-red-200 dark:border-red-900/50' : 'border-line')}
    >
      <header className={cn('border-b px-5 py-4 sm:px-6', danger ? 'border-red-200/70 dark:border-red-900/40' : 'border-line/70')}>
        <h2 className={cn('text-[15px] font-semibold tracking-tight', danger ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </motion.section>
  );
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) return <Alert>{error}</Alert>;
  if (done) return <Alert tone="green">{done}</Alert>;
  return null;
}

function MethodRow({ icon, title, detail, status, action }: { icon: ReactNode; title: string; detail: string; status: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-ink ring-1 ring-inset ring-line">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {title} {status}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted">{detail}</p>
      </div>
      {action}
    </li>
  );
}

const THEMES: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Theme choice with a small preview of each.
function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              'group overflow-hidden rounded-xl border text-left transition-all',
              selected ? 'border-brand ring-4 ring-brand/15' : 'border-line hover:border-muted/40',
            )}
          >
            <ThemePreview kind={option.value} />
            <span className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 text-sm font-medium text-ink">
              <option.icon className="size-4 text-muted" />
              {option.label}
              <span className={cn('ml-auto grid size-5 place-items-center rounded-full bg-brand text-white transition-opacity', selected ? 'opacity-100' : 'opacity-0')}>
                <Check className="size-3" strokeWidth={3} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThemePreview({ kind }: { kind: Theme }) {
  const pane = (dark: boolean) => (
    <div className={cn('flex h-full gap-1.5 p-2.5', dark ? 'bg-[#070b14]' : 'bg-[#f1f4f9]')}>
      <div className={cn('w-1/4 space-y-1 rounded-md p-1.5', dark ? 'bg-[#0d1320]' : 'bg-white')}>
        <div className="h-1.5 w-3/4 rounded-full bg-brand" />
        <div className={cn('h-1 rounded-full', dark ? 'bg-white/15' : 'bg-slate-200')} />
        <div className={cn('h-1 rounded-full', dark ? 'bg-white/15' : 'bg-slate-200')} />
      </div>
      <div className={cn('flex-1 space-y-1.5 rounded-md p-1.5', dark ? 'bg-[#0d1320]' : 'bg-white')}>
        <div className={cn('h-1.5 w-1/2 rounded-full', dark ? 'bg-white/30' : 'bg-slate-300')} />
        <div className="grid grid-cols-2 gap-1">
          <div className={cn('h-5 rounded', dark ? 'bg-white/10' : 'bg-slate-100')} />
          <div className={cn('h-5 rounded', dark ? 'bg-white/10' : 'bg-slate-100')} />
        </div>
      </div>
    </div>
  );
  if (kind === 'system') {
    return (
      <div className="relative h-20">
        <div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">{pane(false)}</div>
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{pane(true)}</div>
      </div>
    );
  }
  return <div className="h-20">{pane(kind === 'dark')}</div>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 9.9l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

// Which section is in view, for the side navigation: the last one whose top has
// passed a third of the way down the window, or the last section at the bottom.
function useActiveSection(ready: boolean) {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (!ready) return;
    const update = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) return setActive(SECTIONS[SECTIONS.length - 1].id);
      let current: string = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const top = document.getElementById(section.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= window.innerHeight / 3) current = section.id;
      }
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ready]);
  return active;
}
