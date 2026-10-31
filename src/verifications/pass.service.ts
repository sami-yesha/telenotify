import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassIdentity, Verification } from '@prisma/client';
import { randomToken } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApiClient, TelegramApiError } from '../telegram/telegram-api.client';

// t.me/<pass bot>?start=j_<token> joins with a number just verified elsewhere.
export const PASS_JOIN_PREFIX = 'j_';
// callback_data of the Yes / No buttons: "p:<verificationId>:y" or ":n".
export const PASS_CALLBACK = /^p:([0-9a-f-]{36}):(y|n)$/;

// Limits on asking one person, so nobody can flood someone's Telegram with requests.
export const PASS_LIMITS = { perHour: 5, denialsPerBusinessPerDay: 2, joinWindowHours: 24 };

const RETRY_MAX_MS = 60_000;

/** "251911223344" → "+251 91•• ••• •44" */
export function maskPhone(phone: string): string {
  return `+${phone.replace(/^(\d{3})(\d{2})\d+(\d{2})$/, '$1 $2•• ••• •$3')}`;
}

// Telenotify Pass: verify a phone number once, then confirm it for any business on
// Telenotify with one tap in our own bot (PASS_BOT_TOKEN). Strictly opt-in: people
// join after verifying, or by sharing their number with the Pass bot, and /stop or
// blocking the bot deletes them. Without PASS_BOT_TOKEN everything here is off.
@Injectable()
export class PassService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PassService.name);
  private username?: string;
  private retryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    this.username = this.config.get<string>('PASS_BOT_USERNAME') || undefined;
    if (!this.enabled()) return;
    void this.setUp(0);
  }

  onModuleDestroy() {
    clearTimeout(this.retryTimer);
  }

  enabled(): boolean {
    return Boolean(this.config.get<string>('PASS_BOT_TOKEN'));
  }

  client(): TelegramApiClient {
    return new TelegramApiClient(this.config.getOrThrow<string>('PASS_BOT_TOKEN'));
  }

  botUsername(): string | undefined {
    return this.username;
  }

  // Same pattern as the sandbox bot: point the webhook at this server, retrying in the
  // background. Like any bot, only one server may use it (see docs/AUTO-DEPLOY.md).
  private async setUp(attempt: number): Promise<void> {
    try {
      const client = this.client();
      this.username = (await client.getMe()).username;
      const base = this.config.getOrThrow<string>('PUBLIC_BASE_URL').replace(/\/$/, '');
      await client.setWebhook(`${base}/telegram/pass-webhook`, this.config.getOrThrow('PASS_WEBHOOK_SECRET'), ['message', 'callback_query', 'my_chat_member']);
      this.logger.log(`Telenotify Pass bot @${this.username} ready`);
    } catch (error) {
      const delay = Math.min(RETRY_MAX_MS, 2_000 * 2 ** attempt);
      this.logger.error(`Pass bot setup failed (attempt ${attempt + 1}): ${(error as Error).message}. Retrying in ${delay / 1000}s.`);
      this.retryTimer = setTimeout(() => void this.setUp(attempt + 1), delay);
    }
  }

  // ---------- Asking a member to confirm ----------

  // Called for every new verification with an expected phone. If that number belongs to
  // a Pass member, send them a Yes/No. Never throws: the normal flow works regardless.
  async offer(verificationId: string): Promise<void> {
    if (!this.enabled()) return;
    let identity: PassIdentity | null = null;
    try {
      const verification = await this.prisma.verification.findUnique({ where: { id: verificationId }, include: { environment: { include: { org: true } } } });
      if (!verification?.expectedPhone || verification.status !== 'PENDING') return;
      identity = await this.prisma.passIdentity.findUnique({ where: { phone: verification.expectedPhone } });
      if (!identity || !(await this.mayAsk(identity, verification.environmentId))) return;

      const { org, type } = verification.environment;
      const verified = type === 'LIVE' && org.businessStatus === 'VERIFIED' && org.status === 'ACTIVE';
      const name = verified ? `${org.legalName ?? org.name} ✓` : org.name;
      const text = [
        type === 'SANDBOX' ? '[TEST] ' : '',
        `🔐 ${name} wants to confirm your phone number ${maskPhone(identity.phone)}.\n\n`,
        `Is this you, signing up or logging in right now?`,
        verified ? '' : `\n\n${org.name} is not a verified business on Telenotify. Only say yes if you just started this yourself.`,
      ].join('');
      const sent = await this.client().sendMessage(identity.chatId, text, {
        buttons: [
          [
            { text: "✅ Yes, it's me", callback_data: `p:${verification.id}:y` },
            { text: '✖ No', callback_data: `p:${verification.id}:n` },
          ],
        ],
      });
      await this.prisma.verification.update({
        where: { id: verification.id },
        data: { passIdentityId: identity.id, passPushedAt: new Date(), passMessageId: String(sent.message_id) },
      });
    } catch (error) {
      // They blocked the Pass bot or deleted the chat: they've left.
      if (identity && error instanceof TelegramApiError && (error.isBlocked || error.isChatGone)) {
        await this.prisma.passIdentity.deleteMany({ where: { id: identity.id } }).catch(() => undefined);
        return;
      }
      this.logger.warn(`Pass offer for verification ${verificationId} failed: ${(error as Error).message}`);
    }
  }

  private async mayAsk(identity: PassIdentity, environmentId: string): Promise<boolean> {
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    const [recent, denials] = await Promise.all([
      this.prisma.verification.count({ where: { passIdentityId: identity.id, passPushedAt: { gte: hourAgo } } }),
      this.prisma.verification.count({ where: { passIdentityId: identity.id, environmentId, reason: 'denied', passPushedAt: { gte: dayAgo } } }),
    ]);
    return recent < PASS_LIMITS.perHour && denials < PASS_LIMITS.denialsPerBusinessPerDay;
  }

  /** Shows the answer in place of the Yes/No buttons. Never throws. */
  async replaceRequest(verification: Pick<Verification, 'passMessageId'> & { passIdentity: PassIdentity | null }, text: string): Promise<void> {
    if (!verification.passMessageId || !verification.passIdentity) return;
    try {
      await this.client().editMessageText(verification.passIdentity.chatId, verification.passMessageId, text);
    } catch (error) {
      this.logger.warn(`Could not update a Pass request: ${(error as Error).message}`);
    }
  }

  // ---------- Joining and leaving ----------

  /** The "verify in one tap next time" link after a normal verification, if they aren't a member yet. */
  async joinUrl(verification: Verification): Promise<string | null> {
    if (!this.enabled() || !this.username || verification.status !== 'VERIFIED' || verification.method === 'pass') return null;
    if (!verification.telegramUserId || !verification.phone) return null;
    const member = await this.prisma.passIdentity.findUnique({ where: { telegramUserId: verification.telegramUserId } });
    if (member) return null;
    const token = verification.passJoinToken ?? (await this.prisma.verification.update({ where: { id: verification.id }, data: { passJoinToken: randomToken(18) } })).passJoinToken!;
    return `https://t.me/${this.username}?start=${PASS_JOIN_PREFIX}${token}`;
  }

  // From the join link: the number was just verified by Telegram for this same user.
  async joinWithToken(token: string, telegramUserId: number, chatId: string): Promise<PassIdentity | null> {
    const verification = await this.prisma.verification.findUnique({ where: { passJoinToken: token } });
    const fresh = verification?.verifiedAt && verification.verifiedAt.getTime() > Date.now() - PASS_LIMITS.joinWindowHours * 3_600_000;
    if (!verification || verification.status !== 'VERIFIED' || !fresh || verification.telegramUserId !== String(telegramUserId) || !verification.phone) return null;
    return this.save(String(telegramUserId), chatId, verification.phone);
  }

  // From sharing their own contact with the Pass bot directly.
  async joinWithContact(contact: { phone_number: string; user_id?: number }, telegramUserId: number, chatId: string): Promise<PassIdentity | null> {
    if (contact.user_id !== telegramUserId) return null;
    return this.save(String(telegramUserId), chatId, normalizePhone(contact.phone_number));
  }

  member(telegramUserId: number) {
    return this.prisma.passIdentity.findUnique({ where: { telegramUserId: String(telegramUserId) } });
  }

  async leave(telegramUserId: number): Promise<boolean> {
    const { count } = await this.prisma.passIdentity.deleteMany({ where: { telegramUserId: String(telegramUserId) } });
    return count > 0;
  }

  // A number belongs to one Telegram account at a time: if it moved, the old entry goes.
  private async save(telegramUserId: string, chatId: string, phone: string): Promise<PassIdentity> {
    return this.prisma.$transaction(async (tx) => {
      await tx.passIdentity.deleteMany({ where: { phone, NOT: { telegramUserId } } });
      return tx.passIdentity.upsert({ where: { telegramUserId }, create: { telegramUserId, chatId, phone }, update: { chatId, phone } });
    });
  }
}
