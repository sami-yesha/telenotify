import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Customer, Environment, Message, Organization, User } from '@prisma/client';
import { Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service';
import { decrypt, encrypt } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { toMessageView } from '../messages/message-view';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AfroMessageCredentials, AfroMessageError, checkAfroMessageToken, sendAfroMessage, toAfroMessageNumber } from './afromessage.client';
import { FallbackJob, SMS_FALLBACK_QUEUE } from './sms-fallback.constants';

type MessageWithCustomer = Message & { customer: Customer };

export interface UpdateSmsFallback {
  enabled?: boolean;
  /** New token; null removes the saved credentials. */
  token?: string | null;
  identifierId?: string | null;
  senderName?: string | null;
  /** Most SMS in any 24 hours; null removes the cap. */
  dailyLimit?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// When Telegram can't reach a customer, send the same text by SMS through the
// organization's own AfroMessage account. We never pay for or resell SMS: the
// organization's token and balance are used. The sandbox only simulates it.
@Injectable()
export class SmsFallbackService {
  private readonly logger = new Logger(SmsFallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
    private readonly audit: AuditService,
    @InjectQueue(SMS_FALLBACK_QUEUE) private readonly queue: Queue<FallbackJob>,
  ) {}

  // ---------- Settings ----------

  async view(environment: Environment) {
    const sandbox = environment.type === 'SANDBOX';
    return {
      dailyLimit: environment.smsDailyLimit,
      sentLast24h: await this.sentLast24h(environment.id),
      enabled: environment.smsFallbackEnabled,
      provider: 'afromessage',
      simulated: sandbox,
      configured: sandbox || Boolean(environment.afroTokenEncrypted),
      tokenHint: environment.afroTokenEncrypted ? `…${this.token(environment).slice(-4)}` : null,
      identifierId: environment.afroIdentifierId,
      senderName: environment.afroSenderName,
    };
  }

  async update(environment: Environment, dto: UpdateSmsFallback, actor: User) {
    const data: Partial<Environment> = {};
    let tokenCheck: Awaited<ReturnType<SmsFallbackService['checkToken']>> | undefined;
    if (dto.token === null) Object.assign(data, { afroTokenEncrypted: null, smsFallbackEnabled: false });
    else if (dto.token?.trim()) {
      // Ask AfroMessage first, so a typo is caught now and not when a customer misses an SMS.
      tokenCheck = await this.checkToken(dto.token.trim());
      data.afroTokenEncrypted = encrypt(dto.token.trim(), this.config.getOrThrow('ENCRYPTION_KEY'));
    }
    if (dto.identifierId !== undefined) data.afroIdentifierId = dto.identifierId?.trim() || null;
    if (dto.senderName !== undefined) data.afroSenderName = dto.senderName?.trim() || null;
    if (dto.dailyLimit !== undefined) data.smsDailyLimit = dto.dailyLimit;
    if (dto.enabled !== undefined && dto.token !== null) data.smsFallbackEnabled = dto.enabled;

    const hasToken = data.afroTokenEncrypted !== undefined ? Boolean(data.afroTokenEncrypted) : Boolean(environment.afroTokenEncrypted);
    if (environment.type === 'LIVE' && data.smsFallbackEnabled && !hasToken) {
      throw new BadRequestException('Add your AfroMessage API token before turning SMS fallback on');
    }
    const updated = await this.prisma.environment.update({ where: { id: environment.id }, data });
    await this.audit.record(environment.orgId, actor, 'sms_fallback.updated', environment.type.toLowerCase(), {
      enabled: updated.smsFallbackEnabled,
      ...(dto.dailyLimit !== undefined ? { dailyLimit: dto.dailyLimit } : {}),
      ...(data.afroTokenEncrypted !== undefined ? { token: data.afroTokenEncrypted ? 'replaced' : 'removed' } : {}),
    });
    return { ...(await this.view(updated)), ...(tokenCheck ? { tokenCheck } : {}) };
  }

  /** Re-checks the saved token, e.g. after topping up or rotating it on AfroMessage. */
  async checkSavedToken(environment: Environment) {
    if (!environment.afroTokenEncrypted) throw new BadRequestException('Add your AfroMessage API token first');
    return this.checkToken(this.token(environment));
  }

  // Rejects a token AfroMessage refuses. If AfroMessage can't be reached we still
  // save it, and say it wasn't checked, rather than block the settings page.
  private async checkToken(token: string): Promise<{ verified: boolean; balance: string | null }> {
    try {
      const result = await checkAfroMessageToken(token);
      if (!result.valid) throw new BadRequestException(`AfroMessage rejected this token: ${result.reason}. Copy it again from your AfroMessage dashboard.`);
      return { verified: true, balance: result.balance };
    } catch (error) {
      if (!(error instanceof AfroMessageError)) throw error;
      this.logger.warn(`Could not check an AfroMessage token: ${error.message}`);
      return { verified: false, balance: null };
    }
  }

