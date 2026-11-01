import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Organization, Plan, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { monthlyQuota, PLANS } from '../billing/plans';
import { PrismaService } from '../prisma/prisma.service';
import { OperatorNotifier } from './operator-notifier.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Operator tools for the hosted service: live review, suspension and spam detection.
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly notifier: OperatorNotifier,
  ) {}

  // ---------- Operator actions ----------

  async listOrgs() {
    const since = new Date(Date.now() - DAY_MS);
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: { where: { role: 'OWNER' }, include: { user: { select: { email: true, name: true } } } },
        environments: { where: { type: 'LIVE' } },
      },
    });
    return Promise.all(
      orgs.map(async (org) => {
        const live = org.environments[0];
        const [usage, abuse] = await Promise.all([this.billing.usage(org.id), live ? this.blockStats(live.id, since) : { blocked: 0, reached: 0 }]);
        return {
          id: org.id,
          name: org.name,
          createdAt: org.createdAt,
          owners: org.memberships.map((m) => ({ email: m.user.email, name: m.user.name })),
          status: org.status,
          suspendedAt: org.suspendedAt,
          suspendedReason: org.suspendedReason,
          plan: org.plan,
          planName: PLANS[org.plan].name,
          monthlyQuota: monthlyQuota(org),
          customMonthlyQuota: org.customMonthlyQuota,
          limitRequest: {
            status: org.limitRequestStatus,
            requested: org.limitRequested,
            reason: org.limitRequestReason,
            requestedAt: org.limitRequestedAt,
            declineReason: org.limitDeclineReason,
          },
          liveApprovedAt: org.liveApprovedAt,
          liveReviewRequestedAt: org.liveReviewRequestedAt,
          liveUseCase: org.liveUseCase,
          website: org.website,
          business: {
            status: org.businessStatus,
            legalName: org.legalName,
            tin: org.tin,
            tradeLicense: org.tradeLicense,
            requestedAt: org.businessRequestedAt,
            verifiedAt: org.businessVerifiedAt,
            rejectReason: org.businessRejectReason,
          },
          liveBotUsername: live?.botUsername ?? null,
          usedThisMonth: usage.used,
          blocked24h: abuse.blocked,
          reached24h: abuse.reached,
        };
      }),
    );
  }

  async approveLive(orgId: string, actor: User) {
    const org = await this.find(orgId);
    const updated = await this.prisma.organization.update({ where: { id: org.id }, data: { liveApprovedAt: org.liveApprovedAt ?? new Date() } });
    await this.audit.record(org.id, actor, 'live.approved', org.name);
    return updated;
  }

  async suspend(orgId: string, reason: string, actor: User | null) {
    const org = await this.find(orgId);
    if (!reason.trim()) throw new BadRequestException('Give a reason; the organization sees it');
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason.trim().slice(0, 500) },
    });
    await this.audit.record(org.id, actor, 'org.suspended', org.name, { reason: updated.suspendedReason });
    return updated;
  }

  async unsuspend(orgId: string, actor: User) {
    const org = await this.find(orgId);
    const updated = await this.prisma.organization.update({ where: { id: org.id }, data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null } });
    await this.audit.record(org.id, actor, 'org.unsuspended', org.name);
    return updated;
  }

  // Picking a plan replaces any custom limit, so the choice takes effect.
  async setPlan(orgId: string, plan: Plan, actor: User) {
    const org = await this.find(orgId);
    const updated = await this.prisma.organization.update({ where: { id: org.id }, data: { plan, customMonthlyQuota: null } });
    await this.audit.record(org.id, actor, 'plan.changed', PLANS[plan].name, { from: org.plan, to: plan });
    return updated;
  }

  // ---------- Organization side ----------

  async requestLiveReview(org: Organization, input: { useCase: string; website?: string | null }, actor: User) {
    if (org.liveApprovedAt) throw new BadRequestException('Live sending is already approved');
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { liveReviewRequestedAt: new Date(), liveUseCase: input.useCase.trim(), website: input.website?.trim() || null },
    });
    await this.audit.record(org.id, actor, 'live.review_requested', org.name);
    await this.notifier.notify(
      `Live review requested: ${org.name}`,
      `${org.name} asked for live approval.\nRequested by: ${actor.email}\nWebsite: ${updated.website ?? '-'}\nWhat they send: ${updated.liveUseCase}`,
    );
    return updated;
  }

  // Called when a live bot is connected, so operators see new live users early.
  async onLiveBotConnected(org: Organization, botUsername: string, actor: User) {
    if (org.liveApprovedAt) return;
    await this.notifier.notify(
      `New live bot: ${org.name}`,
      `${org.name} connected @${botUsername} (${actor.email}). Live sending is capped at ${this.unapprovedDailyLimit()} messages a day until you approve it.`,
    );
  }

  // ---------- Spam detection ----------

  // A live bot that many recipients block is the clearest spam signal on Telegram:
  // past the threshold, the organization is suspended and operators are told.
  async onCustomerBlocked(environmentId: string): Promise<void> {
    try {
      const environment = await this.prisma.environment.findUnique({ where: { id: environmentId }, include: { org: true } });
      if (!environment || environment.type !== 'LIVE' || environment.org.status === 'SUSPENDED') return;
      const { blocked, reached } = await this.blockStats(environment.id, new Date(Date.now() - DAY_MS));
      const minBlocks = Number(this.config.get('AUTO_SUSPEND_MIN_BLOCKS', 10));
      const ratio = Number(this.config.get('AUTO_SUSPEND_BLOCK_RATIO', 0.3));
      if (blocked < minBlocks || blocked / Math.max(reached, 1) < ratio) return;

      const reason = `Suspended automatically: ${blocked} of ${reached} recipients blocked your bot in the last 24 hours. Contact support to have it reviewed.`;
      await this.suspend(environment.orgId, reason, null);
      await this.notifier.notify(`Auto-suspended: ${environment.org.name}`, `${environment.org.name} (@${environment.botUsername ?? '?'}) was suspended: ${blocked} of ${reached} recipients blocked the bot in 24 hours.`);
    } catch (error) {
      this.logger.error(`Spam check for environment ${environmentId} failed: ${(error as Error).message}`);
    }
  }

  unapprovedDailyLimit(): number {
    return Number(this.config.get('UNAPPROVED_LIVE_DAILY_LIMIT', 100));
  }

  private async blockStats(environmentId: string, since: Date) {
    const [blocked, reached] = await Promise.all([
      this.prisma.customer.count({ where: { environmentId, blockedAt: { gte: since } } }),
      this.prisma.message.findMany({ where: { environmentId, direction: 'OUTBOUND', createdAt: { gte: since } }, distinct: ['customerId'], select: { customerId: true } }),
    ]);
    return { blocked, reached: reached.length };
  }

  private async find(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
}
