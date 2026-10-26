'use client';

import { KeyRound, LogOut, MailCheck, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Empty, Skeleton, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  lastSignInAt: string | null;
  orgs: { id: string; name: string; role: 'OWNER' | 'MEMBER'; status: 'ACTIVE' | 'SUSPENDED' }[];
}

export default function AdminUsers() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const { data: users, mutate } = useSWR<AdminUser[]>(`/admin/users${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`, fetcher);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  async function act(run: () => Promise<unknown>, done: string) {
    setNotice(null);
    try {
      await run();
      setNotice({ tone: 'green', text: done });
      await mutate();
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof ApiError ? e.message : 'Something went wrong' });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] font-normal leading-[1.05] text-ink sm:text-[1.75rem]">Users</h1>
          <p className="mt-1.5 text-sm text-muted">Everyone with a portal account. Newest first; showing up to 200.</p>
        </div>
        <label className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </label>
      </div>

      {notice && (
        <div className="mt-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
        {!users ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-6">
            <Empty title="No users found" icon={UserRound} />
          </div>
        ) : (
          <ul className="divide-y divide-line/70">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{u.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {u.name}
                    {u.emailVerified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">not verified</Badge>}
                    {u.hasPassword && (
                      <span title="Signs in with a password" className="text-muted">
                        <KeyRound className="size-3.5" />
                      </span>
                    )}
                    {u.googleLinked && <Badge tone="blue">Google</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {u.email} · joined {timeAgo(u.createdAt)}
                    {u.lastSignInAt ? ` · last sign-in ${timeAgo(u.lastSignInAt)}` : ''}
                  </p>
                  {u.orgs.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {u.orgs.map((o) => (
                        <span key={o.id} className={`rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${o.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400' : 'bg-subtle text-muted ring-line'}`}>
                          {o.name} · {o.role.toLowerCase()}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!u.emailVerified && (
                    <Button variant="secondary" className="py-1.5" onClick={() => act(() => api(`/admin/users/${u.id}/verify-email`, { method: 'POST' }), `${u.email} is now verified.`)}>
                      <MailCheck className="size-4" /> Mark verified
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="py-1.5"
                    onClick={() =>
                      confirm(`Sign ${u.email} out on every device?`) &&
                      act(() => api(`/admin/users/${u.id}/sign-out`, { method: 'POST' }), `${u.email} was signed out everywhere.`)
                    }
                  >
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
