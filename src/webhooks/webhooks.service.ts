import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, Environment, Prisma, WebhookDelivery } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { fetch } from 'undici';
import { hmacSha256 } from '../common/crypto';
import { assertPublicUrl, BlockedAddressError, publicOnlyAgent } from '../common/network-guard';
import { PrismaService } from '../prisma/prisma.service';
import { EventPayload, WEBHOOK_ATTEMPTS, WEBHOOK_BACKOFF_MS, WEBHOOKS_QUEUE, WebhookJob } from './webhooks.constants';

export type EnvironmentEvent =
  | 'message.sent'
  | 'message.undeliverable'
  | 'message.failed'
  | 'message.received'
  | 'message.fallback_sent'
  | 'message.fallback_failed'
  | 'customer.linked'
  | 'customer.blocked'
  | 'verification.completed'
  | 'verification.failed'
  | 'webhook.test';

export interface DeliveryResult {
  delivered: boolean;
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

export interface AttemptLogEntry {
  at: string;
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

const JOB_OPTIONS = {
  attempts: WEBHOOK_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: WEBHOOK_BACKOFF_MS },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// Events are queued and delivered with retries, signed at send time:
//   x-telenotify-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
//   x-telenotify-event-id:  stable across retries, for de-duplication
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue<WebhookJob>,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Records the event in the delivery log, then queues it for delivery with retries.
  // While `telenotify listen` runs, events are recorded for it even without a URL.
  async emit(environment: Environment, event: EnvironmentEvent, data: Record<string, unknown>): Promise<{ id: string } | null> {
    const listening = Boolean(environment.cliListenUntil && environment.cliListenUntil > new Date());
    if (!environment.eventWebhookUrl && !listening) return null;
    const payload = this.buildPayload(environment, event, data);
    await this.prisma.webhookDelivery.create({
      data: {
        id: payload.id,
        environmentId: environment.id,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
        messageId: event.startsWith('message.') && typeof data.id === 'string' ? data.id : null,
        ...(environment.eventWebhookUrl ? {} : { status: 'CLI_ONLY' as const }),
      },
    });
    if (environment.eventWebhookUrl) await this.queue.add('deliver', { environmentId: environment.id, payload }, { jobId: payload.id, ...JOB_OPTIONS });
    return { id: payload.id };
  }

  /** The exact body and x-telenotify-signature header a delivery uses, signed now. */
  sign(environment: Pick<Environment, 'eventSigningSecret'>, payload: EventPayload, now = Date.now()): { body: string; signature: string } {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(now / 1000).toString();
    return { body, signature: `t=${timestamp},v1=${hmacSha256(environment.eventSigningSecret, `${timestamp}.${body}`)}` };
  }

  // Queues a logged event again (same event id, so receivers can still de-duplicate).
  async resend(environment: Environment, deliveryId: string): Promise<WebhookDelivery> {
    if (!environment.eventWebhookUrl) throw new BadRequestException('Set a webhook URL first');
    const delivery = await this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, environmentId: environment.id } });
    if (!delivery) throw new NotFoundException('Event not found');
    const updated = await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'PENDING' } });
    await this.queue.add(
      'deliver',
      { environmentId: environment.id, payload: delivery.payload as unknown as EventPayload },
      { jobId: `${delivery.id}:resend:${Date.now()}`, ...JOB_OPTIONS },
    );
    return updated;
  }

  // Delivers the portal's test event right away (no retries) and logs it like any other.
  async sendTest(environment: Environment): Promise<DeliveryResult> {
    const payload = this.buildPayload(environment, 'webhook.test', { message: 'Hello from Telenotify 👋' });
    await this.prisma.webhookDelivery.create({
      data: { id: payload.id, environmentId: environment.id, event: 'webhook.test', payload: payload as unknown as Prisma.InputJsonValue },
    });
    const result = await this.deliver(environment, payload);
    await this.recordAttempt(payload.id, result, true);
    return result;
  }

  async recordAttempt(deliveryId: string, result: DeliveryResult, isFinalAttempt: boolean): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return;
    const entry: AttemptLogEntry = { at: new Date().toISOString(), statusCode: result.statusCode, error: result.error, durationMs: result.durationMs };
    const log = [...((delivery.attemptLog as unknown as AttemptLogEntry[]) ?? []), entry].slice(-20);
    const status: DeliveryStatus = result.delivered ? 'DELIVERED' : isFinalAttempt ? 'FAILED' : 'PENDING';
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status,
        attempts: { increment: 1 },
        attemptLog: log as unknown as Prisma.InputJsonValue,
        lastStatusCode: result.statusCode ?? null,
        lastError: result.delivered ? null : (result.error ?? (result.statusCode ? `HTTP ${result.statusCode}` : null)),
        deliveredAt: result.delivered ? new Date() : delivery.deliveredAt,
      },
    });
  }

  async list(environment: Environment, options: { status?: DeliveryStatus; event?: string; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { environmentId: environment.id, ...(options.status ? { status: options.status } : {}), ...(options.event ? { event: options.event } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return { data: page.map((d) => this.toView(d)), nextCursor: rows.length > take ? page[page.length - 1].id : null };
  }

  async get(environment: Environment, id: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({ where: { id, environmentId: environment.id } });
    if (!delivery) throw new NotFoundException('Event not found');
    return this.toView(delivery);
  }

  toView(d: WebhookDelivery) {
    return {
      id: d.id,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      lastStatusCode: d.lastStatusCode,
      lastError: d.lastError,
      messageId: d.messageId,
      payload: d.payload,
      attemptLog: d.attemptLog,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
    };
  }

  buildPayload(environment: Environment, event: EnvironmentEvent, data: Record<string, unknown>): EventPayload {
    return { id: randomUUID(), event, environment: environment.type.toLowerCase(), createdAt: new Date().toISOString(), data };
  }

  // One delivery attempt. Never throws; the caller decides whether to retry.
  async deliver(environment: Environment, payload: EventPayload): Promise<DeliveryResult> {
    if (!environment.eventWebhookUrl) return { delivered: false, error: 'No webhook URL configured' };
    const started = Date.now();
    const { body, signature } = this.sign(environment, payload, started);
    try {
      const url = new URL(environment.eventWebhookUrl);
      const guard = !this.allowPrivate();
      if (guard) await assertPublicUrl(url);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Telenotify-Webhooks/1.0',
          'x-telenotify-signature': signature,
          'x-telenotify-event-id': payload.id,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
        ...(guard ? { dispatcher: publicOnlyAgent } : {}),
      });
      await response.body?.cancel(); // we never read the response
      return { delivered: response.ok, statusCode: response.status, durationMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof BlockedAddressError ? error.message : this.describe(error);
      this.logger.warn(`Event ${payload.event} (${payload.id}) to environment ${environment.id} failed: ${message}`);
      return { delivered: false, error: message, durationMs: Date.now() - started };
    }
  }

  // Local development only: lets webhooks reach servers on localhost.
  private allowPrivate(): boolean {
    return this.config.get('ALLOW_PRIVATE_WEBHOOK_URLS') === 'true';
  }

  private describe(error: unknown): string {
    const cause = (error as { cause?: Error }).cause;
    if (cause instanceof BlockedAddressError) return cause.message;
    return cause?.message ?? (error as Error).message;
  }
}
