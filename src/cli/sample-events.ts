import { randomUUID } from 'crypto';
import { EnvironmentEvent } from '../webhooks/webhooks.service';

// Realistic payloads for `telenotify trigger <event>`, shaped exactly like the real
// events (see toMessageView and VerificationsService.toView). Ids start with "test_"
// so they are easy to spot, and the customer is the built-in test customer.
export const TRIGGERABLE_EVENTS = [
  'message.sent',
  'message.undeliverable',
  'message.failed',
  'message.received',
  'message.fallback_sent',
  'message.fallback_failed',
  'customer.linked',
  'customer.blocked',
  'verification.completed',
  'verification.failed',
  'webhook.test',
] as const satisfies readonly EnvironmentEvent[];

export type TriggerableEvent = (typeof TRIGGERABLE_EVENTS)[number];

export function sampleEvent(event: TriggerableEvent, now = new Date()): Record<string, unknown> {
  const at = now.toISOString();
  const id = `test_${randomUUID()}`;
  const message = (overrides: Record<string, unknown>) => ({
    id,
    to: 'test_linked',
    direction: 'OUTBOUND',
    status: 'SENT',
    priority: 'normal',
    template: null,
    locale: null,
    reason: null,
    text: '✅ **Payment received**\n\nAmount: **1,250 ETB**\nReference: `TX-88-4471`',
    format: 'markdown',
    plainText: '✅ Payment received\n\nAmount: 1,250 ETB\nReference: TX-88-4471',
    buttons: null,
    idempotencyKey: null,
    error: null,
    attempts: 1,
    fallback: null,
    sentAt: at,
    createdAt: at,
    ...overrides,
  });
  const verification = (overrides: Record<string, unknown>) => ({
    id,
    status: 'VERIFIED',
    reason: null,
    method: 'telegram',
    externalId: 'test_linked',
    phone: '251911223344',
    url: null,
    hostedUrl: null,
    returnUrl: null,
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    verifiedAt: at,
    createdAt: at,
    ...overrides,
  });

  switch (event) {
    case 'message.sent':
      return message({});
    case 'message.undeliverable':
      return message({ status: 'UNDELIVERABLE', reason: 'not_linked', sentAt: null, attempts: 0 });
    case 'message.failed':
      return message({ status: 'FAILED', reason: 'telegram_unavailable', error: 'Telegram kept failing after 5 attempts', sentAt: null, attempts: 5 });
    case 'message.received':
      return message({ direction: 'INBOUND', status: 'RECEIVED', text: 'Thank you! 🙏', format: 'plain', plainText: 'Thank you! 🙏', sentAt: null, attempts: 0 });
    case 'message.fallback_sent':
      return message({ status: 'UNDELIVERABLE', reason: 'not_linked', sentAt: null, fallback: { channel: 'sms', status: 'sent', error: null, at } });
    case 'message.fallback_failed':
      return message({ status: 'UNDELIVERABLE', reason: 'not_linked', sentAt: null, fallback: { channel: 'sms', status: 'failed', error: 'AfroMessage rejected the SMS: insufficient balance', at } });
    case 'customer.linked':
      return { externalId: 'test_linked', method: 'link' };
    case 'customer.blocked':
      return { externalId: 'test_linked' };
    case 'verification.completed':
      return verification({});
    case 'verification.failed':
      return verification({ status: 'FAILED', reason: 'phone_mismatch', verifiedAt: null, phone: '251922334455' });
    case 'webhook.test':
      return { message: 'Hello from Telenotify 👋' };
  }
}
