import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

// Fixed one-second windows shared by every worker through Redis. Telegram allows a bot
// roughly 30 messages per second, and roughly 1 per second to one chat; we stay under
// both. If Telegram still answers 429, the whole bot waits for as long as it asks.
@Injectable()
export class BotRateLimiter implements OnModuleDestroy {
  private readonly redis: IORedis;
  readonly perSecond: number;

  constructor(config: ConfigService) {
    this.redis = new IORedis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: Number(config.get('REDIS_PORT', 6379)),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.perSecond = Number(config.get('PER_BOT_MESSAGES_PER_SECOND', 25));
  }

  /** true if this bot may send now; false means wait for the next second. */
  async tryAcquire(botKey: string, now = Date.now()): Promise<boolean> {
    const key = `tn:rl:bot:${botKey}:${Math.floor(now / 1000)}`;
    const results = await this.redis.multi().incr(key).pexpire(key, 2000).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    return count <= this.perSecond;
  }

  /** true if this customer's chat may get a message now. */
  async tryAcquireChat(botKey: string, chatKey: string, now = Date.now()): Promise<boolean> {
    const key = `tn:rl:chat:${botKey}:${chatKey}:${Math.floor(now / 1000)}`;
    const results = await this.redis.multi().incr(key).pexpire(key, 2000).exec();
    return Number(results?.[0]?.[1] ?? 0) <= 1;
  }

  /** Stops this bot's sends until Telegram's retry_after has passed; returns when that is. */
  async pause(botKey: string, seconds: number, now = Date.now()): Promise<number> {
    const until = now + seconds * 1000;
    await this.redis.set(`tn:rl:pause:${botKey}`, String(until), 'PX', seconds * 1000);
    return until;
  }

  /** When this bot's pause ends, or 0 if it isn't paused. */
  async pausedUntil(botKey: string, now = Date.now()): Promise<number> {
    const until = Number((await this.redis.get(`tn:rl:pause:${botKey}`)) ?? 0);
    return until > now ? until : 0;
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
