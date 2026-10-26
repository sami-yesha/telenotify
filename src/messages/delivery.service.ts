import { Injectable, Logger } from '@nestjs/common';
import { Customer, Environment, Message, Organization } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { isTestCustomer, TEST_CUSTOMERS } from '../common/sandbox';
import { PrismaService } from '../prisma/prisma.service';
import { InlineButton, TelegramApiError } from '../telegram/telegram-api.client';
import { TelegramService } from '../telegram/telegram.service';
import { SmsFallbackService } from '../sms-fallback/sms-fallback.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { toMessageView } from './message-view';
import { toPlainText, toTelegramHtml } from './rich-text';

type LoadedMessage = Message & { customer: Customer; environment: Environment & { org: Organization } };

// Throwing signals a transient failure so the queue retries. On the final
// attempt we record FAILED instead of throwing.
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly webhooks: WebhooksService,
    private readonly smsFallback: SmsFallbackService,
    private readonly admin: AdminService,
  ) {}

  async deliver(messageId: string, isFinalAttempt: boolean): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { customer: true, environment: { include: { org: true } } },
    });
    if (!message || message.status !== 'QUEUED') return;
    await this.prisma.message.update({ where: { id: message.id }, data: { attempts: { increment: 1 } } });
    const { customer, environment } = message;

    if (environment.type === 'SANDBOX' && isTestCustomer(customer.externalId)) {
      return this.simulate(message, TEST_CUSTOMERS[customer.externalId].outcome);
    }
    // The customer may have unlinked or blocked the bot since the message was queued.
    if (!customer.telegramChatId) return this.markUndeliverable(message, 'not_linked');
    if (customer.blockedAt) return this.markUndeliverable(message, 'blocked');

    const sandboxTag = environment.type === 'SANDBOX' ? `[SANDBOX · ${environment.org.name}]\n` : '';
    const html = message.format === 'MARKDOWN';
    const client = this.telegram.clientForEnvironment(environment);
    const buttons = (message.buttons as InlineButton[][] | null) ?? undefined;
    try {
      let sent: { message_id: number };
      try {
        sent = await client.sendMessage(customer.telegramChatId, html ? escapeHtml(sandboxTag) + toTelegramHtml(message.text) : sandboxTag + message.text, { buttons, html });
      } catch (error) {
        // Formatting Telegram won't accept should never cost the customer the message.
        if (!html || !(error instanceof TelegramApiError) || !/can't parse entities/i.test(error.description)) throw error;
        this.logger.warn(`Telegram rejected the formatting of message ${message.id}; sending it as plain text`);
        sent = await client.sendMessage(customer.telegramChatId, sandboxTag + toPlainText(message.text), { buttons });
      }
      await this.markSent(message, String(sent.message_id));
    } catch (error) {
      await this.handleTelegramError(message, error, isFinalAttempt);
    }
  }

  private async simulate(message: LoadedMessage, outcome: (typeof TEST_CUSTOMERS)[keyof typeof TEST_CUSTOMERS]['outcome']) {
    switch (outcome) {
      case 'sent':
        return this.markSent(message, `test-${Date.now()}`);
      case 'chat_gone':
        return this.markUndeliverable(message, 'chat_gone');
      case 'telegram_unavailable':
        return this.markFailed(message, 'telegram_unavailable', 'Simulated Telegram outage (test customer)');
      default:
        return this.markUndeliverable(message, outcome);
    }
  }

  private async handleTelegramError(message: LoadedMessage, error: unknown, isFinalAttempt: boolean): Promise<void> {
    const { customer, environment } = message;
    if (error instanceof TelegramApiError) {
      if (error.isBlocked) {
        await this.prisma.customer.update({ where: { id: customer.id }, data: { blockedAt: new Date() } });
        await this.webhooks.emit(environment, 'customer.blocked', { externalId: customer.externalId });
        await this.admin.onCustomerBlocked(environment.id);
        return this.markUndeliverable(message, 'blocked');
      }
      if (error.isChatGone) {
        await this.prisma.customer.update({ where: { id: customer.id }, data: { telegramChatId: null, linkedAt: null } });
        return this.markUndeliverable(message, 'chat_gone');
      }
      const retryable = error.errorCode === 429 || error.errorCode >= 500;
      if (retryable && !isFinalAttempt) throw error;
      return retryable
        ? this.markFailed(message, 'telegram_unavailable', error.description)
        : this.markFailed(message, 'telegram_rejected', error.description);
    }
    // Network error or timeout.
    if (!isFinalAttempt) throw error;
    this.logger.warn(`Telegram send failed for message ${message.id}: ${(error as Error).message}`);
    return this.markFailed(message, 'telegram_unavailable', (error as Error).message);
  }

  private async markSent(message: LoadedMessage, telegramMessageId: string) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: 'SENT', telegramMessageId, sentAt: new Date(), reason: null, error: null },
      include: { customer: true },
    });
    await this.webhooks.emit(message.environment, 'message.sent', toMessageView(updated));
  }

  private async markUndeliverable(message: LoadedMessage, reason: string) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: 'UNDELIVERABLE', reason },
      include: { customer: true },
    });
    const withFallback = await this.smsFallback.trigger(message.environment, updated);
    await this.webhooks.emit(message.environment, 'message.undeliverable', toMessageView(withFallback));
  }

  private async markFailed(message: LoadedMessage, reason: string, error: string) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: 'FAILED', reason, error },
      include: { customer: true },
    });
    const withFallback = await this.smsFallback.trigger(message.environment, updated);
    await this.webhooks.emit(message.environment, 'message.failed', toMessageView(withFallback));
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
