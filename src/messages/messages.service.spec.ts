import { BadRequestException, HttpException } from '@nestjs/common';
import { MessagesService } from './messages.service';

function setup(customer: object, environment: object = { id: 'env-1', type: 'LIVE' }, opts: { hasBot?: boolean; sentToday?: number } = {}) {
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(opts.sentToday ?? 0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'msg-1', ...data, customer, attempts: 0, createdAt: new Date() })),
    },
  };
  const customers = { upsert: jest.fn().mockResolvedValue(customer) };
  const telegram = { hasBot: jest.fn().mockReturnValue(opts.hasBot ?? true) };
  const webhooks = { emit: jest.fn() };
  const config = { get: (_key: string, fallback: unknown) => fallback };
  const queue = { add: jest.fn() };
  const billing = { assertWithinQuota: jest.fn() };
  const templates = { renderForSend: jest.fn().mockResolvedValue({ text: 'Payment of 1,250 ETB received.', format: 'PLAIN', locale: 'en', templateKey: 'payment_received' }) };
  const smsFallback = { trigger: jest.fn().mockImplementation((_env, m) => Promise.resolve({ ...m, fallbackStatus: 'QUEUED' })) };
  const service = new MessagesService(prisma as any, customers as any, telegram as any, webhooks as any, config as any, billing as any, templates as any, smsFallback as any, queue as any);
  return { service, queue, webhooks, templates, smsFallback, prisma, environment: environment as any };
}

const linked = { id: 'c1', externalId: 'u1', telegramChatId: '111', blockedAt: null };

describe('MessagesService.send', () => {
  it('queues a message for a reachable customer, rate-limited per bot', async () => {
    const { service, queue, environment } = setup(linked);
    const result = await service.send(environment, { to: 'u1', text: 'hi' });
    expect(result).toMatchObject({ status: 'QUEUED', reason: null, priority: 'normal' });
    expect(queue.add).toHaveBeenCalledWith('deliver', { messageId: 'msg-1', botKey: 'env-1' }, { jobId: 'msg-1', priority: 10 });
  });

  it('queues high-priority messages ahead of normal ones', async () => {
    const { service, queue, environment } = setup(linked);
    const result = await service.send(environment, { to: 'u1', text: 'Your code is 4821', priority: 'high' });
    expect(result.priority).toBe('high');
    expect(queue.add.mock.calls[0][2]).toEqual({ jobId: 'msg-1', priority: 1 });
  });

  it('uses one shared rate-limit bucket for the sandbox bot', async () => {
    const { service, queue } = setup(linked, { id: 'env-9', type: 'SANDBOX' });
    await service.send({ id: 'env-9', type: 'SANDBOX' } as any, { to: 'u1', text: 'hi' });
    expect(queue.add.mock.calls[0][1].botKey).toBe('sandbox');
  });

  it.each([
    [{ ...linked, telegramChatId: null }, 'not_linked'],
    [{ ...linked, blockedAt: new Date() }, 'blocked'],
  ])('returns UNDELIVERABLE immediately (%#)', async (customer, reason) => {
    const { service, queue, webhooks, environment } = setup(customer);
    const result = await service.send(environment, { to: 'u1', text: 'hi' });
    expect(result).toMatchObject({ status: 'UNDELIVERABLE', reason });
    expect(queue.add).not.toHaveBeenCalled();
    expect(webhooks.emit).toHaveBeenCalledWith(environment, 'message.undeliverable', expect.objectContaining({ reason }));
  });

  it('rejects live sends when no bot is connected', async () => {
    const { service, environment } = setup(linked, undefined, { hasBot: false });
    await expect(service.send(environment, { to: 'u1', text: 'hi' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the sandbox daily limit', async () => {
    const { service, environment } = setup(linked, { id: 'env-1', type: 'SANDBOX' }, { sentToday: 100 });
    await expect(service.send(environment, { to: 'u1', text: 'hi' })).rejects.toBeInstanceOf(HttpException);
  });

  it('renders a template with the customer language as fallback', async () => {
    const { service, templates, environment } = setup({ ...linked, locale: 'am' }, { id: 'env-1', type: 'LIVE', orgId: 'org-1' });
    const result = await service.send(environment, { to: 'u1', template: 'payment_received', params: { amount: '1,250' } });
    expect(templates.renderForSend).toHaveBeenCalledWith('org-1', 'payment_received', { amount: '1,250' }, undefined, 'am');
    expect(result).toMatchObject({ text: 'Payment of 1,250 ETB received.', template: 'payment_received', locale: 'en' });
  });

  it('requires exactly one of text or template', async () => {
    const { service, environment } = setup(linked);
    await expect(service.send(environment, { to: 'u1' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send(environment, { to: 'u1', text: 'x', template: 'y' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('starts SMS fallback for an unlinked customer and reports it in the response', async () => {
    const { service, smsFallback, queue, environment } = setup({ ...linked, telegramChatId: null });
    const result = await service.send(environment, { to: 'u1', text: 'hi' });
    expect(smsFallback.trigger).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'UNDELIVERABLE', fallback: { channel: 'sms', status: 'queued' } });
  });

  it('stores the per-message fallback opt-out', async () => {
    const { service, smsFallback, environment } = setup({ ...linked, telegramChatId: null });
    await service.send(environment, { to: 'u1', text: 'hi', fallback: false });
    expect(smsFallback.trigger.mock.calls[0][1]).toMatchObject({ smsFallback: false });
  });

  it('sends formatted text and reports the plain version too', async () => {
    const { service, prisma, environment } = setup(linked);
    const result = await service.send(environment, { to: 'u1', text: '**Paid** `TX-1`', format: 'markdown' });
    expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({ format: 'MARKDOWN' });
    expect(result).toMatchObject({ format: 'markdown', text: '**Paid** `TX-1`', plainText: 'Paid TX-1' });
  });

  it('writes a layout out as a formatted message', async () => {
    const { service, environment } = setup(linked);
    const result = await service.send(environment, { to: 'u1', layout: { type: 'receipt', title: 'Payment received', rows: [{ label: 'Amount', value: '1,250 ETB' }] } });
    expect(result).toMatchObject({ format: 'markdown', text: '✅ **Payment received**\n\nAmount: **1,250 ETB**', plainText: '✅ Payment received\n\nAmount: 1,250 ETB' });
  });

  it('takes exactly one of text, template or layout, and format only with text', async () => {
    const { service, environment } = setup(linked);
    await expect(service.send(environment, { to: 'u1', text: 'x', layout: { type: 'info', title: 't' } })).rejects.toThrow(/one of/);
    await expect(service.send(environment, { to: 'u1', template: 'k', format: 'markdown' })).rejects.toThrow(/"format" applies to "text" only/);
  });
});
