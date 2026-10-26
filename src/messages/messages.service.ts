import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Customer, Environment, Message, MessageStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { BillingService } from '../billing/billing.service';
import { CustomersService } from '../customers/customers.service';
import { SmsFallbackService } from '../sms-fallback/sms-fallback.service';
import { TemplatesService } from '../templates/templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { validateButtons } from './buttons';
import { toMessageView } from './message-view';
import { renderLayout } from './rich-text';
import { DeliverJob, JOB_PRIORITY, MESSAGES_QUEUE } from './messages.constants';
import { SendMessageDto } from './messages.dto';

export type MessageView = ReturnType<typeof toMessageView>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly telegram: TelegramService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly smsFallback: SmsFallbackService,
    @InjectQueue(MESSAGES_QUEUE) private readonly queue: Queue<DeliverJob>,
  ) {}

  // Customers who cannot be reached on Telegram get an immediate UNDELIVERABLE
  // result, so the caller can switch to its own channel without waiting.
  async send(environment: Environment, dto: SendMessageDto): Promise<MessageView> {
    const buttons = validateButtons(dto.buttons);
    if (dto.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(environment.id, dto.idempotencyKey);
      if (existing) return toMessageView(existing);
    }
    if (environment.type === 'LIVE' && !this.telegram.hasBot(environment)) {
      throw new BadRequestException('Connect your Telegram bot in the portal before sending live messages');
    }
    await this.enforceSandboxLimit(environment);
    await this.billing.assertWithinQuota(environment);

    if ([dto.text, dto.template, dto.layout].filter(Boolean).length !== 1) {
      throw new BadRequestException('Send one of "text", "template" (with "params") or "layout"');
    }
    if (dto.format && !dto.text) throw new BadRequestException('"format" applies to "text" only: templates have their own format and layouts are always formatted');
    const customer = await this.customers.upsert(environment, dto.to);
    const content = dto.template
      ? await this.templates.renderForSend(environment.orgId, dto.template, dto.params, dto.locale, customer.locale)
      : dto.layout
        ? { text: renderLayout(dto.layout), format: 'MARKDOWN' as const, locale: null, templateKey: null }
        : { text: dto.text!, format: dto.format === 'markdown' ? ('MARKDOWN' as const) : ('PLAIN' as const), locale: null, templateKey: null };
    if (content.text.length > 4096) throw new BadRequestException('The message is longer than 4096 characters');
    const reason = !customer.telegramChatId ? 'not_linked' : customer.blockedAt ? 'blocked' : null;
    const status: MessageStatus = reason ? 'UNDELIVERABLE' : 'QUEUED';

    let message: Message & { customer: Customer };
    try {
      message = await this.prisma.message.create({
        data: {
          environmentId: environment.id,
          customerId: customer.id,
          direction: 'OUTBOUND',
          status,
          reason,
          text: content.text,
          format: content.format,
          templateKey: content.templateKey,
          locale: content.locale,
          buttons: buttons ? (buttons as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          idempotencyKey: dto.idempotencyKey,
          priority: dto.priority === 'high' ? 'HIGH' : 'NORMAL',
          smsFallback: dto.fallback !== false,
        },
        include: { customer: true },
      });
    } catch (error) {
      // Lost a race with a concurrent request using the same idempotency key.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.findByIdempotencyKey(environment.id, dto.idempotencyKey);
        if (existing) return toMessageView(existing);
      }
      throw error;
    }

    if (status === 'QUEUED') {
      await this.queue.add(
        'deliver',
        { messageId: message.id, botKey: environment.type === 'SANDBOX' ? 'sandbox' : environment.id },
        { jobId: message.id, priority: JOB_PRIORITY[message.priority] },
      );
    } else {
      message = await this.smsFallback.trigger(environment, message);
      await this.webhooks.emit(environment, 'message.undeliverable', toMessageView(message));
    }
    return toMessageView(message);
  }

  async get(environment: Environment, id: string): Promise<MessageView> {
    const message = await this.prisma.message.findFirst({ where: { id, environmentId: environment.id }, include: { customer: true } });
    if (!message) throw new NotFoundException('Message not found');
    return toMessageView(message);
  }

  async list(environment: Environment, options: { customer?: string; status?: MessageStatus; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const messages = await this.prisma.message.findMany({
      where: {
        environmentId: environment.id,
        ...(options.customer ? { customer: { externalId: options.customer } } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      include: { customer: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = messages.slice(0, take);
    return { data: page.map(toMessageView), nextCursor: messages.length > take ? page[page.length - 1].id : null };
  }

  async recordInbound(environment: Environment, customer: Customer, text: string, telegramMessageId: string) {
    const message = await this.prisma.message.create({
      data: {
        environmentId: environment.id,
        customerId: customer.id,
        direction: 'INBOUND',
        status: 'RECEIVED',
        text,
        telegramMessageId,
      },
      include: { customer: true },
    });
    await this.webhooks.emit(environment, 'message.received', toMessageView(message));
  }

  private findByIdempotencyKey(environmentId: string, idempotencyKey: string) {
    return this.prisma.message.findUnique({
      where: { environmentId_idempotencyKey: { environmentId, idempotencyKey } },
      include: { customer: true },
    });
  }

  private async enforceSandboxLimit(environment: Environment) {
    if (environment.type !== 'SANDBOX') return;
    const limit = Number(this.config.get('SANDBOX_DAILY_MESSAGE_LIMIT', 100));
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.prisma.message.count({
      where: { environmentId: environment.id, direction: 'OUTBOUND', createdAt: { gte: since } },
    });
    if (sentToday >= limit) {
      throw new HttpException(`Sandbox limit of ${limit} messages per day reached (resets 00:00 UTC)`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}


export { toMessageView } from './message-view';
