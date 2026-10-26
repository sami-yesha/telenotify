import { Customer, Message } from '@prisma/client';
import { plainTextOf } from './rich-text';

// The public shape of a message (API responses and webhook events). Kept apart from
// MessagesService so services it depends on can use it without a circular import.
export function toMessageView(message: Message & { customer: Customer }) {
  return {
    id: message.id,
    to: message.customer.externalId,
    direction: message.direction,
    status: message.status,
    priority: message.priority.toLowerCase(),
    template: message.templateKey,
    locale: message.locale,
    reason: message.reason,
    text: message.text,
    format: message.format.toLowerCase(),
    // The text without formatting, e.g. to send it by SMS yourself.
    plainText: plainTextOf(message.text, message.format),
    buttons: message.buttons,
    idempotencyKey: message.idempotencyKey,
    error: message.error,
    attempts: message.attempts,
    // Set when SMS fallback is on and Telegram couldn't deliver.
    fallback: message.fallbackStatus
      ? {
          channel: 'sms',
          status: message.fallbackStatus.toLowerCase(),
          error: message.fallbackError,
          at: message.fallbackAt,
        }
      : null,
    sentAt: message.sentAt,
    createdAt: message.createdAt,
  };
}
