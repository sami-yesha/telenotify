import { AfroMessageError, checkAfroMessageToken, sendAfroMessage, toAfroMessageNumber } from './afromessage.client';
import { smsText, SmsFallbackService } from './sms-fallback.service';

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('sendAfroMessage', () => {
  it('posts with the bearer token, identifier and sender', async () => {
    const fetch = jest.fn(json(200, { acknowledge: 'success', response: { message_id: 'afro-1' } }));
    const result = await sendAfroMessage({ token: 'tok', identifierId: 'id-1', senderName: 'Mela' }, '+251911223344', 'hi', fetch as any);
    expect(result).toEqual({ messageId: 'afro-1' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.afromessage.com/api/send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ to: '+251911223344', message: 'hi', from: 'id-1', sender: 'Mela' });
  });

  it('treats acknowledge "error" as a non-retryable rejection', async () => {
    const fetch = json(200, { acknowledge: 'error', response: { errors: ['Insufficient balance'] } });
    await expect(sendAfroMessage({ token: 't' }, '+251911223344', 'hi', fetch as any)).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('Insufficient balance') });
  });

  it('retries 5xx and network errors', async () => {
    await expect(sendAfroMessage({ token: 't' }, '+2519', 'hi', json(502, {}) as any)).rejects.toMatchObject({ retryable: true });
    const down = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(sendAfroMessage({ token: 't' }, '+2519', 'hi', down as any)).rejects.toBeInstanceOf(AfroMessageError);
  });

  it('formats numbers with a leading +', () => {
    expect(toAfroMessageNumber('251911223344')).toBe('+251911223344');
  });
});

describe('smsText', () => {
  it('writes URL buttons out as lines', () => {
    expect(smsText({ text: 'Loan approved', buttons: [[{ text: 'View', url: 'https://m.test/1' }]] as any })).toBe('Loan approved\nView: https://m.test/1');
  });
});

