import { TelegramApiClient, TelegramApiError } from '../telegram/telegram-api.client';
import { maskPhone, PassService } from './pass.service';
import { VerificationsService } from './verifications.service';

const member = { id: 'pass-1', telegramUserId: '42', chatId: '4200', phone: '251911223344' };
const org = { name: 'Abebe', legalName: 'Abebe Pharmacy PLC', businessStatus: 'VERIFIED', status: 'ACTIVE' };
const pending = (extra: object = {}) => ({
  id: '0b6c4f6e-1f7a-4e8f-9d3c-2a1b5c6d7e8f',
  environmentId: 'env-1',
  status: 'PENDING',
  expectedPhone: '251911223344',
  expiresAt: new Date(Date.now() + 60_000),
  environment: { id: 'env-1', type: 'LIVE', org },
  ...extra,
});

function setup(opts: { identity?: object | null; recent?: number; denials?: number; verification?: object } = {}) {
  const verification = pending(opts.verification);
  const prisma = {
    verification: {
      findUnique: jest.fn().mockResolvedValue(verification),
      count: jest.fn().mockResolvedValueOnce(opts.recent ?? 0).mockResolvedValueOnce(opts.denials ?? 0),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...verification, ...data })),
    },
    passIdentity: {
      findUnique: jest.fn().mockResolvedValue(opts.identity === undefined ? member : opts.identity),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const values: Record<string, string> = { PASS_BOT_TOKEN: 'pass-token', PASS_BOT_USERNAME: 'telenotify_pass_bot' };
  const config = { get: (k: string) => values[k], getOrThrow: (k: string) => values[k] };
  const send = jest.spyOn(TelegramApiClient.prototype, 'sendMessage').mockResolvedValue({ message_id: 77 });
  const service = new PassService(prisma as any, config as any);
  service.onApplicationBootstrap = () => undefined;
  return { service, prisma, send };
}

afterEach(() => jest.restoreAllMocks());

describe('PassService.offer', () => {
  it('asks a member to confirm with Yes/No, naming a verified business', async () => {
    const { service, send, prisma } = setup();
    await service.offer(pending().id);
    const [chatId, text, options] = send.mock.calls[0];
    expect(chatId).toBe('4200');
    expect(text).toContain('Abebe Pharmacy PLC ✓ wants to confirm your phone number +251 91•• ••• •44');
    expect(options!.buttons![0].map((b) => ('callback_data' in b ? b.callback_data : ''))).toEqual([`p:${pending().id}:y`, `p:${pending().id}:n`]);
    expect(prisma.verification.update.mock.calls[0][0].data).toMatchObject({ passIdentityId: 'pass-1', passMessageId: '77' });
  });

  it('warns about unverified businesses and labels sandbox requests', async () => {
    const { service, send } = setup({ verification: { environment: { id: 'env-1', type: 'SANDBOX', org: { ...org, businessStatus: 'NONE' } } } });
    await service.offer(pending().id);
    expect(send.mock.calls[0][1]).toMatch(/^\[TEST\] 🔐 Abebe wants/);
    expect(send.mock.calls[0][1]).toContain('not a verified business');
  });

  it('does nothing for non-members, without an expected phone, or when switched off', async () => {
    const notMember = setup({ identity: null });
    await notMember.service.offer(pending().id);
    expect(notMember.send).not.toHaveBeenCalled();

    const noPhone = setup({ verification: { expectedPhone: null } });
    await noPhone.service.offer(pending().id);
    expect(noPhone.send).not.toHaveBeenCalled();

    const off = setup();
    (off.service as any).config = { get: () => undefined };
    await off.service.offer(pending().id);
    expect(off.send).not.toHaveBeenCalled();
  });

  it('stops asking past 5 requests an hour, or after 2 denials from the same business', async () => {
    const busy = setup({ recent: 5 });
    await busy.service.offer(pending().id);
    expect(busy.send).not.toHaveBeenCalled();

    const denied = setup({ denials: 2 });
    await denied.service.offer(pending().id);
    expect(denied.send).not.toHaveBeenCalled();
  });

  it('removes a member who blocked the Pass bot, and never throws', async () => {
    const { service, send, prisma } = setup();
    send.mockRejectedValue(new TelegramApiError(403, 'Forbidden: bot was blocked by the user'));
    await expect(service.offer(pending().id)).resolves.toBeUndefined();
    expect(prisma.passIdentity.deleteMany).toHaveBeenCalledWith({ where: { id: 'pass-1' } });
  });
});

