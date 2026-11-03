import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiClient } from '../request-log/client';

export const ANALYTICS_RANGES = [7, 30, 90] as const;
// API calls are kept for 30 days (request-log.service.ts), so API numbers never cover more.
const API_DAYS = 30;
const CLIENTS: ApiClient[] = ['node', 'python', 'cli', 'http', 'other'];

// Groups /v1/messages/<uuid> and /v1/customers/<externalId> into one endpoint each.
const ENDPOINT = Prisma.sql`CASE
  WHEN l.path ~ '^/v1/customers/[^/]+$' AND l.path <> '/v1/customers/link' THEN '/v1/customers/:externalId'
  ELSE regexp_replace(l.path, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g')
END`;

const CLIENT = Prisma.sql`coalesce(l.client, 'other')`;

type Counted = { key: string; n: number };

// Platform-wide numbers for the operator Analytics page: growth, delivery, and how
// developers call the API (SDKs, CLI, curl). Live traffic only, except API calls.
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(requestedDays: number) {
    const days = (ANALYTICS_RANGES as readonly number[]).includes(requestedDays) ? requestedDays : 30;
    const apiDays = Math.min(days, API_DAYS);
    const since = startOfDay(days);
    const apiSince = startOfDay(apiDays);

    const [users, funnel, outcomes, verifications, methods, fallback, webhooks, api, apiDaily, clients, versions, endpoints, errors, cli, listeningNow, orgMessages, orgVerifications, orgRequests] =
      await Promise.all([
        this.one<{ signups: number; verified: number }>(Prisma.sql`
          SELECT count(*)::int AS signups, count(*) FILTER (WHERE "emailVerifiedAt" IS NOT NULL)::int AS verified
          FROM "User" WHERE "createdAt" >= ${since}`),
        this.one<{ created: number; tested: number; liveBot: number; approved: number; sentLive: number }>(Prisma.sql`
          SELECT count(*)::int AS created,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "Environment" e WHERE e."orgId" = o.id AND e.type = 'SANDBOX' AND (
                EXISTS (SELECT 1 FROM "Message" m WHERE m."environmentId" = e.id AND m.direction = 'OUTBOUND')
                OR EXISTS (SELECT 1 FROM "Verification" v WHERE v."environmentId" = e.id))))::int AS tested,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "Environment" e WHERE e."orgId" = o.id AND e.type = 'LIVE' AND e."botTokenEncrypted" IS NOT NULL))::int AS "liveBot",
            count(*) FILTER (WHERE o."liveApprovedAt" IS NOT NULL)::int AS approved,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "Environment" e WHERE e."orgId" = o.id AND e.type = 'LIVE' AND (
                EXISTS (SELECT 1 FROM "Message" m WHERE m."environmentId" = e.id AND m.direction = 'OUTBOUND' AND m.status = 'SENT')
                OR EXISTS (SELECT 1 FROM "Verification" v WHERE v."environmentId" = e.id AND v.status = 'VERIFIED'))))::int AS "sentLive"
          FROM "Organization" o WHERE o."createdAt" >= ${since}`),
        this.prisma.$queryRaw<{ day: Date; status: string; n: number }[]>(Prisma.sql`
          SELECT date_trunc('day', m."createdAt") AS day, m.status::text AS status, count(*)::int AS n
          FROM "Message" m JOIN "Environment" e ON e.id = m."environmentId"
          WHERE e.type = 'LIVE' AND m."createdAt" >= ${since} GROUP BY 1, 2`),
        this.counts(Prisma.sql`
          SELECT v.status::text AS key, count(*)::int AS n
          FROM "Verification" v JOIN "Environment" e ON e.id = v."environmentId"
          WHERE e.type = 'LIVE' AND v."createdAt" >= ${since} GROUP BY 1`),
        this.counts(Prisma.sql`
          SELECT coalesce(v.method, 'telegram') AS key, count(*)::int AS n
          FROM "Verification" v JOIN "Environment" e ON e.id = v."environmentId"
          WHERE e.type = 'LIVE' AND v.status = 'VERIFIED' AND v."verifiedAt" >= ${since} GROUP BY 1`),
        this.counts(Prisma.sql`
          SELECT m."fallbackStatus"::text AS key, count(*)::int AS n
          FROM "Message" m JOIN "Environment" e ON e.id = m."environmentId"
          WHERE e.type = 'LIVE' AND m."fallbackStatus" IS NOT NULL AND m."createdAt" >= ${since} GROUP BY 1`),
        this.counts(Prisma.sql`
          SELECT d.status::text AS key, count(*)::int AS n
          FROM "WebhookDelivery" d JOIN "Environment" e ON e.id = d."environmentId"
          WHERE e.type = 'LIVE' AND d."createdAt" >= ${since} GROUP BY 1`),
        this.one<{ total: number; live: number; clientErrors: number; serverErrors: number; p50: number; p95: number; orgs: number }>(Prisma.sql`
          SELECT count(*)::int AS total,
            count(*) FILTER (WHERE e.type = 'LIVE')::int AS live,
            count(*) FILTER (WHERE l."statusCode" BETWEEN 400 AND 499)::int AS "clientErrors",
            count(*) FILTER (WHERE l."statusCode" >= 500)::int AS "serverErrors",
            coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY l."durationMs"), 0)::float8 AS p50,
            coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY l."durationMs"), 0)::float8 AS p95,
            count(DISTINCT e."orgId")::int AS orgs
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince}`),
        this.prisma.$queryRaw<{ day: Date; client: string; n: number }[]>(Prisma.sql`
          SELECT date_trunc('day', l."createdAt") AS day, ${CLIENT} AS client, count(*)::int AS n
          FROM "ApiRequestLog" l WHERE l."createdAt" >= ${apiSince} GROUP BY 1, 2`),
        this.prisma.$queryRaw<{ client: string; requests: number; orgs: number; errors: number; p95: number }[]>(Prisma.sql`
          SELECT ${CLIENT} AS client, count(*)::int AS requests, count(DISTINCT e."orgId")::int AS orgs,
            count(*) FILTER (WHERE l."statusCode" >= 400)::int AS errors,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY l."durationMs")::float8 AS p95
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince} GROUP BY 1`),
        this.prisma.$queryRaw<{ client: string; detail: string | null; requests: number; orgs: number; lastSeen: Date }[]>(Prisma.sql`
          SELECT ${CLIENT} AS client, l."clientDetail" AS detail, count(*)::int AS requests,
            count(DISTINCT e."orgId")::int AS orgs, max(l."createdAt") AS "lastSeen"
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince} GROUP BY 1, 2 ORDER BY requests DESC`),
        this.prisma.$queryRaw<{ method: string; endpoint: string; requests: number; errors: number; p95: number }[]>(Prisma.sql`
          SELECT l.method, ${ENDPOINT} AS endpoint, count(*)::int AS requests,
            count(*) FILTER (WHERE l."statusCode" >= 400)::int AS errors,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY l."durationMs")::float8 AS p95
          FROM "ApiRequestLog" l WHERE l."createdAt" >= ${apiSince}
          GROUP BY 1, 2 ORDER BY requests DESC LIMIT 15`),
        this.prisma.$queryRaw<{ status: number; message: string | null; n: number; orgs: number; lastSeen: Date }[]>(Prisma.sql`
          SELECT l."statusCode" AS status, l.error AS message, count(*)::int AS n,
            count(DISTINCT e."orgId")::int AS orgs, max(l."createdAt") AS "lastSeen"
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince} AND l."statusCode" >= 400
          GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`),
        this.one<{ sessions: number; triggers: number; requests: number; orgs: number }>(Prisma.sql`
          SELECT count(*) FILTER (WHERE l.path = '/v1/cli/listen')::int AS sessions,
            count(*) FILTER (WHERE l.path = '/v1/cli/trigger')::int AS triggers,
            count(*)::int AS requests, count(DISTINCT e."orgId")::int AS orgs
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince} AND (l.client = 'cli' OR l.path LIKE '/v1/cli/%')`),
        this.prisma.environment.count({ where: { cliListenUntil: { gt: new Date() } } }),
        this.counts(Prisma.sql`
          SELECT e."orgId" AS key, count(*)::int AS n
          FROM "Message" m JOIN "Environment" e ON e.id = m."environmentId"
          WHERE e.type = 'LIVE' AND m.direction = 'OUTBOUND' AND m."createdAt" >= ${since} GROUP BY 1`),
        this.counts(Prisma.sql`
          SELECT e."orgId" AS key, count(*)::int AS n
          FROM "Verification" v JOIN "Environment" e ON e.id = v."environmentId"
          WHERE e.type = 'LIVE' AND v.status = 'VERIFIED' AND v."verifiedAt" >= ${since} GROUP BY 1`),
        this.prisma.$queryRaw<{ orgId: string; requests: number; errors: number; clients: string[] }[]>(Prisma.sql`
          SELECT e."orgId" AS "orgId", count(*)::int AS requests, count(*) FILTER (WHERE l."statusCode" >= 400)::int AS errors,
            array_agg(DISTINCT ${CLIENT}) AS clients
          FROM "ApiRequestLog" l JOIN "Environment" e ON e.id = l."environmentId"
          WHERE l."createdAt" >= ${apiSince} GROUP BY 1`),
      ]);

    const dayKeys = (from: Date, count: number) =>
      Array.from({ length: count }, (_, i) => new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const keyOf = (day: Date) => day.toISOString().slice(0, 10);

    const daily = new Map(dayKeys(since, days).map((date) => [date, { date, sent: 0, undeliverable: 0, failed: 0, received: 0, queued: 0 }]));
    for (const row of outcomes) {
      const day = daily.get(keyOf(row.day));
      const key = row.status.toLowerCase() as 'sent' | 'undeliverable' | 'failed' | 'received' | 'queued';
      if (day && key in day) day[key] += row.n;
    }
    const messageTotals = { sent: 0, undeliverable: 0, failed: 0, received: 0, queued: 0 };
    for (const day of daily.values()) for (const key of Object.keys(messageTotals) as (keyof typeof messageTotals)[]) messageTotals[key] += day[key];

    const apiByDay = new Map(dayKeys(apiSince, apiDays).map((date) => [date, { date, ...Object.fromEntries(CLIENTS.map((c) => [c, 0])) } as Record<string, number | string>]));
    for (const row of apiDaily) {
      const day = apiByDay.get(keyOf(row.day));
      if (day) day[row.client] = (day[row.client] as number) + row.n;
    }

    const requestsByOrg = new Map(orgRequests.map((r) => [r.orgId, r]));
    const messagesByOrg = toMap(orgMessages);
    const verifiedByOrg = toMap(orgVerifications);
    const orgIds = [...new Set([...messagesByOrg.keys(), ...verifiedByOrg.keys(), ...requestsByOrg.keys()])];
    const activity = (id: string) => (messagesByOrg.get(id) ?? 0) + (verifiedByOrg.get(id) ?? 0) + (requestsByOrg.get(id)?.requests ?? 0);
    const topIds = orgIds.sort((a, b) => activity(b) - activity(a)).slice(0, 10);
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true, status: true, liveApprovedAt: true } });
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const verificationCounts = toMap(verifications);
    const p95 = (value: number | null) => Math.round(value ?? 0);

    return {
      days,
      apiDays,
      users,
      funnel,
      messages: { daily: [...daily.values()], totals: messageTotals },
      verifications: {
        started: [...verificationCounts.values()].reduce((sum, n) => sum + n, 0),
        verified: verificationCounts.get('VERIFIED') ?? 0,
        failed: verificationCounts.get('FAILED') ?? 0,
        expired: verificationCounts.get('EXPIRED') ?? 0,
        open: (verificationCounts.get('PENDING') ?? 0) + (verificationCounts.get('AWAITING_CONTACT') ?? 0),
        byMethod: Object.fromEntries(toMap(methods)),
      },
      smsFallback: lowerKeys(toMap(fallback)),
      webhooks: lowerKeys(toMap(webhooks)),
      api: {
        ...api,
        p50: Math.round(api.p50),
        p95: Math.round(api.p95),
        daily: [...apiByDay.values()],
        clients: CLIENTS.map((client) => {
          const row = clients.find((c) => c.client === client);
          return {
            client,
            requests: row?.requests ?? 0,
            orgs: row?.orgs ?? 0,
            errors: row?.errors ?? 0,
            p95: p95(row?.p95 ?? 0),
            versions: versions.filter((v) => v.client === client).slice(0, 6),
          };
        }),
        endpoints: endpoints.map((e) => ({ ...e, p95: p95(e.p95) })),
        errors,
      },
      cli: { ...cli, listeningNow },
      topOrgs: topIds
        .filter((id) => orgById.has(id))
        .map((id) => {
          const org = orgById.get(id)!;
          const requests = requestsByOrg.get(id);
          return {
            id,
            name: org.name,
            status: org.status,
            liveApproved: Boolean(org.liveApprovedAt),
            messages: messagesByOrg.get(id) ?? 0,
            verifications: verifiedByOrg.get(id) ?? 0,
            requests: requests?.requests ?? 0,
            errors: requests?.errors ?? 0,
            clients: CLIENTS.filter((c) => requests?.clients.includes(c)),
          };
        }),
    };
  }

  private async one<T>(query: Prisma.Sql): Promise<T> {
    const [row] = await this.prisma.$queryRaw<T[]>(query);
    return row;
  }

  private counts(query: Prisma.Sql) {
    return this.prisma.$queryRaw<Counted[]>(query);
  }
}

// Midnight UTC, (days - 1) days ago: the range includes today.
function startOfDay(days: number) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since;
}

function toMap(rows: Counted[]) {
  return new Map(rows.map((r) => [r.key, r.n]));
}

function lowerKeys(map: Map<string, number>) {
  return Object.fromEntries([...map].map(([key, n]) => [key.toLowerCase(), n]));
}