describe('SmsFallbackService.trigger', () => {
  let sentToday = 0;
  beforeEach(() => (sentToday = 0));
  function setup(environment: object, customer: object, message: object = {}) {
    const msg = { id: 'msg-1', smsFallback: true, fallbackStatus: null, customer, ...message };
    const prisma = { message: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...msg, ...data })), count: jest.fn().mockResolvedValue(sentToday) } };
    const queue = { add: jest.fn() };
    const service = new SmsFallbackService(prisma as any, {} as any, { emit: jest.fn() } as any, {} as any, queue as any);
    return { run: () => service.trigger({ id: 'env-1', ...environment } as any, msg as any), prisma, queue };
  }
  const live = { type: 'LIVE', smsFallbackEnabled: true, afroTokenEncrypted: 'enc' };

  it('queues an SMS when fallback is on and the customer has a phone', async () => {
    const { run, queue } = setup(live, { phone: '251911223344' });
    expect(await run()).toMatchObject({ fallbackStatus: 'QUEUED' });
    expect(queue.add).toHaveBeenCalledWith('send', { messageId: 'msg-1' }, { jobId: 'fallback_msg-1' });
  });

  it('stops at the organization\'s daily SMS limit', async () => {
    sentToday = 200;
    const { run, queue } = setup({ ...live, smsDailyLimit: 200 }, { phone: '251911223344' });
    expect(await run()).toMatchObject({ fallbackStatus: 'SKIPPED', fallbackError: expect.stringContaining('daily SMS limit (200') });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('sends under the limit', async () => {
    sentToday = 199;
    const { run } = setup({ ...live, smsDailyLimit: 200 }, { phone: '251911223344' });
    expect(await run()).toMatchObject({ fallbackStatus: 'QUEUED' });
  });

  it('records SKIPPED when there is no phone number', async () => {
    const { run, queue } = setup(live, { phone: null });
    expect(await run()).toMatchObject({ fallbackStatus: 'SKIPPED' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing when off, opted out, or live without a token', async () => {
    for (const [env, message] of [
      [{ ...live, smsFallbackEnabled: false }, {}],
      [live, { smsFallback: false }],
      [{ ...live, afroTokenEncrypted: null }, {}],
    ] as const) {
      const { run, prisma } = setup(env, { phone: '251911223344' }, message);
      expect((await run()).fallbackStatus).toBeNull();
      expect(prisma.message.update).not.toHaveBeenCalled();
    }
  });
});

describe('checkAfroMessageToken', () => {
  const text = (status: number, body: string) => async () => new Response(body, { status });

  it('reports a rejected token with AfroMessage\'s reason', async () => {
    const result = await checkAfroMessageToken('bad', text(401, 'Unauthorized (401-11) : Invalid token. JWT signature does not match locally computed signature. JWT validity cannot be asserted.') as any);
    expect(result).toEqual({ valid: false, reason: 'Invalid token' });
  });

  it('accepts the token and picks out a balance wherever it is', async () => {
    expect(await checkAfroMessageToken('ok', json(200, { acknowledge: 'success', response: { balance: 412.5 } }) as any)).toEqual({ valid: true, balance: '412.5' });
    expect(await checkAfroMessageToken('ok', text(200, 'fine') as any)).toEqual({ valid: true, balance: null });
  });

  it('throws a retryable error when AfroMessage is down', async () => {
    await expect(checkAfroMessageToken('t', json(503, {}) as any)).rejects.toMatchObject({ retryable: true });
  });
});

describe('SmsFallbackService.update token check', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  function setup() {
    const prisma = {
      environment: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'env-1', type: 'LIVE', smsFallbackEnabled: false, smsDailyLimit: null, ...data })) },
      message: { count: jest.fn().mockResolvedValue(0) },
    };
    const config = { getOrThrow: () => key };
    const service = new SmsFallbackService(prisma as any, config as any, {} as any, { record: jest.fn() } as any, {} as any);
    return { service, prisma, env: { id: 'env-1', orgId: 'org-1', type: 'LIVE', afroTokenEncrypted: null } as any };
  }
  afterEach(() => jest.restoreAllMocks());

  it('refuses to save a token AfroMessage rejects', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Unauthorized (401-11) : Invalid token. JWT strings must contain exactly 2 period characters.', { status: 401 }));
    const { service, prisma, env } = setup();
    await expect(service.update(env, { token: 'typo' }, {} as any)).rejects.toThrow(/AfroMessage rejected this token/);
    expect(prisma.environment.update).not.toHaveBeenCalled();
  });

  it('saves a good token and returns the check', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ acknowledge: 'success', response: { balance: 90 } }), { status: 200 }));
    const { service, env } = setup();
    const view = await service.update(env, { token: 'good' }, {} as any);
    expect(view).toMatchObject({ configured: true, tokenHint: '…good', tokenCheck: { verified: true, balance: '90' } });
  });

  it('still saves when AfroMessage is unreachable, marked unverified', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const { service, env } = setup();
    expect(await service.update(env, { token: 'good' }, {} as any)).toMatchObject({ tokenCheck: { verified: false } });
  });
});

describe('SmsFallbackService.history', () => {
  it('lists SMS newest first with the phone and AfroMessage id, paged', async () => {
    const at = (i: number) => new Date(Date.UTC(2026, 9, 26, 12, 0, 60 - i));
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `m${i}`, fallbackStatus: 'SENT', reason: 'not_linked', fallbackProviderId: `afro-${i}`, fallbackError: null, fallbackAt: at(i),
      customer: { externalId: `user-${i}`, phone: '251911223344' },
    }));
    const prisma = { message: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new SmsFallbackService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    const page = await service.history({ id: 'env-1' } as any);
    expect(page.items).toHaveLength(50);
    expect(page.items[0]).toEqual({ messageId: 'm0', to: 'user-0', phone: '251911223344', status: 'sent', telegramReason: 'not_linked', providerMessageId: 'afro-0', error: null, at: at(0) });
    expect(page.next).toEqual(at(49));
    expect(prisma.message.findMany.mock.calls[0][0]).toMatchObject({ where: { environmentId: 'env-1' }, orderBy: { fallbackAt: 'desc' } });
  });
});
