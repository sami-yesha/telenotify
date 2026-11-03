import { NextResponse } from 'next/server';
import { clientFor, currentSession, errorResponse, tooMany } from '@/lib/telenotify';
import { formatPhone, isLocale, smsText } from '@/lib/samples';
import { addLog, limit, smsCustomerId } from '@/lib/store';

// Step 3: what happens when a customer isn't on Telegram. The message goes to a
// customer that was never linked, so Telenotify really answers UNDELIVERABLE. The SMS
// itself is shown, not sent: the demo doesn't spend anyone's SMS balance.
export async function POST(request: Request) {
  const { session } = await currentSession(false);
  if (!session?.verifiedAt || !session.phone) return NextResponse.json({ error: 'Verify your number first.' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { locale?: unknown };
  const locale = isLocale(body.locale) ? body.locale : 'en';

  const wait = limit(`sms:${session.id}`, 5, 15 * 60 * 1000);
  if (wait) return tooMany(wait, 'fallback tests');

  try {
    const telenotify = clientFor(session);
    const to = smsCustomerId(session);
    await telenotify.customers.upsert(to, { phone: session.phone, locale });
    const text = smsText(locale);
    const sent = await telenotify.messages.send({ to, text, fallback: false });
    if (sent.status === 'UNDELIVERABLE') {
      addLog(session, {
        kind: 'note',
        tone: 'sms',
        title: 'SMS fallback takes over (simulated)',
        detail: `Telegram can't reach this customer (${sent.reason}). With SMS fallback on, Telenotify sends this through your own AfroMessage account to ${formatPhone(session.phone)}:\n\n${sent.plainText}`,
      });
    }
    return NextResponse.json({ status: sent.status, reason: sent.reason });
  } catch (error) {
    return errorResponse(error);
  }
}
