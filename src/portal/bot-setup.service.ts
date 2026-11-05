import { BadRequestException, ConflictException, HttpException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, Organization, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { encrypt, randomToken, sha256 } from '../common/crypto';
import { privacyUrl } from '../common/privacy';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApiClient, TelegramApiError } from '../telegram/telegram-api.client';
import { TelegramUpdate, TelegramUser } from '../telegram/telegram-update.types';
import { TelegramService } from '../telegram/telegram.service';
import { PortalService } from './portal.service';

// t.me/<setup bot>?start=s_<code> opens the setup for one organization.
export const SETUP_START_PREFIX = 's_';
export const SETUP_TTL_MINUTES = 15;
const RETRY_MAX_MS = 60_000;

const NOT_LINKED =
  'This chat sets up Telegram bots for Telenotify.\n\n' +
  'To start, open the Bot page of your live environment in the Telenotify portal and choose "Create my bot".';
const EXPIRED = 'This setup link has expired or was already used. Open the Bot page in the Telenotify portal and choose "Create my bot" again.';

/** "Abebe Pharmacy" → "abebe_pharmacy_bot": a valid Telegram bot username (5–32 characters). */
export function suggestUsername(orgName: string): string {
  let base = orgName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[_0-9]+|_+$/g, '');
  base = base.replace(/_?bot$/, '').slice(0, 28).replace(/_+$/, '');
  if (base.length < 3) base = `${base}_notify`.replace(/^_/, '');
  return `${base}_bot`;
}

