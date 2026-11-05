import { BadRequestException } from '@nestjs/common';
import { sha256 } from '../common/crypto';
import { TelegramApiClient } from '../telegram/telegram-api.client';
import { BotSetupService, suggestUsername } from './bot-setup.service';

const org = { id: 'org-1', name: 'Abebe Pharmacy' };
const actor = { id: 'user-1', email: 'owner@abebe.et' };
const live = (extra: object = {}) => ({
  id: 'env-1',
  orgId: 'org-1',
  type: 'LIVE',
  botTokenEncrypted: null,
  botUsername: null,
  botManaged: false,
  webhookSecret: 'whs',
  botSetupCodeHash: sha256('code123'),
  botSetupExpiresAt: new Date(Date.now() + 60_000),
  botSetupTelegramId: null,
  botSetupUserId: 'user-1',
  org,
  ...extra,
});

function setup(opts: { byCode?: object | null; byUsername?: object | null; pending?: object | null; claim?: number; enabled?: boolean } = {}) {
  const prisma = {
    environment: {
      findUnique: jest.fn().mockResolvedValue(opts.byCode === undefined ? live() : opts.byCode),
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(opts.byUsername ?? null)
        .mockResolvedValueOnce(opts.pending === undefined ? live({ botSetupTelegramId: '42' }) : opts.pending),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...live(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claim ?? 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(actor) },
  };
  const values: Record<string, string> = {
    ...(opts.enabled === false ? {} : { SETUP_BOT_TOKEN: 'setup-token' }),
    SETUP_WEBHOOK_SECRET: 's',
    PUBLIC_BASE_URL: 'https://api.example.com',
    PORTAL_URL: 'https://portal.example.com',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const config = { get: (k: string) => values[k], getOrThrow: (k: string) => values[k] };
  const telegram = { clientForToken: (t: string) => new TelegramApiClient(t), clientForEnvironment: () => new TelegramApiClient('live') };
  const portal = { connectBot: jest.fn().mockResolvedValue({}), environmentView: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn() };
  const proto = TelegramApiClient.prototype;
  const spies = {
    removeKeyboard: jest.spyOn(proto, 'removeKeyboardMessage').mockResolvedValue({ message_id: 1 }),
    createButton: jest.spyOn(proto, 'sendCreateBotButton').mockResolvedValue({ message_id: 2 }),
    managedToken: jest.spyOn(proto, 'getManagedBotToken').mockResolvedValue('999:new-token'),
    description: jest.spyOn(proto, 'setMyDescription').mockResolvedValue(true),
    shortDescription: jest.spyOn(proto, 'setMyShortDescription').mockResolvedValue(true),
    commands: jest.spyOn(proto, 'setMyCommands').mockResolvedValue(true),
    setWebhook: jest.spyOn(proto, 'setWebhook').mockResolvedValue(true),
  };
  const service = new BotSetupService(prisma as any, config as any, telegram as any, portal as any, audit as any);
  (service as any).username = 'TelenotifySetupBot_bot';
  return { service, prisma, portal, audit, spies };
}

const start = (text: string, from = 42) => ({ update_id: 1, message: { message_id: 1, from: { id: from }, chat: { id: from, type: 'private' }, text } });
const created = (username = 'abebe_pharmacy_bot', creator = 42) => ({ update_id: 2, managed_bot: { user: { id: creator }, bot: { id: 999, username } } });

afterEach(() => jest.restoreAllMocks());

describe('suggestUsername', () => {
  it('makes a valid bot username from the organization name', () => {
    expect(suggestUsername('Abebe Pharmacy')).toBe('abebe_pharmacy_bot');
    expect(suggestUsername('Mela Loans Bot')).toBe('mela_loans_bot');
    expect(suggestUsername('ቡና ቤት')).toBe('notify_bot');
    expect(suggestUsername('2go')).toBe('go_notify_bot');
    const long = suggestUsername('A very long organization name that keeps going');
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long).toMatch(/^[a-z][a-z0-9_]{3,}_bot$/);
  });
});

describe('BotSetupService.start', () => {
  it('returns a single-use setup link and stores only its hash', async () => {
    const { service, prisma, audit } = setup();
    const result = await service.start(live({ botSetupCodeHash: null }) as any, actor as any);
    const code = result.url.replace('https://t.me/TelenotifySetupBot_bot?start=s_', '');
    expect(code).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(prisma.environment.update.mock.calls[0][0].data).toMatchObject({ botSetupCodeHash: sha256(code), botSetupUserId: 'user-1', botSetupTelegramId: null });
    expect(audit.record).toHaveBeenCalledWith('org-1', actor, 'bot.setup_started');
  });

  it('refuses when a bot is connected, in the sandbox, or when the server has no setup bot', async () => {
    await expect(setup().service.start(live({ botTokenEncrypted: 'x' }) as any, actor as any)).rejects.toThrow('already connected');
    await expect(setup().service.start(live({ type: 'SANDBOX' }) as any, actor as any)).rejects.toThrow('sandbox');
    await expect(setup({ enabled: false }).service.start(live() as any, actor as any)).rejects.toThrow('Paste a bot token');
  });
});

describe('BotSetupService: opening the setup link', () => {
  it('claims the setup for this Telegram account and offers the "Create my bot" button', async () => {
    const { service, prisma, spies } = setup();
    await service.handleUpdate(start('/start s_code123') as any);
    expect(prisma.environment.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { botSetupCodeHash: sha256('code123') } }));
    expect(prisma.environment.updateMany.mock.calls[0][0].data).toEqual({ botSetupTelegramId: '42' });
    const [chatId, text, button] = spies.createButton.mock.calls[0];
    expect(chatId).toBe('42');
    expect(text).toContain('Abebe Pharmacy');
    expect(button).toEqual({ label: '🤖 Create my bot', suggestedName: 'Abebe Pharmacy', suggestedUsername: 'abebe_pharmacy_bot' });
  });

  it('rejects unknown, expired or already-connected setups', async () => {
    for (const byCode of [null, live({ botSetupExpiresAt: new Date(Date.now() - 1000) }), live({ botTokenEncrypted: 'x' })]) {
      const { service, spies } = setup({ byCode });
      await service.handleUpdate(start('/start s_code123') as any);
      expect(spies.removeKeyboard.mock.calls[0][1]).toContain('expired');
      expect(spies.createButton).not.toHaveBeenCalled();
    }
  });

  it('rejects a second Telegram account opening the same link', async () => {
    const { service, spies } = setup({ claim: 0 });
    await service.handleUpdate(start('/start s_code123', 77) as any);
    expect(spies.removeKeyboard.mock.calls[0][1]).toContain('another Telegram account');
    expect(spies.createButton).not.toHaveBeenCalled();
  });

  it('explains what the bot is for on any other message, and ignores service messages', async () => {
    const { service, spies } = setup();
    await service.handleUpdate(start('/start') as any);
    expect(spies.removeKeyboard.mock.calls[0][1]).toContain('Create my bot');
    await service.handleUpdate({ update_id: 3, message: { message_id: 2, from: { id: 42 }, chat: { id: 42, type: 'private' } } } as any);
    expect(spies.removeKeyboard).toHaveBeenCalledTimes(1);
  });
});

