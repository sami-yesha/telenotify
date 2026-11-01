import { LimitsService } from './limits.service';

const owner = { id: 'u1', email: 'owner@example.com', name: 'Abebe' } as any;

function setup(org: object = {}) {
  const row = { id: 'org-1', name: 'Mela', plan: 'FREE', customMonthlyQuota: null, limitRequestStatus: 'NONE', limitRequested: null, ...org } as any;
  const prisma = {
    organization: { update: jest.fn().mockResolvedValue(row), findUnique: jest.fn().mockResolvedValue(row) },
    usageAlert: { deleteMany: jest.fn() },
    membership: { findMany: jest.fn().mockResolvedValue([{ user: owner }]) },
  };
  const audit = { record: jest.fn() };
  const mail = { send: jest.fn() };
  const notifier = { notify: jest.fn() };
  const config = { get: () => 'http://portal.test/' };
  return { row, prisma, audit, mail, notifier, service: new LimitsService(prisma as any, config as any, audit as any, mail as any, notifier as any) };
}

describe('LimitsService', () => {
  it('records a request and tells the operators', async () => {
    const { service, row, prisma, notifier, audit } = setup();
    await service.request(row, 'OWNER', owner, 5000, ' Pharmacy receipts ');
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ limitRequestStatus: 'PENDING', limitRequested: 5000, limitRequestReason: 'Pharmacy receipts' });
    expect(notifier.notify).toHaveBeenCalledWith(expect.stringContaining('Mela'), expect.stringContaining('from 1,000 to 5,000'));
    expect(audit.record).toHaveBeenCalledWith('org-1', owner, 'limit.requested', '5,000', { from: 1000 });
  });

  it('refuses a request from a non-owner, while one is pending, or that is not a raise', async () => {
    const { service, row, prisma } = setup();
    await expect(service.request(row, 'MEMBER', owner, 5000, 'x')).rejects.toThrow('Only an owner');
    await expect(service.request({ ...row, limitRequestStatus: 'PENDING' }, 'OWNER', owner, 5000, 'x')).rejects.toThrow('already being reviewed');
    await expect(service.request(row, 'OWNER', owner, 1000, 'x')).rejects.toThrow('more than your current limit of 1,000');
    await expect(service.request({ ...row, customMonthlyQuota: 8000 }, 'OWNER', owner, 5000, 'x')).rejects.toThrow('8,000');
    await expect(service.request({ ...row, plan: 'BUSINESS' }, 'OWNER', owner, 5000, 'x')).rejects.toThrow('no monthly limit');
    await expect(service.request(row, 'OWNER', owner, 5000, '   ')).rejects.toThrow('what the extra messages');
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('asks again after a decline, clearing the old reason', async () => {
    const { service, row, prisma } = setup({ limitRequestStatus: 'DECLINED', limitDeclineReason: 'No' });
    await service.request(row, 'OWNER', owner, 2000, 'Now with details');
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ limitRequestStatus: 'PENDING', limitDeclineReason: null });
  });

  it('approves with the number the operator chose, and lets usage alerts fire again', async () => {
    const { service, prisma, audit, mail } = setup({ limitRequestStatus: 'PENDING', limitRequested: 50_000 });
    await service.approve('org-1', 20_000, owner);
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ customMonthlyQuota: 20_000, limitRequestStatus: 'APPROVED' });
    expect(prisma.usageAlert.deleteMany).toHaveBeenCalledWith({ where: { orgId: 'org-1', period: expect.stringMatching(/^\d{4}-\d{2}$/) } });
    expect(audit.record).toHaveBeenCalledWith('org-1', owner, 'limit.approved', '20,000', { requested: 50_000 });
    await new Promise(setImmediate);
    expect(mail.send).toHaveBeenCalledWith('owner@example.com', expect.stringContaining('20,000'), expect.stringContaining('/o/org-1/live/billing'));
  });

  it('declines with a reason the owners see, leaving the limit alone', async () => {
    const { service, prisma, mail } = setup({ limitRequestStatus: 'PENDING', limitRequested: 5000 });
    await service.decline('org-1', ' Too vague ', owner);
    const { data } = prisma.organization.update.mock.calls[0][0];
    expect(data).toEqual({ limitRequestStatus: 'DECLINED', limitDeclineReason: 'Too vague' });
    await new Promise(setImmediate);
    expect(mail.send).toHaveBeenCalledWith('owner@example.com', expect.stringContaining('declined'), expect.stringContaining('Reason: Too vague'));
  });

  it('only decides a request that is waiting', async () => {
    const { service } = setup({ limitRequestStatus: 'APPROVED' });
    await expect(service.approve('org-1', 5000, owner)).rejects.toThrow('no request waiting');
    await expect(service.decline('org-1', 'x', owner)).rejects.toThrow('no request waiting');
  });

  it('sets and removes a custom limit directly', async () => {
    const { service, prisma, audit } = setup({ customMonthlyQuota: 10_000 });
    await service.set('org-1', null, owner);
    expect(prisma.organization.update.mock.calls[0][0].data).toEqual({ customMonthlyQuota: null });
    expect(audit.record).toHaveBeenCalledWith('org-1', owner, 'limit.changed', 'plan limit', { from: 10_000 });
  });
});