// Guided bot setup: our own setup bot (SETUP_BOT_TOKEN, with Bot Management Mode on in
// the @BotFather Mini App) creates the organization's bot through Telegram's Managed
// Bots, fetches its token and connects it. The business owns the bot; nobody copies a
// token. Also edits the profile (name, description, photo) of any connected live bot.
// Without SETUP_BOT_TOKEN the guided setup is off and pasting a token still works.
@Injectable()
export class BotSetupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotSetupService.name);
  private username?: string;
  private retryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
    private readonly portal: PortalService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (this.enabled()) void this.setUp(0);
  }

  onModuleDestroy() {
    clearTimeout(this.retryTimer);
  }

  enabled(): boolean {
    return Boolean(this.config.get<string>('SETUP_BOT_TOKEN'));
  }

  client(): TelegramApiClient {
    return new TelegramApiClient(this.config.getOrThrow<string>('SETUP_BOT_TOKEN'));
  }

  // Same pattern as the Pass bot: point the webhook here, retrying in the background.
  private async setUp(attempt: number): Promise<void> {
    try {
      const client = this.client();
      const me = (await client.getMe()) as { username: string; can_manage_bots?: boolean };
      if (!me.can_manage_bots) {
        this.logger.warn(`Setup bot @${me.username} can't create bots yet: turn on Bot Management Mode for it in the @BotFather Mini App.`);
      }
      const base = this.config.getOrThrow<string>('PUBLIC_BASE_URL').replace(/\/$/, '');
      await client.setWebhook(`${base}/telegram/setup-webhook`, this.config.getOrThrow('SETUP_WEBHOOK_SECRET'), ['message', 'managed_bot']);
      this.username = me.username;
      this.logger.log(`Setup bot @${this.username} ready`);
    } catch (error) {
      const delay = Math.min(RETRY_MAX_MS, 2_000 * 2 ** attempt);
      this.logger.error(`Setup bot failed to start (attempt ${attempt + 1}): ${(error as Error).message}. Retrying in ${delay / 1000}s.`);
      this.retryTimer = setTimeout(() => void this.setUp(attempt + 1), delay);
    }
  }

  // ---------- Portal ----------

  /** A single-use link that opens the setup bot for this environment. */
  async start(environment: Environment & { org: Organization }, actor: User) {
    if (!this.enabled()) throw new BadRequestException('Creating a bot from Telegram is not available on this server. Paste a bot token instead.');
    if (environment.type !== 'LIVE') throw new BadRequestException('The sandbox uses the shared Telenotify bot');
    if (environment.botTokenEncrypted) throw new ConflictException('A bot is already connected. Disconnect it first.');
    if (!this.username) throw new ServiceUnavailableException('The setup bot is still starting. Try again in a minute.');

    const code = randomToken(18);
    const expiresAt = new Date(Date.now() + SETUP_TTL_MINUTES * 60_000);
    await this.prisma.environment.update({
      where: { id: environment.id },
      data: { botSetupCodeHash: sha256(code), botSetupExpiresAt: expiresAt, botSetupUserId: actor.id, botSetupTelegramId: null, botSetupError: null },
    });
    await this.audit.record(environment.orgId, actor, 'bot.setup_started');
    return { url: `https://t.me/${this.username}?start=${SETUP_START_PREFIX}${code}`, expiresAt };
  }

  async cancel(environment: Environment) {
    const updated = await this.prisma.environment.update({
      where: { id: environment.id },
      data: { botSetupCodeHash: null, botSetupExpiresAt: null, botSetupTelegramId: null, botSetupError: null },
    });
    return this.portal.environmentView(updated);
  }

  // ---------- Setup bot updates ----------

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.managed_bot) return this.onManagedBot(update.managed_bot.user, update.managed_bot.bot);
    const message = update.message;
    // Only plain text in private chats; service messages (e.g. "bot created") are ignored,
    // the managed_bot update carries the same news.
    if (!message?.from || message.chat.type !== 'private' || !message.text) return;
    const chatId = String(message.chat.id);
    const text = message.text.trim();
    if (text.startsWith(`/start ${SETUP_START_PREFIX}`)) return this.onStart(message.from, chatId, text.slice(`/start ${SETUP_START_PREFIX}`.length).trim());
    await this.client().removeKeyboardMessage(chatId, NOT_LINKED);
  }

  private async onStart(from: TelegramUser, chatId: string, code: string) {
    const bot = this.client();
    const environment = code
      ? await this.prisma.environment.findUnique({ where: { botSetupCodeHash: sha256(code) }, include: { org: true } })
      : null;
    if (!environment || !environment.botSetupExpiresAt || environment.botSetupExpiresAt < new Date() || environment.botTokenEncrypted) {
      await bot.removeKeyboardMessage(chatId, EXPIRED);
      return;
    }
    // The first Telegram account to open the link owns this setup.
    const claimed = await this.prisma.environment.updateMany({
      where: { id: environment.id, OR: [{ botSetupTelegramId: null }, { botSetupTelegramId: String(from.id) }] },
      data: { botSetupTelegramId: String(from.id) },
    });
    if (!claimed.count) {
      await bot.removeKeyboardMessage(chatId, 'This setup link was already opened from another Telegram account. Open the Bot page in the Telenotify portal to start again.');
      return;
    }
    const name = environment.org.name.trim().slice(0, 64);
    await bot.sendCreateBotButton(
      chatId,
      `Let's create the Telegram bot for ${name}.\n\n` +
        "Tap the button below, check the name and username, and confirm. You'll own the bot; Telenotify connects it and sets it up for you.",
      { label: '🤖 Create my bot', suggestedName: name, suggestedUsername: suggestUsername(name) },
    );
  }

  private async onManagedBot(creator: TelegramUser, bot: TelegramUser) {
    const chatId = String(creator.id);
    // Telegram also sends this when a connected bot's token changes, and repeats updates
    // it thinks we missed.
    const existing = await this.prisma.environment.findFirst({ where: { type: 'LIVE', botUsername: bot.username } });
    if (existing) {
      if (existing.botManaged) await this.refreshToken(existing, bot.id);
      return;
    }

    const environment = await this.prisma.environment.findFirst({
      where: { botSetupTelegramId: chatId, botSetupExpiresAt: { gt: new Date() }, botSetupCodeHash: { not: null }, botTokenEncrypted: null },
      include: { org: true },
      orderBy: { botSetupExpiresAt: 'desc' },
    });
    if (!environment) {
      await this.client().removeKeyboardMessage(chatId, `@${bot.username} isn't linked to a Telenotify setup.\n\n${NOT_LINKED}`);
      return;
    }
    // Claim it once, so a repeated update can't connect twice.
    const claimed = await this.prisma.environment.updateMany({
      where: { id: environment.id, botSetupCodeHash: environment.botSetupCodeHash },
      data: { botSetupCodeHash: null },
    });
    if (!claimed.count) return;

    try {
      const actor = environment.botSetupUserId ? await this.prisma.user.findUnique({ where: { id: environment.botSetupUserId } }) : null;
      if (!actor) throw new BadRequestException('The person who started this setup no longer has an account');
      const token = await this.client().getManagedBotToken(bot.id);
      await this.portal.connectBot(environment, token, actor);
      await this.prisma.environment.update({
        where: { id: environment.id },
        data: { botManaged: true, botSetupExpiresAt: null, botSetupTelegramId: null, botSetupError: null },
      });
      await this.describe(this.telegram.clientForToken(token), environment.org.name);
      await this.client().removeKeyboardMessage(
        chatId,
        `✅ @${bot.username} is connected to ${environment.org.name} on Telenotify.\n\n` +
          'Go back to the portal to add your logo and finish going live. Your customers will get messages from this bot.',
      );
    } catch (error) {
      const reason =
        error instanceof HttpException ? error.message : error instanceof TelegramApiError ? `Telegram said: ${error.description}` : 'Something went wrong on our side';
      this.logger.error(`Bot setup for environment ${environment.id} failed: ${(error as Error).message}`);
      await this.prisma.environment.update({ where: { id: environment.id }, data: { botSetupExpiresAt: null, botSetupError: reason } });
      await this.client()
        .removeKeyboardMessage(chatId, `We created @${bot.username} but couldn't connect it: ${reason}\n\nOpen the Bot page in the portal to try again.`)
        .catch(() => undefined);
    }
  }

  // A sensible profile for a brand-new bot; the business can change it in the portal.
  // The privacy link and /privacy command keep it within Telegram's bot terms.
  private async describe(client: TelegramApiClient, orgName: string) {
    const privacy = privacyUrl(this.config.get<string>('PORTAL_URL', ''));
    try {
      await client.setMyDescription(
        `Official notifications from ${orgName.slice(0, 200)}: receipts, order updates, alerts and login codes.\n\nPrivacy policy: ${privacy}`,
      );
      await client.setMyShortDescription(`Official notifications from ${orgName}.`.slice(0, 120));
      await client.setMyCommands([{ command: 'privacy', description: 'How your data is handled' }]);
    } catch (error) {
      this.logger.warn(`Could not set the new bot's description: ${(error as Error).message}`);
    }
  }

  private async refreshToken(environment: Environment, botId: number) {
    try {
      const token = await this.client().getManagedBotToken(botId);
      const base = this.config.getOrThrow<string>('PUBLIC_BASE_URL').replace(/\/$/, '');
      await this.telegram.clientForToken(token).setWebhook(`${base}/telegram/webhook/${environment.id}`, environment.webhookSecret);
      await this.prisma.environment.update({
        where: { id: environment.id },
        data: { botTokenEncrypted: encrypt(token, this.config.getOrThrow('ENCRYPTION_KEY')) },
      });
      this.logger.log(`Token of managed bot @${environment.botUsername} refreshed`);
    } catch (error) {
      this.logger.error(`Could not refresh the token of @${environment.botUsername}: ${(error as Error).message}`);
    }
  }

  // ---------- Bot profile (any connected live bot) ----------

  async profile(environment: Environment) {
    const client = this.liveClient(environment);
    const [name, description, shortDescription] = await Promise.all([client.getMyName(), client.getMyDescription(), client.getMyShortDescription()]).catch(
      (error) => {
        throw this.telegramError(error);
      },
    );
    return { name: name.name, description: description.description, shortDescription: shortDescription.short_description };
  }

  async updateProfile(environment: Environment, profile: { name?: string; description?: string; shortDescription?: string }, actor: User) {
    const client = this.liveClient(environment);
    try {
      if (profile.name !== undefined) await client.setMyName(profile.name.trim());
      if (profile.description !== undefined) await client.setMyDescription(profile.description.trim());
      if (profile.shortDescription !== undefined) await client.setMyShortDescription(profile.shortDescription.trim());
    } catch (error) {
      throw this.telegramError(error);
    }
    await this.audit.record(environment.orgId, actor, 'bot.profile_updated', `@${environment.botUsername}`);
    return this.profile(environment);
  }

  /** `jpegBase64`: the portal crops and converts the image to a JPEG first. */
  async setPhoto(environment: Environment, jpegBase64: string, actor: User) {
    const jpeg = Buffer.from(jpegBase64, 'base64');
    if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) throw new BadRequestException('The photo must be a JPEG image');
    try {
      await this.liveClient(environment).setMyProfilePhoto(jpeg);
    } catch (error) {
      throw this.telegramError(error);
    }
    await this.audit.record(environment.orgId, actor, 'bot.profile_updated', `@${environment.botUsername}`, { photo: true });
    return { ok: true };
  }

  private liveClient(environment: Environment): TelegramApiClient {
    if (environment.type !== 'LIVE') throw new BadRequestException('The sandbox uses the shared Telenotify bot');
    return this.telegram.clientForEnvironment(environment);
  }

  private telegramError(error: unknown): unknown {
    return error instanceof TelegramApiError ? new BadRequestException(`Telegram said: ${error.description}`) : error;
  }
}
