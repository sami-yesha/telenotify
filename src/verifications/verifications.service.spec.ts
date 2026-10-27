import { VerificationsService } from './verifications.service';

const environment = { id: 'env-1', type: 'LIVE', org: { name: 'Abebe Pharmacy' } };

function setup(open: object | null) {
  const prisma = {
    verification: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ver-1', status: 'PENDING', ...data })),
      findFirst: jest.fn().mockResolvedValue(open),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ver-1', ...open, ...data })),
      updateMany: jest.fn(),
    },
  };
  const telegram = { botUsernameFor: jest.fn().mockReturnValue('abebe_bot') };
  const customers = { linkVerified: jest.fn().mockResolvedValue({ linked: true }) };
  const webhooks = { emit: jest.fn() };
  const billing = { assertWithinQuota: jest.fn() };
  const pass = { offer: jest.fn(), enabled: () => true, joinUrl: jest.fn().mockResolvedValue('https://t.me/pass_bot?start=j_x'), replaceRequest: jest.fn() };
  const service = new VerificationsService(prisma as any, telegram as any, customers as any, webhooks as any, billing as any, { get: (_k: string, d: unknown) => d ?? 'http://portal.test' } as any, pass as any);
  const events = () => webhooks.emit.mock.calls.map((c) => c[1]);
  return { service, prisma, customers, events, pass };
}

const chat = { chatId: '777', username: 'kebede' };
const awaiting = (extra: object = {}) => ({
  id: 'ver-1',
  status: 'AWAITING_CONTACT',
  externalId: 'cust_1',
  expectedPhone: null,
  expiresAt: new Date(Date.now() + 60_000),
  environment,
  ...extra,
});

describe('VerificationsService', () => {
  it('creates a t.me link with the v_ prefix and normalizes the expected phone', async () => {
    const { service, prisma } = setup(null);
    const view = await service.create(environment as any, { externalId: 'cust_1', phone: '0911223344' });
    expect(view.url).toMatch(/^https:\/\/t\.me\/abebe_bot\?start=v_/);
    expect(prisma.verification.create.mock.calls[0][0].data.expectedPhone).toBe('251911223344');
  });

  it('verifies the shared own contact and links the customer', async () => {
    const { service, customers, events } = setup(awaiting());
    const outcome = await service.completeWithContact({ environmentId: 'env-1' }, chat, { phone_number: '+251911223344', user_id: 42 }, 42);
    expect(outcome).toEqual({ kind: 'verified', orgName: 'Abebe Pharmacy', passJoinUrl: 'https://t.me/pass_bot?start=j_x' });
    expect(customers.linkVerified).toHaveBeenCalledWith(environment, 'cust_1', '251911223344', chat);
    expect(events()).toEqual(['customer.linked', 'verification.completed']);
  });

  it('rejects a forwarded contact that is not the sender', async () => {
    const { service, prisma } = setup(awaiting());
    const outcome = await service.completeWithContact({ environmentId: 'env-1' }, chat, { phone_number: '0911223344', user_id: 99 }, 42);
    expect(outcome).toEqual({ kind: 'not_own_contact' });
    expect(prisma.verification.update).not.toHaveBeenCalled();
  });

  it('fails with phone_mismatch when the number differs from the expected one', async () => {
    const { service, prisma, customers, events } = setup(awaiting({ expectedPhone: '251911000000' }));
    const outcome = await service.completeWithContact({ environmentId: 'env-1' }, chat, { phone_number: '0911223344', user_id: 42 }, 42);
    expect(outcome.kind).toBe('mismatch');
    expect(prisma.verification.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', reason: 'phone_mismatch' });
    expect(customers.linkVerified).not.toHaveBeenCalled();
    expect(events()).toEqual(['verification.failed']);
  });

  it('ignores contacts when the chat has no open verification', async () => {
    const { service } = setup(null);
    const outcome = await service.completeWithContact({ environmentId: 'env-1' }, chat, { phone_number: '0911223344', user_id: 42 }, 42);
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('expires a link opened after its deadline', async () => {
    const { service, prisma } = setup({ id: 'ver-1', status: 'PENDING', expiresAt: new Date(Date.now() - 1000), environment });
    await expect(service.start({ environmentId: 'env-1' }, 'tok', chat)).resolves.toBeNull();
    expect(prisma.verification.update.mock.calls[0][0].data).toEqual({ status: 'EXPIRED' });
  });
});
