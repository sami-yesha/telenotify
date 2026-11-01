import { HttpException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { currentPeriod } from './plans';

function setup(plan: string, messages: number, verifications: number, org: object = {}) {
  const prisma = {
    environment: { findUnique: jest.fn().mockResolvedValue({ id: 'live-1' }) },
    message: { count: jest.fn().mockResolvedValue(messages) },
    verification: { count: jest.fn().mockResolvedValue(verifications) },
    organization: { findUniqueOrThrow: jest.fn() },
    usageAlert: { create: jest.fn() },
    membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: 'owner@example.com' } }]) },
  };
  const mail = { send: jest.fn() };
  const config = { getOrThrow: () => 'http://portal.test', get: (_key: string, fallback: unknown) => fallback };
  return { billing: new BillingService(prisma as any, mail as any, config as any), prisma, mail, env: { id: 'live-1', type: 'LIVE', orgId: 'org-1', org: { id: 'org-1', name: 'Mela', plan, customMonthlyQuota: null, status: 'ACTIVE', liveApprovedAt: new Date(), ...org } } as any };
}

describe('BillingService', () => {
  it('allows live sends under the quota', async () => {
    const { billing, env } = setup('FREE', 600, 399);
    await expect(billing.assertWithinQuota(env)).resolves.toBeUndefined();
  });

  it('blocks live sends once messages + verifications reach the quota', async () => {
    const { billing, env } = setup('FREE', 600, 400);
    await expect(billing.assertWithinQuota(env)).rejects.toBeInstanceOf(HttpException);
  });

  it('lets a custom limit win over the plan', async () => {
    const raised = setup('FREE', 4_999, 0, { customMonthlyQuota: 5_000 });
    await expect(raised.billing.assertWithinQuota(raised.env)).resolves.toBeUndefined();
    const reached = setup('FREE', 5_000, 0, { customMonthlyQuota: 5_000 });
    await expect(reached.billing.assertWithinQuota(reached.env)).rejects.toMatchObject({ response: { code: 'quota_exceeded', message: expect.stringContaining('5,000') } });
  });

  it('never limits the Business plan or the sandbox', async () => {
    const business = setup('BUSINESS', 10_000_000, 0);
    await expect(business.billing.assertWithinQuota(business.env)).resolves.toBeUndefined();
    const sandbox = setup('FREE', 5_000, 0);
    await expect(sandbox.billing.assertWithinQuota({ ...sandbox.env, type: 'SANDBOX' })).resolves.toBeUndefined();
    expect(sandbox.prisma.message.count).not.toHaveBeenCalled();
  });

  it('counts only delivered or in-flight messages and completed verifications', async () => {
    const { billing, prisma } = setup('FREE', 1, 1);
    await billing.usage('org-1');
    expect(prisma.message.count.mock.calls[0][0].where.status).toEqual({ in: ['QUEUED', 'SENT'] });
    expect(prisma.verification.count.mock.calls[0][0].where.status).toBe('VERIFIED');
  });

  it('uses calendar months in UTC', () => {
    const { start, end } = currentPeriod(new Date('2026-10-21T23:30:00Z'));
    expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  describe('usage alerts', () => {
    const org = { id: 'org-1', name: 'Mela', plan: 'FREE' } as any;

    it('sends nothing below 80%', async () => {
      const { billing, mail } = setup('FREE', 0, 0);
      await billing.sendUsageAlerts(org, 799, 1000);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('emails owners at 80%, once per month', async () => {
      const { billing, mail, prisma } = setup('FREE', 0, 0);
      await billing.sendUsageAlerts(org, 800, 1000);
      expect(mail.send).toHaveBeenCalledWith('owner@example.com', expect.stringContaining('80%'), expect.stringContaining('/o/org-1/live/billing'));
      const { Prisma } = jest.requireActual('@prisma/client');
      prisma.usageAlert.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      mail.send.mockClear();
      await billing.sendUsageAlerts(org, 850, 1000);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('sends both alerts when usage jumps past 100%', async () => {
      const { billing, mail } = setup('FREE', 0, 0);
      await billing.sendUsageAlerts(org, 1000, 1000);
      expect(mail.send.mock.calls.map((c) => c[1])).toEqual([expect.stringContaining('80%'), expect.stringContaining('paused')]);
    });
  });

  describe('abuse protection', () => {
    it('rejects every send from a suspended organization, sandbox included', async () => {
      const { billing, env } = setup('FREE', 0, 0, { status: 'SUSPENDED', suspendedReason: 'Spam reports' });
      for (const environment of [env, { ...env, type: 'SANDBOX' }]) {
        await expect(billing.assertWithinQuota(environment)).rejects.toMatchObject({ response: { code: 'org_suspended', message: expect.stringContaining('Spam reports') } });
      }
    });

    it('caps live sends per day until the organization is approved', async () => {
      const under = setup('FREE', 60, 39, { liveApprovedAt: null });
      await expect(under.billing.assertWithinQuota(under.env)).resolves.toBeUndefined();
      const at = setup('FREE', 60, 40, { liveApprovedAt: null });
      await expect(at.billing.assertWithinQuota(at.env)).rejects.toMatchObject({ response: { code: 'live_review_required' } });
    });

    it('does not cap the sandbox of an unapproved organization', async () => {
      const { billing, env } = setup('FREE', 5_000, 0, { liveApprovedAt: null });
      await expect(billing.assertWithinQuota({ ...env, type: 'SANDBOX' })).resolves.toBeUndefined();
    });
  });
});