describe('BotSetupService: the bot is created', () => {
  it('fetches the token, connects the bot, describes it and tells the person', async () => {
    const { service, prisma, portal, spies } = setup();
    await service.handleUpdate(created() as any);
    expect(prisma.environment.findFirst.mock.calls[1][0].where).toMatchObject({ botSetupTelegramId: '42', botTokenEncrypted: null });
    expect(spies.managedToken).toHaveBeenCalledWith(999);
    expect(portal.connectBot).toHaveBeenCalledWith(expect.objectContaining({ id: 'env-1' }), '999:new-token', actor);
    expect(prisma.environment.update.mock.calls[0][0].data).toMatchObject({ botManaged: true, botSetupExpiresAt: null, botSetupError: null });
    expect(spies.description.mock.calls[0][0]).toContain('Official notifications from Abebe Pharmacy');
    expect(spies.description.mock.calls[0][0]).toContain('Privacy policy: https://portal.example.com/privacy#customers');
    expect(spies.commands).toHaveBeenCalledWith([{ command: 'privacy', description: 'How your data is handled' }]);
    expect(spies.removeKeyboard.mock.calls[0][1]).toContain('✅ @abebe_pharmacy_bot is connected to Abebe Pharmacy');
  });

  it('connects only once when Telegram repeats the update', async () => {
    const { service, portal } = setup({ claim: 0 });
    await service.handleUpdate(created() as any);
    expect(portal.connectBot).not.toHaveBeenCalled();
  });

  it('refreshes the stored token when a managed bot’s token changes', async () => {
    const { service, prisma, portal, spies } = setup({ byUsername: live({ botUsername: 'abebe_pharmacy_bot', botManaged: true, botTokenEncrypted: 'old' }) });
    await service.handleUpdate(created() as any);
    expect(portal.connectBot).not.toHaveBeenCalled();
    expect(spies.setWebhook).toHaveBeenCalledWith('https://api.example.com/telegram/webhook/env-1', 'whs');
    expect(prisma.environment.update.mock.calls[0][0].data.botTokenEncrypted).toEqual(expect.any(String));
  });

  it('leaves bots connected by pasting a token alone', async () => {
    const { service, prisma, spies } = setup({ byUsername: live({ botUsername: 'abebe_pharmacy_bot', botManaged: false, botTokenEncrypted: 'x' }) });
    await service.handleUpdate(created() as any);
    expect(spies.managedToken).not.toHaveBeenCalled();
    expect(prisma.environment.update).not.toHaveBeenCalled();
  });

  it('tells the person when the bot is not part of a setup', async () => {
    const { service, portal, spies } = setup({ pending: null });
    await service.handleUpdate(created() as any);
    expect(portal.connectBot).not.toHaveBeenCalled();
    expect(spies.removeKeyboard.mock.calls[0][1]).toContain("isn't linked to a Telenotify setup");
  });

  it('records the reason when connecting fails, for the portal to show', async () => {
    const { service, prisma, portal, spies } = setup();
    portal.connectBot.mockRejectedValue(new BadRequestException('Telegram could not reach this server'));
    await service.handleUpdate(created() as any);
    expect(prisma.environment.update.mock.calls[0][0].data).toEqual({ botSetupExpiresAt: null, botSetupError: 'Telegram could not reach this server' });
    expect(spies.removeKeyboard.mock.calls[0][1]).toContain("couldn't connect it: Telegram could not reach this server");
  });
});

describe('BotSetupService: profile photo', () => {
  it('accepts only JPEG images', async () => {
    const { service } = setup();
    const photo = jest.spyOn(TelegramApiClient.prototype, 'setMyProfilePhoto').mockResolvedValue(true);
    await expect(service.setPhoto(live({ botTokenEncrypted: 'x', botUsername: 'b' }) as any, Buffer.from('PNG').toString('base64'), actor as any)).rejects.toThrow('JPEG');
    await service.setPhoto(live({ botTokenEncrypted: 'x', botUsername: 'b' }) as any, Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'), actor as any);
    expect(photo).toHaveBeenCalledTimes(1);
  });
});
