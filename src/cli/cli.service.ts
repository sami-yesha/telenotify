import { BadRequestException, Injectable } from '@nestjs/common';
import { Environment, Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventPayload } from '../webhooks/webhooks.constants';
import { WebhooksService } from '../webhooks/webhooks.service';
import { sampleEvent, TRIGGERABLE_EVENTS, TriggerableEvent } from './sample-events';

// The CLI renews this every 30 seconds; a stopped CLI stops counting after 90.
const LISTEN_WINDOW_MS = 90_000;
const PAGE = 50;

// Backs `npx telenotify listen` and `trigger`: the CLI polls for this environment's
// events and forwards each one to the developer's local server with the same body and
// signature a real delivery has, so their webhook code is tested as in production.
// The signing secret never leaves the server.
@Injectable()
export class CliService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listen(environment: Environment & { org: Organization }) {
    await this.prisma.environment.update({ where: { id: environment.id }, data: { cliListenUntil: new Date(Date.now() + LISTEN_WINDOW_MS) } });
    const latest = await this.prisma.webhookDelivery.findFirst({ where: { environmentId: environment.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return {
      environment: environment.type.toLowerCase(),
      organization: environment.org.name,
      webhookUrl: environment.eventWebhookUrl,
      // Start after what already happened: the CLI shows new events only.
      cursor: latest ? cursorOf(latest) : null,
      renewEverySeconds: 30,
    };
  }

  // Events after the cursor, oldest first, each signed now as a delivery would be.
  async events(environment: Environment, cursor?: string) {
    const after = parseCursor(cursor);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        environmentId: environment.id,
        ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE,
    });
    const events = rows.map((row) => {
      const { body, signature } = this.webhooks.sign(environment, row.payload as unknown as EventPayload);
      return { id: row.id, event: row.event, createdAt: row.createdAt, body, signature };
    });
    return { events, cursor: rows.length ? cursorOf(rows[rows.length - 1]) : (cursor ?? null) };
  }

  async trigger(environment: Environment, event: string) {
    if (!(TRIGGERABLE_EVENTS as readonly string[]).includes(event)) {
      throw new BadRequestException(`Unknown event "${event}". Use one of: ${TRIGGERABLE_EVENTS.join(', ')}`);
    }
    const sent = await this.webhooks.emit(environment, event as TriggerableEvent, sampleEvent(event as TriggerableEvent));
    if (!sent) throw new BadRequestException('Nothing would receive it: run `telenotify listen` or set a webhook URL in the portal first.');
    return { id: sent.id, event, sentToWebhookUrl: Boolean(environment.eventWebhookUrl) };
  }
}

function cursorOf(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function parseCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const split = cursor.indexOf('_');
  const createdAt = new Date(cursor.slice(0, split));
  if (split < 0 || Number.isNaN(createdAt.getTime())) throw new BadRequestException('Invalid cursor');
  return { createdAt, id: cursor.slice(split + 1) };
}

export type CliEventPage = Prisma.PromiseReturnType<CliService['events']>;
