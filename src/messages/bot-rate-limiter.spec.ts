import { DelayedError } from 'bullmq';
import { TelegramApiError } from '../telegram/telegram-api.client';
import { BotRateLimiter } from './bot-rate-limiter.service';
import { MessagesProcessor, nextWindowStart } from './messages.processor';

// In-memory stand-in for the two Redis commands the limiter uses.
function fakeRedis() {
  const counts = new Map<string, number>();
  const values = new Map<string, string>();
  return {
    async set(key: string, value: string) {
      values.set(key, value);
    },
    async get(key: string) {
      return values.get(key) ?? null;
    },
    multi() {
      const ops: string[] = [];
      const chain = {
        incr(key: string) {
          ops.push(key);
          return chain;
        },
        pexpire() {
          return chain;
        },
        async exec() {
          const key = ops[0];
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return [[null, counts.get(key)], [null, 1]];
        },
      };
      return chain;
    },
    disconnect() {},
  };
}

function limiter(perSecond: number) {
  const config = { get: (key: string, fallback: unknown) => (key === 'PER_BOT_MESSAGES_PER_SECOND' ? perSecond : fallback) };
  const l = new BotRateLimiter(config as any);
  (l as any).redis = fakeRedis();
  return l;
}

describe('BotRateLimiter', () => {
  it('allows up to the limit per bot per second, then refuses', async () => {
    const l = limiter(2);
    const now = 1_000_000;
    expect(await l.tryAcquire('bot-a', now)).toBe(true);
    expect(await l.tryAcquire('bot-a', now)).toBe(true);
    expect(await l.tryAcquire('bot-a', now)).toBe(false);
  });

  it('keeps bots independent and resets each second', async () => {
    const l = limiter(1);
    const now = 2_000_000;
    expect(await l.tryAcquire('bot-a', now)).toBe(true);
    expect(await l.tryAcquire('bot-b', now)).toBe(true);
    expect(await l.tryAcquire('bot-a', now + 1000)).toBe(true);
  });
});

describe('BotRateLimiter chats and pauses', () => {
  it('allows one message per chat per second, per bot', async () => {
    const l = limiter(25);
    const t = 5_000;
    expect(await l.tryAcquireChat('bot-a', 'cus-1', t)).toBe(true);
    expect(await l.tryAcquireChat('bot-a', 'cus-1', t + 500)).toBe(false);
    expect(await l.tryAcquireChat('bot-a', 'cus-2', t)).toBe(true);
    expect(await l.tryAcquireChat('bot-b', 'cus-1', t)).toBe(true);
    expect(await l.tryAcquireChat('bot-a', 'cus-1', t + 1000)).toBe(true);
  });

  it('pauses one bot until the wait has passed', async () => {
    const l = limiter(25);
    expect(await l.pause('bot-a', 30, 1_000)).toBe(31_000);
    expect(await l.pausedUntil('bot-a', 2_000)).toBe(31_000);
    expect(await l.pausedUntil('bot-a', 31_000)).toBe(0);
    expect(await l.pausedUntil('bot-b', 2_000)).toBe(0);
  });
});

describe('MessagesProcessor rate limiting', () => {
  function setup(limits: object = {}, deliver = jest.fn()) {
    const rateLimiter = {
      pausedUntil: jest.fn().mockResolvedValue(0),
      tryAcquire: jest.fn().mockResolvedValue(true),
      tryAcquireChat: jest.fn().mockResolvedValue(true),
      pause: jest.fn().mockImplementation((_bot, seconds) => Promise.resolve(1_000_000 + seconds * 1000)),
      ...limits,
    };
    const job = { data: { messageId: 'm1', botKey: 'env-1', chatKey: 'cus-1' }, attemptsMade: 0, opts: { attempts: 5 }, moveToDelayed: jest.fn() } as any;
    return { processor: new MessagesProcessor({ deliver } as any, rateLimiter as any), rateLimiter, job, deliver };
  }

  it('delays the job (without using an attempt) when the bot is over its limit', async () => {
    const { processor, job, deliver } = setup({ tryAcquire: jest.fn().mockResolvedValue(false) });
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('holds a message back for its chat without using the bot budget', async () => {
    const { processor, job, deliver, rateLimiter } = setup({ tryAcquireChat: jest.fn().mockResolvedValue(false) });
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('skips the chat limit for jobs without a chat', async () => {
    const { processor, job, deliver, rateLimiter } = setup();
    delete job.data.chatKey;
    await processor.process(job, 'tok');
    expect(rateLimiter.tryAcquireChat).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalled();
  });

  it('delivers when the bot has budget', async () => {
    const { processor, job, deliver } = setup();
    await processor.process(job, 'tok');
    expect(deliver).toHaveBeenCalledWith('m1', false);
  });

  it('on a 429, pauses the bot for Telegram\'s retry_after and keeps the attempt', async () => {
    const deliver = jest.fn().mockRejectedValue(new TelegramApiError(429, 'Too Many Requests', 35));
    const { processor, job, rateLimiter } = setup({}, deliver);
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(rateLimiter.pause).toHaveBeenCalledWith('env-1', 35);
    expect(job.moveToDelayed.mock.calls[0][0]).toBeGreaterThanOrEqual(1_035_000);
  });

  it('waits a default time if a 429 has no retry_after', async () => {
    const deliver = jest.fn().mockRejectedValue(new TelegramApiError(429, 'Too Many Requests'));
    const { processor, job, rateLimiter } = setup({}, deliver);
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(rateLimiter.pause).toHaveBeenCalledWith('env-1', 5);
  });

  it('holds every message of a paused bot, without trying to send', async () => {
    const { processor, job, deliver, rateLimiter } = setup({ pausedUntil: jest.fn().mockResolvedValue(2_000_000) });
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed.mock.calls[0][0]).toBeGreaterThanOrEqual(2_000_000);
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('leaves other errors to the queue\'s normal retries', async () => {
    const deliver = jest.fn().mockRejectedValue(new TelegramApiError(502, 'Bad Gateway'));
    const { processor, job, rateLimiter } = setup({}, deliver);
    await expect(processor.process(job, 'tok')).rejects.toBeInstanceOf(TelegramApiError);
    expect(rateLimiter.pause).not.toHaveBeenCalled();
  });
});

describe('nextWindowStart', () => {
  it('brings high-priority jobs back before normal ones in the next second', () => {
    const now = 5_000_420;
    for (let i = 0; i < 50; i++) {
      const high = nextWindowStart(true, now);
      const normal = nextWindowStart(false, now);
      expect(high).toBeGreaterThanOrEqual(5_001_000);
      expect(high).toBeLessThan(normal);
    }
  });
});
