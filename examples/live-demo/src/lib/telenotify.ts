import { Telenotify, TelenotifyError } from '@telenotify/node';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { addLog, createSession, DemoSession, getSession, limit, newSessionId, NewLogEntry } from './store';

export const COOKIE = 'tn_demo';

export const config = {
  apiKey: process.env.TELENOTIFY_API_KEY ?? '',
  apiUrl: process.env.TELENOTIFY_API_URL ?? 'https://telenotify-api.duckdns.org',
  signingSecret: process.env.TELENOTIFY_SIGNING_SECRET ?? '',
  publicUrl: (process.env.DEMO_PUBLIC_URL ?? '').replace(/\/$/, ''),
};

/**
 * A Telenotify client whose calls are written to this visitor's "behind the scenes"
 * log. The SDK accepts a custom fetch, so nothing about the SDK itself changes.
 */
export function clientFor(session: DemoSession, options: { record?: (entry: NewLogEntry) => void } = {}) {
  const record = options.record ?? ((entry: NewLogEntry) => addLog(session, entry));
  const loggingFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const started = Date.now();
    const response = await fetch(input, init);
    const text = await response.clone().text();
    record({
      kind: 'api',
      title: describe(method, url.pathname),
      method,
      path: url.pathname + url.search,
      status: response.status,
      ms: Date.now() - started,
      request: init?.body ? parse(String(init.body)) : undefined,
      response: parse(text),
    });
    return response;
  };
  return new Telenotify({ apiKey: config.apiKey, baseUrl: config.apiUrl, fetch: loggingFetch, maxRetries: 1 });
}

function describe(method: string, path: string): string {
  if (method === 'POST' && path === '/v1/verifications') return 'Your server started a verification';
  if (method === 'GET' && path.startsWith('/v1/verifications/')) return 'Your server checked the verification';
  if (method === 'POST' && path === '/v1/messages') return 'Your server sent a message';
  if (method === 'PUT' && path.startsWith('/v1/customers/')) return 'Your server saved a customer';
  return `${method} ${path}`;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text || undefined;
  }
}

/** The visitor's session, created on first use. */
export async function currentSession(create: boolean): Promise<{ session?: DemoSession; isNew: boolean; limited?: number }> {
  const jar = await cookies();
  const existing = getSession(jar.get(COOKIE)?.value);
  if (existing || !create) return { session: existing, isNew: false };
  const wait = limit(`sessions:${await clientIp()}`, 30, 60 * 60 * 1000);
  if (wait) return { isNew: false, limited: wait };
  return { session: createSession(newSessionId()), isNew: true };
}

export function withSessionCookie(response: NextResponse, session: DemoSession, isNew: boolean) {
  if (isNew) {
    response.cookies.set(COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.publicUrl.startsWith('https://'),
      path: '/',
      maxAge: 24 * 60 * 60,
    });
  }
  return response;
}

/** The visitor's address as Nginx passes it on (X-Real-IP), else the first X-Forwarded-For hop. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export function errorResponse(error: unknown) {
  if (error instanceof TelenotifyError) {
    return NextResponse.json({ error: error.message, code: error.code ?? null }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

export const tooMany = (seconds: number, what: string) =>
  NextResponse.json({ error: `You've reached the demo limit for ${what}. Try again in ${seconds < 90 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}.` }, { status: 429 });

export function configured(): boolean {
  return Boolean(config.apiKey && config.signingSecret);
}
