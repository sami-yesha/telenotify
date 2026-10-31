import { createHmac } from 'crypto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CliService } from './cli.service';
import { sampleEvent, TRIGGERABLE_EVENTS } from './sample-events';

const environment = { id: 'env-1', type: 'SANDBOX', eventWebhookUrl: null, eventSigningSecret: 'whsec_test', cliListenUntil: null, org: { name: 'Abebe' } } as any;
const row = (i: number) => ({
  id: `evt-${i}`,
  event: 'message.sent',
  createdAt: new Date(Date.UTC(2026, 9, 27, 12, 0, i)),
  payload: { id: `evt-${i}`, event: 'message.sent', environment: 'sandbox', createdAt: '2026-10-27T12:00:00.000Z', data: { id: `m${i}` } },
});

function setup(rows: object[] = []) {
  const prisma = {
    environment: { update: jest.fn() },
    webhookDelivery: {
      findFirst: jest.fn().mockResolvedValue(rows.at(-1) ?? null),
      findMany: jest.fn().mockResolvedValue(rows),
      create: jest.fn(),
    },
  };
  const queue = { add: jest.fn() };
  const webhooks = new WebhooksService(queue as any, { get: () => undefined } as any, prisma as any);
  return { cli: new CliService(prisma as any, webhooks), prisma, queue, webhooks };
}

describe('CliService', () => {
  it('opens a 90-second listening window and starts after existing events', async () => {
    const { cli, prisma } = setup([row(1), row(2)]);
    const session = await cli.listen(environment);
    const until = prisma.environment.update.mock.calls[0][0].data.cliListenUntil as Date;
    expect(until.getTime() - Date.now()).toBeGreaterThan(85_000);
    expect(session).toMatchObject({ environment: 'sandbox', organization: 'Abebe', webhookUrl: null, cursor: '2026-10-27T12:00:02.000Z_evt-2' });
  });

  it('returns new events with the exact body and a valid signature', async () => {
    const { cli, prisma } = setup([row(3)]);
    const page = await cli.events(environment, '2026-10-27T12:00:02.000Z_evt-2');
    expect(prisma.webhookDelivery.findMany.mock.calls[0][0].where.OR[0]).toEqual({ createdAt: { gt: new Date('2026-10-27T12:00:02.000Z') } });
    const [event] = page.events;
    expect(JSON.parse(event.body)).toEqual(row(3).payload);
    // The same check a developer's webhook code does with their signing secret.
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(event.signature)!;
    expect(createHmac('sha256', 'whsec_test').update(`${t}.${event.body}`).digest('hex')).toBe(v1);
    expect(page.cursor).toBe('2026-10-27T12:00:03.000Z_evt-3');
  });

  it('keeps the cursor when there is nothing new', async () => {
    expect(await setup([]).cli.events(environment, '2026-10-27T12:00:02.000Z_evt-2')).toEqual({ events: [], cursor: '2026-10-27T12:00:02.000Z_evt-2' });
    await expect(setup([]).cli.events(environment, 'nonsense')).rejects.toThrow(/Invalid cursor/);
  });

  it('triggers a sample event for a listening CLI without queueing a delivery', async () => {
    const { cli, prisma, queue } = setup();
    const listening = { ...environment, cliListenUntil: new Date(Date.now() + 60_000) };
    const result = await cli.trigger(listening, 'message.undeliverable');
    expect(result).toMatchObject({ event: 'message.undeliverable', sentToWebhookUrl: false });
    expect(prisma.webhookDelivery.create.mock.calls[0][0].data).toMatchObject({ event: 'message.undeliverable', status: 'CLI_ONLY' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('also delivers to the webhook URL when one is set', async () => {
    const { cli, queue } = setup();
    await cli.trigger({ ...environment, eventWebhookUrl: 'https://shop.example/hooks' }, 'customer.linked');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('says when nothing would receive it, and rejects unknown events', async () => {
    await expect(setup().cli.trigger(environment, 'message.sent')).rejects.toThrow(/run `telenotify listen`/);
    await expect(setup().cli.trigger(environment, 'payment.done')).rejects.toThrow(/Unknown event/);
  });
});

describe('sample events', () => {
  it('has a realistic payload for every event', () => {
    for (const event of TRIGGERABLE_EVENTS) expect(Object.keys(sampleEvent(event)).length).toBeGreaterThan(0);
    expect(sampleEvent('message.undeliverable')).toMatchObject({ status: 'UNDELIVERABLE', reason: 'not_linked', to: 'test_linked' });
    expect(sampleEvent('verification.failed')).toMatchObject({ status: 'FAILED', reason: 'phone_mismatch' });
  });
});
