export const MESSAGES_QUEUE = 'messages';

export interface DeliverJob {
  messageId: string;
  // Rate-limit bucket: the live environment's own bot, or "sandbox" for the shared bot.
  botKey?: string;
  // The customer's chat, for the per-chat limit. Left out for simulated test customers.
  chatKey?: string;
}

// A 429 doesn't use one of the queue's attempts, because the wait is Telegram's choice
// and can outlast them all. This cap stops a message from retrying forever.
export const MAX_RATE_LIMITED_TRIES = 20;

// BullMQ priorities: lower runs first.
export const JOB_PRIORITY = { HIGH: 1, NORMAL: 10 } as const;
