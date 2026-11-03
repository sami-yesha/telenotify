import { randomBytes } from 'crypto';

// Everything the demo remembers lives in memory and is forgotten after 24 hours.
// That's enough for one server process, which is how the demo runs.

export type LogEntry = { id: number; at: string; title: string } & (
  | { kind: 'api'; method: string; path: string; status: number; ms: number; request?: unknown; response?: unknown }
  | { kind: 'webhook'; event: string; eventId: string; data: unknown }
  | { kind: 'note'; tone: 'info' | 'sms' | 'reply' | 'warn'; detail?: string }
);

export type NewLogEntry = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'id' | 'at'> : never) : never;

export interface DemoSession {
  id: string;
  createdAt: number;
  verification: {
    id: string;
    status: string;
    url: string | null;
    qrSvg: string | null;
    expiresAt: string;
    lastCheckedAt: number;
  } | null;
  phone: string | null;
  verifiedAt: string | null;
  verifiedBy: 'webhook' | 'polling' | null;
  webhooksReceived: number;
  log: LogEntry[];
  nextLogId: number;
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_LOG = 80;

interface Store {
  sessions: Map<string, DemoSession>;
  hits: Map<string, number[]>;
  seenEvents: Map<string, number>;
  sweeper?: NodeJS.Timeout;
}

// Kept on globalThis so it survives hot reloads in development.
const g = globalThis as unknown as { __demoStore?: Store };
const store: Store = (g.__demoStore ??= { sessions: new Map(), hits: new Map(), seenEvents: new Map() });

if (!store.sweeper) {
  store.sweeper = setInterval(() => {
    const cutoff = Date.now() - DAY;
    for (const [id, session] of store.sessions) if (session.createdAt < cutoff) store.sessions.delete(id);
    for (const [id, at] of store.seenEvents) if (at < cutoff) store.seenEvents.delete(id);
    for (const [key, times] of store.hits) if (!times.some((t) => t > cutoff)) store.hits.delete(key);
  }, 10 * 60 * 1000);
  store.sweeper.unref?.();
}

export function newSessionId(): string {
  return randomBytes(12).toString('base64url');
}

export function getSession(id: string | undefined): DemoSession | undefined {
  if (!id) return undefined;
  const session = store.sessions.get(id);
  if (session && session.createdAt < Date.now() - DAY) {
    store.sessions.delete(id);
    return undefined;
  }
  return session;
}

export function createSession(id: string): DemoSession {
  const session: DemoSession = {
    id,
    createdAt: Date.now(),
    verification: null,
    phone: null,
    verifiedAt: null,
    verifiedBy: null,
    webhooksReceived: 0,
    log: [],
    nextLogId: 1,
  };
  store.sessions.set(id, session);
  return session;
}

export function deleteSession(id: string) {
  store.sessions.delete(id);
}

export function addLog(session: DemoSession, entry: NewLogEntry) {
  session.log.push({ ...entry, id: session.nextLogId++, at: new Date().toISOString() } as LogEntry);
  if (session.log.length > MAX_LOG) session.log.splice(0, session.log.length - MAX_LOG);
}

// The customer ids this demo uses at Telenotify: one per visitor, plus one that is
// never linked to Telegram, for the SMS fallback step.
export const customerId = (session: DemoSession) => `demo_${session.id}`;
export const smsCustomerId = (session: DemoSession) => `demo_${session.id}_sms`;

export function sessionForCustomer(externalId: unknown): DemoSession | undefined {
  if (typeof externalId !== 'string') return undefined;
  const match = /^demo_([A-Za-z0-9_-]{16})(?:_sms)?$/.exec(externalId);
  return match ? getSession(match[1]) : undefined;
}

/** Webhooks are retried, so the same event can arrive twice: handle it once. */
export function firstTimeSeen(eventId: string): boolean {
  if (store.seenEvents.has(eventId)) return false;
  store.seenEvents.set(eventId, Date.now());
  return true;
}

/** Sliding-window rate limit. Returns the seconds to wait, or 0 when allowed (and counts the hit). */
export function limit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const recent = (store.hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= max) {
    store.hits.set(key, recent);
    return Math.ceil((recent[0] + windowMs - now) / 1000);
  }
  recent.push(now);
  store.hits.set(key, recent);
  return 0;
}