  async sendTest(environment: Environment & { org: Organization }, phone: string) {
    const to = normalizePhone(phone);
    if (to.length < 9) throw new BadRequestException('Enter a valid phone number');
    if (environment.type === 'SANDBOX') return { ok: true, simulated: true, to };
    if (!environment.afroTokenEncrypted) throw new BadRequestException('Add your AfroMessage API token first');
    try {
      const { messageId } = await sendAfroMessage(this.credentials(environment), toAfroMessageNumber(to), `Telenotify test: SMS fallback for ${environment.org.name} works.`);
      return { ok: true, simulated: false, to, providerMessageId: messageId };
    } catch (error) {
      if (error instanceof AfroMessageError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  // ---------- Transparency ----------

  // Every SMS sent (or attempted) with the organization's token, newest first, so it
  // can be matched line by line against the sent log in their AfroMessage dashboard.
  async history(environment: Environment, before?: string) {
    const take = 50;
    const rows = await this.prisma.message.findMany({
      where: {
        environmentId: environment.id,
        fallbackStatus: { in: ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] },
        ...(before ? { fallbackAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { fallbackAt: 'desc' },
      take: take + 1,
      include: { customer: true },
    });
    const items = rows.slice(0, take).map((m) => ({
      messageId: m.id,
      to: m.customer.externalId,
      phone: m.customer.phone,
      status: m.fallbackStatus!.toLowerCase(),
      telegramReason: m.reason,
      providerMessageId: m.fallbackProviderId,
      error: m.fallbackError,
      at: m.fallbackAt,
    }));
    return { items, next: rows.length > take ? items[items.length - 1].at : null };
  }

  /** Queued or sent in the last 24 hours: what the daily limit counts. */
  private sentLast24h(environmentId: string) {
    return this.prisma.message.count({
      where: { environmentId, fallbackStatus: { in: ['QUEUED', 'SENT'] }, fallbackAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
  }

  // ---------- Sending ----------

  // Call once a message has ended UNDELIVERABLE or FAILED, before emitting its event,
  // so the event already says whether an SMS is on its way.
  async trigger(environment: Environment, message: MessageWithCustomer): Promise<MessageWithCustomer> {
    if (!environment.smsFallbackEnabled || !message.smsFallback || message.fallbackStatus) return message;
    if (environment.type === 'LIVE' && !environment.afroTokenEncrypted) return message;
    if (!message.customer.phone) {
      return this.prisma.message.update({
        where: { id: message.id },
        data: { fallbackStatus: 'SKIPPED', fallbackError: 'No phone number saved for this customer', fallbackAt: new Date() },
        include: { customer: true },
      });
    }
    if (environment.smsDailyLimit != null && (await this.sentLast24h(environment.id)) >= environment.smsDailyLimit) {
      this.logger.warn(`SMS fallback daily limit (${environment.smsDailyLimit}) reached for environment ${environment.id}`);
      return this.prisma.message.update({
        where: { id: message.id },
        data: { fallbackStatus: 'SKIPPED', fallbackError: `Your daily SMS limit (${environment.smsDailyLimit} in 24 hours) was reached`, fallbackAt: new Date() },
        include: { customer: true },
      });
    }
    // fallbackAt marks when it was queued until it's sent, so the daily limit counts it.
    const queued = await this.prisma.message.update({ where: { id: message.id }, data: { fallbackStatus: 'QUEUED', fallbackAt: new Date() }, include: { customer: true } });
    await this.queue.add('send', { messageId: message.id }, { jobId: `fallback_${message.id}` });
    return queued;
  }

  // Throwing makes the queue retry; on the last attempt we record FAILED instead.
  async deliver(messageId: string, isFinalAttempt: boolean): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, include: { customer: true, environment: true } });
    if (!message || message.fallbackStatus !== 'QUEUED') return;
    const { environment, customer } = message;

    if (environment.type === 'SANDBOX') return this.markSent(environment, message, 'simulated');
    if (!environment.smsFallbackEnabled || !environment.afroTokenEncrypted || !customer.phone) {
      return this.markFailed(environment, message, 'SMS fallback was turned off before this message was sent');
    }
    try {
      const { messageId: providerId } = await sendAfroMessage(this.credentials(environment), toAfroMessageNumber(customer.phone), smsText(message));
      await this.markSent(environment, message, providerId ?? 'unknown');
    } catch (error) {
      const retryable = !(error instanceof AfroMessageError) || error.retryable;
      if (retryable && !isFinalAttempt) throw error;
      this.logger.warn(`SMS fallback failed for message ${message.id}: ${(error as Error).message}`);
      await this.markFailed(environment, message, (error as Error).message);
    }
  }

  private async markSent(environment: Environment, message: MessageWithCustomer, providerId: string) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { fallbackStatus: 'SENT', fallbackProviderId: providerId, fallbackError: null, fallbackAt: new Date() },
      include: { customer: true },
    });
    await this.webhooks.emit(environment, 'message.fallback_sent', toMessageView(updated));
  }

  private async markFailed(environment: Environment, message: MessageWithCustomer, error: string) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { fallbackStatus: 'FAILED', fallbackError: error.slice(0, 500), fallbackAt: new Date() },
      include: { customer: true },
    });
    await this.webhooks.emit(environment, 'message.fallback_failed', toMessageView(updated));
  }

  private token(environment: Environment): string {
    return decrypt(environment.afroTokenEncrypted!, this.config.getOrThrow('ENCRYPTION_KEY'));
  }

  private credentials(environment: Environment): AfroMessageCredentials {
    return { token: this.token(environment), identifierId: environment.afroIdentifierId, senderName: environment.afroSenderName };
  }
}

/** The message text, with URL buttons written out since SMS has none. */
export function smsText(message: Pick<Message, 'text' | 'buttons'>): string {
  const buttons = ((message.buttons as { text: string; url: string }[][] | null) ?? []).flat();
  return [message.text, ...buttons.map((b) => `${b.text}: ${b.url}`)].join('\n');
}
