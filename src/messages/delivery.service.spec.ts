import { TelegramApiError } from '../telegram/telegram-api.client';
import { DeliveryService } from './delivery.service';

function setup(overrides: { customer?: object; environment?: object; message?: object } = {}) {
  const customer = { id: 'cus-1', externalId: 'user_1', telegramChatId: '111', blockedAt: null, ...overrides.customer };
  const message = {
    id: 'msg-1',
    status: 'QUEUED',
    priority: 'NORMAL',
    text: 'Order shipped',
    format: 'PLAIN',
    buttons: [[{ text: 'Track', url: 'https://x.test/55' }]],
    customer,
    environment: { id: 'env-1', type: 'LIVE', org: { name: 'Abebe Pharmacy' }, ...overrides.environment },
    ...overrides.message,
  };
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(message),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...message, ...data, customer })),
    },
    customer: { update: jest.fn() },
  };
  const bot = { sendMessage: jest.fn().mockResolvedValue({ message_id: 42 }) };
  const telegram = { clientForEnvironment: jest.fn().mockReturnValue(bot) };
  const webhooks = { emit: jest.fn() };
  const smsFallback = { trigger: jest.fn().mockImplementation((_env, m) => Promise.resolve(m)) };
  const service = new DeliveryService(prisma as any, telegram as any, webhooks as any, smsFallback as any, { onCustomerBlocked: jest.fn() } as any);
  const finalUpdate = () => prisma.message.update.mock.calls.at(-1)![0].data;
  const events = () => webhooks.emit.mock.calls.map((c) => c[1]);
  return { service, prisma, bot, webhooks, smsFallback, finalUpdate, events };
}

