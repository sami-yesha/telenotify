import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, Organization, Prisma } from '@prisma/client';
import { suspendedMessage } from '../common/api-key.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { currentPeriod, monthlyQuota, PLANS } from './plans';

const ALERT_THRESHOLDS = [80, 100] as const;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // Live usage this calendar month (UTC): messages that are sent or in flight, plus
  // completed verifications. Undeliverable messages and failed verifications are free.
  async usage(orgId: string) {
    const { start, end } = currentPeriod();
    const live = await this.prisma.environment.findUnique({ where: { orgId_type: { orgId, type: 'LIVE' } } });
    if (!live) return { used: 0, start, end };
    const [messages, verifications] = await Promise.all([
      this.prisma.message.count({
        where: { environmentId: live.id, direction: 'OUTBOUND', status: { in: ['QUEUED', 'SENT'] }, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.verification.count({ where: { environmentId: live.id, status: 'VERIFIED', verifiedAt: { gte: start, lt: end } } }),
    ]);
    return { used: messages + verifications, messages, verifications, start, end };
  }

  async assertWithinQuota(environment: Environment & { org?: Organization }) {
    const org = environment.org ?? (await this.prisma.organization.findUniqueOrThrow({ where: { id: environment.orgId } }));
    // Also covers sends from the portal, which don't go through the API key guard.
    if (org.status === 'SUSPENDED') {
      throw new ForbiddenException({ statusCode: 403, code: 'org_suspended', message: suspendedMessage(org.suspendedReason) });
    }
    if (environment.type !== 'LIVE') return;
    if (!org.liveApprovedAt) await this.assertUnapprovedDailyLimit(org);
    const quota = monthlyQuota(org);
    if (quota === null) return;
    const { used } = await this.usage(org.id);
    // Counts the send being attempted now, so the 80% email arrives before the limit.
    void this.sendUsageAlerts(org, used + 1, quota);
    if (used >= quota) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'quota_exceeded',
          message: `Monthly fair-use limit of ${quota.toLocaleString('en-US')} live messages and verifications is used up. It resets next month. Request a higher limit in the portal (Plan & usage), or self-host Telenotify for no limit.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  // Until an operator approves live use, an organization can send a small number of
  // live messages per day: enough to test with real customers, too few to spam.
  private async assertUnapprovedDailyLimit(org: Organization) {
    const limit = Number(this.config.get('UNAPPROVED_LIVE_DAILY_LIMIT', 100));
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const live = await this.prisma.environment.findUnique({ where: { orgId_type: { orgId: org.id, type: 'LIVE' } } });
    if (!live) return;
    const [messages, verifications] = await Promise.all([
      this.prisma.message.count({ where: { environmentId: live.id, direction: 'OUTBOUND', status: { in: ['QUEUED', 'SENT'] }, createdAt: { gte: since } } }),
      this.prisma.verification.count({ where: { environmentId: live.id, status: 'VERIFIED', verifiedAt: { gte: since } } }),
    ]);
    if (messages + verifications >= limit) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'live_review_required',
        message: `New organizations can send ${limit} live messages a day until approved. Request a review in the portal (Live → Telegram bot); the limit lifts once approved.`,
      });
    }
  }

  // Emails the owners once per month when usage reaches 80% and 100% of the quota.
  async sendUsageAlerts(org: Organization, used: number, quota: number): Promise<void> {
    try {
      const period = currentPeriod().start.toISOString().slice(0, 7);
      for (const threshold of ALERT_THRESHOLDS) {
        if (used < Math.ceil((quota * threshold) / 100)) continue;
        try {
          await this.prisma.usageAlert.create({ data: { orgId: org.id, period, threshold } });
        } catch (error) {
          // Unique violation: this alert already went out this month.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
          throw error;
        }
        await this.emailOwners(org, threshold, Math.min(used, quota), quota);
      }
    } catch (error) {
      this.logger.error(`Usage alert for org ${org.id} failed: ${(error as Error).message}`);
    }
  }

  private async emailOwners(org: Organization, threshold: number, used: number, quota: number) {
    const owners = await this.prisma.membership.findMany({ where: { orgId: org.id, role: 'OWNER' }, include: { user: true } });
    const portal = this.config.getOrThrow<string>('PORTAL_URL').replace(/\/$/, '');
    const link = `${portal}/o/${org.id}/live/billing`;
    const subject =
      threshold >= 100
        ? `${org.name}: live messages are paused (monthly limit reached)`
        : `${org.name}: ${threshold}% of your monthly Telenotify limit used`;
    const body =
      threshold >= 100
        ? `Hi,\n\n${org.name} has used all ${quota.toLocaleString('en-US')} free live messages and verifications this month. New live messages are rejected until the month resets, so customers may miss notifications.\n\nTelenotify is free; request a higher limit here, or self-host it for no limit: ${link}`
        : `Hi,\n\n${org.name} has used ${used.toLocaleString('en-US')} of ${quota.toLocaleString('en-US')} free live messages and verifications (${threshold}%) this month.\n\nTelenotify is free; if you'll need more, request a higher limit here: ${link}`;
    for (const owner of owners) {
      await this.mail.send(owner.user.email, subject, body);
    }
  }

  async overview(org: Organization) {
    const usage = await this.usage(org.id);
    return {
      plan: org.plan,
      usage: { ...usage, quota: monthlyQuota(org) },
      limitRequest: {
        status: org.limitRequestStatus.toLowerCase(),
        requested: org.limitRequested,
        reason: org.limitRequestReason,
        requestedAt: org.limitRequestedAt,
        declineReason: org.limitDeclineReason,
      },
      plans: Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan })),
    };
  }
}
