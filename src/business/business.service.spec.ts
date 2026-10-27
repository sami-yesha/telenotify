import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessService } from './business.service';

const actor = { id: 'u-1', email: 'owner@abebe.et', name: 'Owner' } as any;
const baseOrg = { id: 'org-1', name: 'Abebe', status: 'ACTIVE', businessStatus: 'NONE', legalName: null, tin: null, tradeLicense: null, website: null } as any;
const details = { legalName: 'Abebe Pharmacy PLC', tin: '0012345678', tradeLicense: 'AA/14/1/1234/2016' };

function setup(org: object = {}, shortDescription = '') {
  const current = { ...baseOrg, ...org };
  const bot = { setMyShortDescription: jest.fn().mockResolvedValue(true), getMyShortDescription: jest.fn().mockResolvedValue({ short_description: shortDescription }) };
  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...current, ...data })),
    },
    environment: { findFirst: jest.fn().mockResolvedValue({ id: 'live-1', type: 'LIVE', botTokenEncrypted: 'enc', botUsername: 'abebe_bot', org: current }) },
    membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: 'owner@abebe.et', name: 'Owner' } }]) },
  };
  const mail = { send: jest.fn() };
  const notifier = { notify: jest.fn() };
  const telegram = { clientForEnvironment: jest.fn().mockReturnValue(bot) };
  const config = { get: () => 'https://telenotify.duckdns.org' };
  const service = new BusinessService(prisma as any, config as any, { record: jest.fn() } as any, mail as any, notifier as any, telegram as any);
  return { service, prisma, mail, notifier, bot, org: current };
}

describe('BusinessService', () => {
  it('lets an owner request verification and tells the operators', async () => {
    const { service, notifier, org } = setup();
    expect(await service.request(org, 'OWNER', actor, details)).toMatchObject({ status: 'pending', legalName: 'Abebe Pharmacy PLC', tin: '0012345678' });
    expect(notifier.notify).toHaveBeenCalledWith('Business verification: Abebe', expect.stringContaining('TIN: 0012345678'));
  });

  it('refuses members, duplicates and changes after approval', async () => {
    await expect(setup().service.request(baseOrg, 'MEMBER', actor, details)).rejects.toBeInstanceOf(ForbiddenException);
    const pending = setup({ businessStatus: 'PENDING' });
    await expect(pending.service.request(pending.org, 'OWNER', actor, details)).rejects.toThrow(/already being reviewed/);
    const verified = setup({ businessStatus: 'VERIFIED' });
    await expect(verified.service.request(verified.org, 'OWNER', actor, details)).rejects.toThrow(/Already verified/);
  });

  it('approves and emails the owners', async () => {
    const { service, mail } = setup({ businessStatus: 'PENDING', ...details });
    expect(await service.approve('org-1', actor)).toMatchObject({ status: 'verified', verifiedAt: expect.any(Date) });
    expect(mail.send).toHaveBeenCalledWith('owner@abebe.et', expect.stringContaining('verified business'), expect.any(String));
  });

  it('revoking removes our badge from the bot, but not a description the business wrote', async () => {
    const ours = setup({ businessStatus: 'VERIFIED', ...details }, '✓ Verified business on Telenotify: Abebe Pharmacy PLC');
    expect(await ours.service.reject('org-1', 'License expired', actor)).toMatchObject({ status: 'rejected', rejectReason: 'License expired' });
    expect(ours.bot.setMyShortDescription).toHaveBeenCalledWith('');

    const theirs = setup({ businessStatus: 'VERIFIED', ...details }, 'Order medicine 24/7');
    await theirs.service.reject('org-1', 'License expired', actor);
    expect(theirs.bot.setMyShortDescription).not.toHaveBeenCalled();
  });

  it('puts the badge on the bot profile within Telegram’s 120 characters', async () => {
    const { service, bot, org } = setup({ businessStatus: 'VERIFIED', ...details });
    const { shortDescription } = await service.showOnBot(org, 'OWNER', actor);
    expect(shortDescription).toBe('✓ Verified business on Telenotify: Abebe Pharmacy PLC. Check any bot at telenotify.duckdns.org/check');
    expect(shortDescription.length).toBeLessThanOrEqual(120);
    expect(bot.setMyShortDescription).toHaveBeenCalledWith(shortDescription);
    await expect(setup().service.showOnBot(baseOrg, 'OWNER', actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('public lookup', () => {
    it('confirms a verified business by its bot', async () => {
      const { service } = setup({ businessStatus: 'VERIFIED', businessVerifiedAt: new Date('2026-10-27'), ...details });
      expect(await service.lookup('@Abebe_Bot')).toEqual({ botUsername: 'abebe_bot', onTelenotify: true, verified: true, legalName: 'Abebe Pharmacy PLC', website: null, verifiedSince: new Date('2026-10-27') });
    });

    it('shows no details for unverified or suspended businesses', async () => {
      expect(await setup().service.lookup('abebe_bot')).toEqual({ botUsername: 'abebe_bot', onTelenotify: true, verified: false });
      expect(await setup({ businessStatus: 'VERIFIED', status: 'SUSPENDED', ...details }).service.lookup('abebe_bot')).toMatchObject({ verified: false });
    });

    it('says when a bot is not on Telenotify, and rejects junk', async () => {
      const { service, prisma } = setup();
      prisma.environment.findFirst.mockResolvedValue(null);
      expect(await service.lookup('random_bot')).toEqual({ botUsername: 'random_bot', onTelenotify: false, verified: false });
      await expect(service.lookup('no')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
