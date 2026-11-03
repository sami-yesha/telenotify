import { NextResponse } from 'next/server';
import { clientFor, config, currentSession, errorResponse, tooMany } from '@/lib/telenotify';
import { buildMessage, isLocale, isSample } from '@/lib/samples';
import { customerId, limit } from '@/lib/store';

// Step 2: send the verified visitor a real Telegram notification.
export async function POST(request: Request) {
  const { session } = await currentSession(false);
  if (!session?.verifiedAt) return NextResponse.json({ error: 'Verify your number first.' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; locale?: unknown };
  if (!isSample(body.kind) || !isLocale(body.locale)) return NextResponse.json({ error: 'Pick a message and a language.' }, { status: 400 });

  const wait = limit(`notify:${session.id}`, 10, 15 * 60 * 1000) || limit('notify:all', 400, 24 * 60 * 60 * 1000);
  if (wait) return tooMany(wait, 'messages');

  try {
    const message = buildMessage(body.kind, body.locale, config.publicUrl);
    const sent = await clientFor(session).messages.send({ to: customerId(session), fallback: false, ...message });
    return NextResponse.json({ status: sent.status, reason: sent.reason });
  } catch (error) {
    return errorResponse(error);
  }
}
