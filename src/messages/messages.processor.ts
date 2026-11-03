import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job } from 'bullmq';
import { TelegramApiError } from '../telegram/telegram-api.client';
import { BotRateLimiter } from './bot-rate-limiter.service';
import { DeliveryService } from './delivery.service';
import { DeliverJob, JOB_PRIORITY, MESSAGES_QUEUE } from './messages.constants';

// Used if Telegram answers 429 without saying how long to wait.
const DEFAULT_RETRY_AFTER_SECONDS = 5;

// Rate limits are per bot (see BotRateLimiter), so one busy organization can't slow
// down the others. HIGH-priority jobs are picked before NORMAL ones.
@Processor(MESSAGES_QUEUE, { concurrency: 20 })
export class MessagesProcessor extends WorkerHost {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly limiter: BotRateLimiter,
  ) {
    super();
  }

  async process(job: Job<DeliverJob>, token?: string): Promise<void> {
    const { botKey, chatKey } = job.data;
    const high = job.opts.priority === JOB_PRIORITY.HIGH;
    if (botKey) {
      const until = await this.limiter.pausedUntil(botKey);
      if (until) return this.delay(job, resumeAfter(until, high), token);
      // The chat comes first, so a message held back for its chat doesn't use the bot's budget.
      const allowed = (!chatKey || (await this.limiter.tryAcquireChat(botKey, chatKey))) && (await this.limiter.tryAcquire(botKey));
      // Come back when the next second starts, without using an attempt. High-priority
      // jobs return first, so they get the new budget before normal ones.
      if (!allowed) return this.delay(job, nextWindowStart(high), token);
    }
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      await this.delivery.deliver(job.data.messageId, isFinalAttempt);
    } catch (error) {
      if (!botKey || !(error instanceof TelegramApiError) || error.errorCode !== 429) throw error;
      const until = await this.limiter.pause(botKey, error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS);
      return this.delay(job, resumeAfter(until, high), token);
    }
  }

  private async delay(job: Job<DeliverJob>, when: number, token?: string): Promise<never> {
    await job.moveToDelayed(when, token);
    throw new DelayedError();
  }
}

export function nextWindowStart(high: boolean, now = Date.now()): number {
  const boundary = now - (now % 1000) + 1000;
  return resumeAfter(boundary, high);
}

function resumeAfter(time: number, high: boolean): number {
  return high ? time + Math.floor(Math.random() * 20) : time + 100 + Math.floor(Math.random() * 200);
}
