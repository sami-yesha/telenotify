import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

function setup(opts: { blocked: number; reached: number; type?: string; status?: string }) {
  const environment = { id: 'env-1', type: opts.type ?? 'LIVE', orgId: 'org-1', botUsername: 'shop_bot', org: { id: 'org-1', name: 'Shop', status: opts.status ?? 'ACTIVE' } };
  const prisma = {
    environment: { findUnique: jest.fn().mockResolvedValue(environment) },
    customer: { count: jest.fn().mockResolvedValue(opts.blocked) },
    message: { findMany: jest.fn().mockResolvedValue(Array.from({ length: opts.reached }, (_, i) => ({ customerId: `c${i}` }))) },
    organization: {
      findUnique: jest.fn().mockResolvedValue(environment.org),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...environment.org, ...data })),
    },
    membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: 'owner@example.com', name: 'Abebe' } }]) },
  };
  const config = { get: (_key: string, fallback: unknown) => fallback };
  const audit = { record: jest.fn() };
  const notifier = { notify: jest.fn() };
  const mail = { send: jest.fn() };
  const service = new AdminService(prisma as any, config as any, audit as any, {} as any, notifier as any, mail as any);
  return { service, prisma, audit, notifier, mail };
}

describe('AdminService live approval', () => {
  const actor = { id: 'op-1', email: 'op@example.com' } as any;

  it('approves the organization and emails its owners once', async () => {
    const { service, prisma, audit, mail } = setup({ blocked: 0, reached: 0 });
    await service.approveLive('org-1', actor);
    await new Promise(setImmediate);
    expect(prisma.organization.update.mock.calls[0][0].data.liveApprovedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith('org-1', actor, 'live.approved', 'Shop');
    expect(mail.send).toHaveBeenCalledWith('owner@example.com', expect.stringContaining('approved'), expect.stringContaining('/o/org-1/live/keys'));

    mail.send.mockClear();
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Shop', liveApprovedAt: new Date() });
    await service.approveLive('org-1', actor);
    await new Promise(setImmediate);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('AdminService spam detection', () => {
  it('suspends a live organization when many recipients block its bot', async () => {
    const { service, prisma, notifier, audit } = setup({ blocked: 12, reached: 30 });
    await service.onCustomerBlocked('env-1');
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUSPENDED' }) }));
    expect(audit.record).toHaveBeenCalledWith('org-1', null, 'org.suspended', 'Shop', expect.anything());
    expect(notifier.notify).toHaveBeenCalledWith(expect.stringContaining('Auto-suspended'), expect.any(String));
  });

  it('ignores a few blocks, a low block rate, the sandbox and already suspended orgs', async () => {
    for (const opts of [
      { blocked: 5, reached: 6 },
      { blocked: 20, reached: 200 },
      { blocked: 50, reached: 60, type: 'SANDBOX' },
      { blocked: 50, reached: 60, status: 'SUSPENDED' },
    ]) {
      const { service, prisma } = setup(opts);
      await service.onCustomerBlocked('env-1');
      expect(prisma.organization.update).not.toHaveBeenCalled();
    }
  });

  it('requires a reason to suspend by hand', async () => {
    const { service } = setup({ blocked: 0, reached: 0 });
    await expect(service.suspend('org-1', '  ', { id: 'u1', email: 'op@example.com' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