describe('PassService joining', () => {
  function joining(verification: object | null, existing: object | null = null) {
    const tx = { passIdentity: { deleteMany: jest.fn(), upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'pass-9', ...create })) } };
    const prisma = {
      verification: {
        findUnique: jest.fn().mockResolvedValue(verification),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...verification, ...data })),
      },
      passIdentity: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const service = new PassService(prisma as any, { get: (k: string) => ({ PASS_BOT_TOKEN: 't' })[k] } as any);
    (service as any).username = 'telenotify_pass_bot';
    return { service, tx, prisma };
  }
  const verified = { id: 'v1', status: 'VERIFIED', method: 'telegram', phone: '251911223344', telegramUserId: '42', verifiedAt: new Date(), passJoinToken: 'tok' };

  it('joins with a number Telegram just verified for the same person', async () => {
    const { service, tx } = joining(verified);
    expect(await service.joinWithToken('tok', 42, '4200')).toMatchObject({ telegramUserId: '42', phone: '251911223344', chatId: '4200' });
    // The number moves away from any other account that had it.
    expect(tx.passIdentity.deleteMany).toHaveBeenCalledWith({ where: { phone: '251911223344', NOT: { telegramUserId: '42' } } });
  });

  it('refuses a link opened by someone else, or a stale one', async () => {
    expect(await joining(verified).service.joinWithToken('tok', 99, '9900')).toBeNull();
    expect(await joining({ ...verified, verifiedAt: new Date(Date.now() - 25 * 3_600_000) }).service.joinWithToken('tok', 42, '4200')).toBeNull();
  });

  it('accepts only the person’s own shared contact', async () => {
    const { service } = joining(null);
    expect(await service.joinWithContact({ phone_number: '+251911223344', user_id: 7 }, 42, '4200')).toBeNull();
    expect(await service.joinWithContact({ phone_number: '+251911223344', user_id: 42 }, 42, '4200')).toMatchObject({ phone: '251911223344' });
  });

  it('offers the join link only to people who aren’t members yet', async () => {
    expect(await joining(verified).service.joinUrl(verified as any)).toBe('https://t.me/telenotify_pass_bot?start=j_tok');
    expect(await joining(verified, member).service.joinUrl(verified as any)).toBeNull();
    expect(await joining(verified).service.joinUrl({ ...verified, method: 'pass' } as any)).toBeNull();
  });
});

describe('VerificationsService.answerPass', () => {
  function answering(extra: object = {}) {
    const verification = { ...pending({ status: 'PENDING', passIdentity: member, passIdentityId: 'pass-1', passMessageId: '77' }), ...extra };
    const prisma = {
      verification: {
        findUnique: jest.fn().mockResolvedValue(verification),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...verification, ...data })),
      },
    };
    const webhooks = { emit: jest.fn() };
    const pass = { replaceRequest: jest.fn() };
    const service = new VerificationsService(prisma as any, {} as any, {} as any, webhooks as any, {} as any, { get: () => 'https://portal.test' } as any, pass as any);
    return { service, prisma, webhooks, pass };
  }

  it('Yes verifies the member’s number and tells the business', async () => {
    const { service, prisma, webhooks, pass } = answering();
    expect(await service.answerPass(pending().id, 42, true)).toMatchObject({ kind: 'verified' });
    expect(prisma.verification.update.mock.calls[0][0].data).toMatchObject({ status: 'VERIFIED', phone: '251911223344', telegramUserId: '42', method: 'pass' });
    expect(webhooks.emit.mock.calls[0][1]).toBe('verification.completed');
    expect(pass.replaceRequest.mock.calls[0][1]).toContain('Confirmed +251 91•• ••• •44 for Abebe');
  });

  it('No fails it with reason "denied"', async () => {
    const { service, prisma, webhooks } = answering();
    expect(await service.answerPass(pending().id, 42, false)).toMatchObject({ kind: 'denied' });
    expect(prisma.verification.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', reason: 'denied' });
    expect(webhooks.emit.mock.calls[0][1]).toBe('verification.failed');
  });

  it('ignores taps from anyone else and on closed requests', async () => {
    const other = answering();
    expect(await other.service.answerPass(pending().id, 7, true)).toMatchObject({ kind: 'not_yours' });
    expect(other.prisma.verification.update).not.toHaveBeenCalled();

    const done = answering({ status: 'VERIFIED' });
    expect(await done.service.answerPass(pending().id, 42, true)).toMatchObject({ kind: 'closed' });
    expect(done.webhooks.emit).not.toHaveBeenCalled();
  });
});

describe('maskPhone', () => {
  it('shows only the country code, the start and the last two digits', () => {
    expect(maskPhone('251911223344')).toBe('+251 91•• ••• •44');
  });
});
