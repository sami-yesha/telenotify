import { NextResponse } from 'next/server';
import { clientFor, configured, currentSession } from '@/lib/telenotify';
import { addLog, DemoSession, NewLogEntry } from '@/lib/store';

export const dynamic = 'force-dynamic';

// What the page shows, polled every couple of seconds.
export async function GET() {
  const { session } = await currentSession(false);
  if (session) await checkVerification(session);
  return NextResponse.json({
    configured: configured(),
    verification: session?.verification
      ? { status: session.verification.status, url: session.verification.url, qrSvg: session.verification.qrSvg, expiresAt: session.verification.expiresAt }
      : null,
    phone: session?.phone ?? null,
    verifiedBy: session?.verifiedBy ?? null,
    webhooksReceived: session?.webhooksReceived ?? 0,
    log: session?.log ?? [],
  });
}

const OPEN = ['PENDING', 'AWAITING_CONTACT'];

// The webhook normally tells us the result. As a safety net, an open verification is
// also checked every few seconds; that call is only shown when it finds something new.
async function checkVerification(session: DemoSession) {
  const v = session.verification;
  if (!v || !OPEN.includes(v.status) || Date.now() - v.lastCheckedAt < 4000) return;
  v.lastCheckedAt = Date.now();
  const calls: NewLogEntry[] = [];
  try {
    const latest = await clientFor(session, { record: (entry) => calls.push(entry) }).verifications.get(v.id);
    if (latest.status === v.status) return;
    calls.forEach((entry) => addLog(session, entry));
    v.status = latest.status;
    if (!OPEN.includes(latest.status)) v.url = null;
    if (latest.status === 'VERIFIED' && !session.verifiedAt) {
      session.phone = latest.phone;
      session.verifiedAt = latest.verifiedAt;
      session.verifiedBy = 'polling';
    }
  } catch {
    // Try again on the next poll.
  }
}