describe('DeliveryService', () => {
  it('sends on Telegram when the customer is linked', async () => {
    const { service, bot, finalUpdate, events } = setup();
    await service.deliver('msg-1', false);
    expect(bot.sendMessage).toHaveBeenCalledWith('111', 'Order shipped', { buttons: [[{ text: 'Track', url: 'https://x.test/55' }]], html: false });
    expect(finalUpdate()).toMatchObject({ status: 'SENT', telegramMessageId: '42' });
    expect(events()).toEqual(['message.sent']);
  });

  it('sends formatted messages as Telegram HTML, escaping the sandbox label', async () => {
    const { service, bot } = setup({ environment: { type: 'SANDBOX', org: { name: 'A&B <Shop>' } }, message: { format: 'MARKDOWN', text: '**Paid** `TX-1`' } });
    await service.deliver('msg-1', false);
    expect(bot.sendMessage.mock.calls[0][1]).toBe('[SANDBOX · A&amp;B &lt;Shop&gt;]\n<b>Paid</b> <code>TX-1</code>');
    expect(bot.sendMessage.mock.calls[0][2]).toMatchObject({ html: true });
  });

  it('falls back to plain text if Telegram rejects the formatting', async () => {
    const { service, bot, finalUpdate } = setup({ message: { format: 'MARKDOWN', text: '**Paid** today' } });
    bot.sendMessage.mockRejectedValueOnce(new TelegramApiError(400, "Bad Request: can't parse entities: unsupported start tag")).mockResolvedValueOnce({ message_id: 7 });
    await service.deliver('msg-1', false);
    expect(bot.sendMessage.mock.calls[1][1]).toBe('Paid today');
    expect(bot.sendMessage.mock.calls[1][2]).not.toHaveProperty('html');
    expect(finalUpdate()).toMatchObject({ status: 'SENT', telegramMessageId: '7' });
  });

  it('labels real sandbox messages with the organization name', async () => {
    const { service, bot } = setup({ environment: { type: 'SANDBOX' } });
    await service.deliver('msg-1', false);
    expect(bot.sendMessage.mock.calls[0][1]).toBe('[SANDBOX · Abebe Pharmacy]\nOrder shipped');
  });

  it('marks UNDELIVERABLE (blocked) and flags the customer on 403', async () => {
    const { service, bot, prisma, finalUpdate, events } = setup();
    bot.sendMessage.mockRejectedValue(new TelegramApiError(403, 'Forbidden: bot was blocked by the user'));
    await service.deliver('msg-1', false);
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'cus-1' }, data: { blockedAt: expect.any(Date) } });
    expect(finalUpdate()).toMatchObject({ status: 'UNDELIVERABLE', reason: 'blocked' });
    expect(events()).toEqual(['customer.blocked', 'message.undeliverable']);
  });

  it('marks UNDELIVERABLE (chat_gone) and unlinks when the chat no longer exists', async () => {
    const { service, bot, prisma, finalUpdate } = setup();
    bot.sendMessage.mockRejectedValue(new TelegramApiError(400, 'Bad Request: chat not found'));
    await service.deliver('msg-1', false);
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'cus-1' }, data: { telegramChatId: null, linkedAt: null } });
    expect(finalUpdate()).toMatchObject({ status: 'UNDELIVERABLE', reason: 'chat_gone' });
  });

  it('throws on rate limit so the queue retries', async () => {
    const { service, bot } = setup();
    bot.sendMessage.mockRejectedValue(new TelegramApiError(429, 'Too Many Requests', 3));
    await expect(service.deliver('msg-1', false)).rejects.toBeInstanceOf(TelegramApiError);
  });

  it('marks FAILED (telegram_unavailable) after the final attempt', async () => {
    const { service, bot, finalUpdate, events } = setup();
    bot.sendMessage.mockRejectedValue(new TelegramApiError(502, 'Bad Gateway'));
    await service.deliver('msg-1', true);
    expect(finalUpdate()).toMatchObject({ status: 'FAILED', reason: 'telegram_unavailable' });
    expect(events()).toEqual(['message.failed']);
  });

  it('marks FAILED (telegram_rejected) without retrying on other 4xx errors', async () => {
    const { service, bot, finalUpdate } = setup();
    bot.sendMessage.mockRejectedValue(new TelegramApiError(400, "Bad Request: can't parse entities"));
    await service.deliver('msg-1', false);
    expect(finalUpdate()).toMatchObject({ status: 'FAILED', reason: 'telegram_rejected' });
  });

  it('marks UNDELIVERABLE if the customer was unlinked after queueing', async () => {
    const { service, bot, finalUpdate } = setup({ customer: { telegramChatId: null } });
    await service.deliver('msg-1', false);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(finalUpdate()).toMatchObject({ status: 'UNDELIVERABLE', reason: 'not_linked' });
  });

  it('skips messages that are no longer queued', async () => {
    const { service, bot, prisma } = setup({ message: { status: 'SENT' } });
    await service.deliver('msg-1', false);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  describe('sandbox test customers', () => {
    it.each([
      ['test_linked', { status: 'SENT' }],
      ['test_chat_gone', { status: 'UNDELIVERABLE', reason: 'chat_gone' }],
      ['test_telegram_down', { status: 'FAILED', reason: 'telegram_unavailable' }],
    ])('%s simulates its outcome without calling Telegram', async (externalId, expected) => {
      const { service, bot, finalUpdate } = setup({ customer: { externalId, telegramChatId: 'sandbox-test' }, environment: { type: 'SANDBOX' } });
      await service.deliver('msg-1', false);
      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(finalUpdate()).toMatchObject(expected);
    });

    it('treats test_ ids as normal customers in live', async () => {
      const { service, bot } = setup({ customer: { externalId: 'test_linked' } });
      await service.deliver('msg-1', false);
      expect(bot.sendMessage).toHaveBeenCalled();
    });
  });

  it('offers undeliverable and failed messages to SMS fallback before emitting', async () => {
    const { service, smsFallback } = setup({ customer: { telegramChatId: null } });
    await service.deliver('msg-1', false);
    expect(smsFallback.trigger).toHaveBeenCalledWith(expect.objectContaining({ id: 'env-1' }), expect.objectContaining({ status: 'UNDELIVERABLE' }));
  });
});
