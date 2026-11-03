import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { clientFor, configured, currentSession, errorResponse, tooMany, withSessionCookie } from '@/lib/telenotify';
import { customerId, limit } from '@/lib/store';

// Step 1: start "Verify with Telegram" for this visitor.
export async function POST() {
  if (!configured()) return NextResponse.json({ error: 'The demo is not configured yet.' }, { status: 503 });
  const { session, isNew, limited } = await currentSession(true);
  if (!session) return tooMany(limited ?? 60, 'new visitors from your network');
  if (session.verifiedAt) return withSessionCookie(NextResponse.json({ ok: true }), session, isNew);

  const wait = limit(`verify:${session.id}`, 6, 60 * 60 * 1000);
  if (wait) return tooMany(wait, 'verifications');

  try {
    const verification = await clientFor(session).verifications.create({ externalId: customerId(session), expiresInMinutes: 10 });
    session.verification = {
      id: verification.id,
      status: verification.status,
      url: verification.url,
      qrSvg: verification.url ? await QRCode.toString(verification.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : null,
      expiresAt: verification.expiresAt,
      lastCheckedAt: Date.now(),
    };
    return withSessionCookie(NextResponse.json({ ok: true }), session, isNew);
  } catch (error) {
    return withSessionCookie(errorResponse(error), session, isNew);
  }
}
