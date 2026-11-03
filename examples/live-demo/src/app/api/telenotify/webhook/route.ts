import { NextResponse } from 'next/server';
import { webhooks, WebhookSignatureError } from '@telenotify/node';
import { config } from '@/lib/telenotify';
import { addLog, firstTimeSeen, sessionForCustomer } from '@/lib/store';

type Data = Record<string, unknown>;

// Telenotify calls this for every event. The signature is checked against the raw body
// before anything is trusted; a bad signature gets 400 and is ignored.
export async function POST(request: Request) {
  const raw = await request.text();
  let event;
  try {
    event = webhooks.constructEvent<Data>(raw, request.headers.get('x-telenotify-signature'), config.signingSecret);
  } catch (error) {
    if (error instanceof WebhookSignatureError) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!firstTimeSeen(event.id)) return NextResponse.json({ ok: true, duplicate: true });

  const { data } = event;
  const session = sessionForCustomer(data.externalId ?? data.to);
  if (!session) return NextResponse.json({ ok: true });

  session.webhooksReceived++;
  addLog(session, { kind: 'webhook', title: TITLES[event.event] ?? event.event, event: event.event, eventId: event.id, data });

  const v = session.verification;
  if (event.event === 'verification.completed' && v && data.id === v.id) {
    v.status = 'VERIFIED';
    v.url = null;
    session.phone = typeof data.phone === 'string' ? data.phone : session.phone;
    session.verifiedAt = typeof data.verifiedAt === 'string' ? data.verifiedAt : new Date().toISOString();
    session.verifiedBy ??= 'webhook';
  }
  if (event.event === 'verification.failed' && v && data.id === v.id) {
    v.status = 'FAILED';
    v.url = null;
  }
  if (event.event === 'message.received' && typeof data.text === 'string') {
    addLog(session, { kind: 'note', tone: 'reply', title: 'You replied in Telegram', detail: data.text.slice(0, 500) });
  }
  return NextResponse.json({ ok: true });
}

const TITLES: Record<string, string> = {
  'verification.completed': 'Telenotify: the number is verified',
  'verification.failed': 'Telenotify: the verification failed',
  'customer.linked': 'Telenotify: customer linked for notifications',
  'customer.blocked': 'Telenotify: the customer blocked the bot',
  'message.sent': 'Telenotify: Telegram delivered the message',
  'message.undeliverable': 'Telenotify: the message could not be delivered',
  'message.failed': 'Telenotify: the message failed',
  'message.received': 'Telenotify: the customer sent a message',
};
