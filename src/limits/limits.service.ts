import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Organization, User } from '@prisma/client';
import { OperatorNotifier } from '../admin/operator-notifier.service';
import { AuditService } from '../audit/audit.service';
import { currentPeriod, monthlyQuota } from '../billing/plans';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const count = (value: number) => value.toLocaleString('en-US');

// Asking for a higher monthly limit. An owner sends the number they need and why; an
// operator approves it (possibly with a different number) or declines with a reason.
@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifier: OperatorNotifier,
  ) {}

  // ---------- Organization side ----------

  async request(org: Organization, role: string, actor: User, monthlyLimit: number, reason: string) {
    if (role !== 'OWNER') throw new ForbiddenException('Only an owner can request a higher limit');
    if (org.limitRequestStatus === 'PENDING') throw new BadRequestException('Your request is already being reviewed');
    const quota = monthlyQuota(org);
    if (quota === null) throw new BadRequestException('Your organization has no monthly limit');
    if (monthlyLimit <= quota) throw new BadRequestException(`Ask for more than your current limit of ${count(quota)} a month`);
    if (!reason.trim()) throw new BadRequestException('Tell us what the extra messages are for');
    await this.prisma.organization.update({
      where: { id: org.id },
      data: { limitRequestStatus: 'PENDING', limitRequested: monthlyLimit, limitRequestReason: reason.trim(), limitRequestedAt: new Date(), limitDeclineReason: null },
    });
    await this.audit.record(org.id, actor, 'limit.requested', count(monthlyLimit), { from: quota });
    // Not awaited: a slow mail server shouldn't hold up the owner's request.
    void this.notifier.notify(
      `Higher limit requested: ${org.name}`,
      `${org.name} asked to raise its monthly limit from ${count(quota)} to ${count(monthlyLimit)}.\nRequested by: ${actor.email}\nWhy: ${reason.trim()}`,
    );
    return { ok: true };
  }

  // ---------- Operator side ----------

  async approve(orgId: string, monthlyLimit: number, actor: User) {
    const org = await this.find(orgId);
    if (org.limitRequestStatus !== 'PENDING') throw new BadRequestException('This organization has no request waiting');
    await this.prisma.organization.update({ where: { id: org.id }, data: { customMonthlyQuota: monthlyLimit, limitRequestStatus: 'APPROVED', limitDeclineReason: null } });
    await this.resetUsageAlerts(org.id);
    await this.audit.record(org.id, actor, 'limit.approved', count(monthlyLimit), { requested: org.limitRequested });
    void this.emailOwners(
      org.id,
      `${org.name}: your monthly limit is now ${count(monthlyLimit)}`,
      `Good news: we approved your request. ${org.name} can now send ${count(monthlyLimit)} live messages and verifications a month, starting right away.\n\nSee your usage: ${this.billingLink(org.id)}`,
    );
    return { ok: true };
  }

  async decline(orgId: string, reason: string, actor: User) {
    const org = await this.find(orgId);
    if (org.limitRequestStatus !== 'PENDING') throw new BadRequestException('This organization has no request waiting');
    if (!reason.trim()) throw new BadRequestException('Give a reason; the organization sees it');
    await this.prisma.organization.update({ where: { id: org.id }, data: { limitRequestStatus: 'DECLINED', limitDeclineReason: reason.trim() } });
    await this.audit.record(org.id, actor, 'limit.declined', org.limitRequested === null ? org.name : count(org.limitRequested), { reason: reason.trim() });
    void this.emailOwners(
      org.id,
      `${org.name}: your request for a higher limit was declined`,
      `We couldn't raise your monthly limit this time.\n\nReason: ${reason.trim()}\n\nYou can send a new request from Plan & usage, or self-host Telenotify for no limit: ${this.billingLink(org.id)}`,
    );
    return { ok: true };
  }

  // Sets or removes a custom limit directly, without a request. null goes back to the plan's limit.
  async set(orgId: string, monthlyLimit: number | null, actor: User) {
    const org = await this.find(orgId);
    await this.prisma.organization.update({ where: { id: org.id }, data: { customMonthlyQuota: monthlyLimit } });
    await this.resetUsageAlerts(org.id);
    await this.audit.record(org.id, actor, 'limit.changed', monthlyLimit === null ? 'plan limit' : count(monthlyLimit), { from: org.customMonthlyQuota });
    return { ok: true };
  }

  // ---------- Helpers ----------

  // This month's 80% and 100% alerts were about the old limit; the new one gets its own.
  private async resetUsageAlerts(orgId: string) {
    const period = currentPeriod().start.toISOString().slice(0, 7);
    await this.prisma.usageAlert.deleteMany({ where: { orgId, period } });
  }

  // Never throws (MailService doesn't either), so callers can fire and forget.
  private async emailOwners(orgId: string, subject: string, text: string) {
    try {
      const owners = await this.prisma.membership.findMany({ where: { orgId, role: 'OWNER' }, include: { user: true } });
      for (const owner of owners) await this.mail.send(owner.user.email, subject, `Hi ${owner.user.name},\n\n${text}`);
    } catch (error) {
      this.logger.warn(`Could not email the owners of org ${orgId}: ${(error as Error).message}`);
    }
  }

  private billingLink(orgId: string): string {
    return `${this.config.get<string>('PORTAL_URL', '').replace(/\/$/, '')}/o/${orgId}/live/billing`;
  }

  private async find(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
}
