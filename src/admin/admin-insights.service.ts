import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { Queue } from 'bullmq';
import { MESSAGES_QUEUE } from '../messages/messages.constants';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_FALLBACK_QUEUE } from '../sms-fallback/sms-fallback.constants';
import { TelegramService } from '../telegram/telegram.service';
import { WEBHOOKS_QUEUE } from '../webhooks/webhooks.constants';

const DAYS = 30;

// Read-mostly views for the operator portal: platform totals, users and system health.
@Injectable()
export class AdminInsightsService {
  private readonly logger = new Logger(AdminInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
    @InjectQueue(MESSAGES_QUEUE) private readonly messagesQueue: Queue,
    @InjectQueue(WEBHOOKS_QUEUE) private readonly webhooksQueue: Queue,
    @InjectQueue(SMS_FALLBACK_QUEUE) private readonly fallbackQueue: Queue,
  ) {}

  async overview() {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));

    const [users, verifiedUsers, orgs, suspended, approved, liveBots, waitingReview, passMembers, verifiedBusinesses, signups, live, sandbox] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.organization.count({ where: { liveApprovedAt: { not: null } } }),
      this.prisma.environment.count({ where: { type: 'LIVE', botTokenEncrypted: { not: null } } }),
      this.prisma.organization.count({ where: { status: 'ACTIVE', OR: [{ limitRequestStatus: 'PENDING' }, { liveApprovedAt: null, liveReviewRequestedAt: { not: null } }, { businessStatus: 'PENDING' }] } }),
      this.prisma.passIdentity.count(),
      this.prisma.organization.count({ where: { businessStatus: 'VERIFIED' } }),
      this.daily(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS n FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`),
      this.daily(
        Prisma.sql`SELECT date_trunc('day', m."createdAt") AS day, count(*)::int AS n FROM "Message" m JOIN "Environment" e ON e.id = m."environmentId"
                   WHERE m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' AND e.type = 'LIVE' GROUP BY 1`,
      ),
      this.daily(
        Prisma.sql`SELECT date_trunc('day', m."createdAt") AS day, count(*)::int AS n FROM "Message" m JOIN "Environment" e ON e.id = m."environmentId"
                   WHERE m."createdAt" >= ${since} AND m.direction = 'OUTBOUND' AND e.type = 'SANDBOX' GROUP BY 1`,
      ),
    ]);

    const days = Array.from({ length: DAYS }, (_, i) => {
      const day = new Date(since);
      day.setUTCDate(since.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      return { date: key, signups: signups.get(key) ?? 0, live: live.get(key) ?? 0, sandbox: sandbox.get(key) ?? 0 };
    });

    return {
      totals: { users, verifiedUsers, orgs, suspended, approved, liveBots, waitingReview, passMembers, verifiedBusinesses },
      days,
    };
  }

  async listUsers(query?: string) {
    const q = query?.trim();
    const users = await this.prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        memberships: { include: { org: { select: { id: true, name: true, status: true } } } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      emailVerified: Boolean(u.emailVerifiedAt),
      hasPassword: Boolean(u.passwordHash),
      googleLinked: Boolean(u.googleSub),
      lastSignInAt: u.sessions[0]?.createdAt ?? null,
      orgs: u.memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role, status: m.org.status })),
    }));
  }

  // For when a verification email never arrives.
  async verifyEmail(userId: string, actor: User) {
    const user = await this.findUser(userId);
    if (!user.emailVerifiedAt) await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    this.logger.log(`${actor.email} marked ${user.email} as verified`);
  }

  async signOutEverywhere(userId: string, actor: User) {
    const user = await this.findUser(userId);
    const { count } = await this.prisma.session.deleteMany({ where: { userId: user.id } });
    this.logger.log(`${actor.email} signed ${user.email} out of ${count} session(s)`);
    return { sessions: count };
  }

  async system() {
    const queue = async (name: string, q: Queue) => {
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
        return { name, ok: true, ...counts };
      } catch (error) {
        return { name, ok: false, error: (error as Error).message };
      }
    };
    const database = await this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
    return {
      database,
      queues: await Promise.all([queue('Messages', this.messagesQueue), queue('Webhook events', this.webhooksQueue), queue('SMS fallback', this.fallbackQueue)]),
      sandboxBot: { configured: Boolean(this.config.get('SANDBOX_BOT_TOKEN')), username: this.telegram.botUsernameFor({ type: 'SANDBOX' } as never) ?? null },
      email: { configured: Boolean(this.config.get('SMTP_URL')), from: this.config.get<string>('MAIL_FROM') ?? null },
      publicBaseUrl: this.config.get<string>('PUBLIC_BASE_URL') ?? null,
      portalUrl: this.config.get<string>('PORTAL_URL') ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    };
  }

  private async daily(query: Prisma.Sql): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ day: Date; n: number }[]>(query);
    return new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.n]));
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
