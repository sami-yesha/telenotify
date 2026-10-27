import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Organization, User } from '@prisma/client';
import { OperatorNotifier } from '../admin/operator-notifier.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { BusinessVerificationDto } from './business.dto';

const BADGE_PREFIX = '✓ Verified business on Telenotify';

// The "Verified business" badge. An organization sends its legal details, an
// operator checks them (e.g. against the trade registry) and approves. Only the
// hosted service grants it, so customers learn to trust it, and a copy of the
// code can't. Shown on the hosted verify page, the public /check page and,
// if the organization wants, on its bot's profile.
@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifier: OperatorNotifier,
    private readonly telegram: TelegramService,
  ) {}

  view(org: Organization) {
    return {
      status: org.businessStatus.toLowerCase() as 'none' | 'pending' | 'verified' | 'rejected',
      legalName: org.legalName,
      tin: org.tin,
      tradeLicense: org.tradeLicense,
      website: org.website,
      requestedAt: org.businessRequestedAt,
      verifiedAt: org.businessVerifiedAt,
      rejectReason: org.businessRejectReason,
    };
  }

  // ---------- Organization side ----------

  async request(org: Organization, role: string, actor: User, dto: BusinessVerificationDto) {
    if (role !== 'OWNER') throw new ForbiddenException('Only an owner can request business verification');
    if (org.businessStatus === 'VERIFIED') throw new BadRequestException('Already verified. Contact support to change your business details.');
    if (org.businessStatus === 'PENDING') throw new BadRequestException('Your request is already being reviewed');
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        businessStatus: 'PENDING',
        legalName: dto.legalName.trim(),
        tin: dto.tin,
        tradeLicense: dto.tradeLicense.trim(),
        website: dto.website?.trim() || org.website,
        businessRequestedAt: new Date(),
        businessRejectReason: null,
      },
    });
    await this.audit.record(org.id, actor, 'business.verification_requested', updated.legalName!);
    // Not awaited: a slow mail server shouldn't hold up the owner's request.
    void this.notifier.notify(
      `Business verification: ${org.name}`,
      `${org.name} asked for the Verified business badge.\nRequested by: ${actor.email}\nLegal name: ${updated.legalName}\nTIN: ${updated.tin}\nTrade license: ${updated.tradeLicense}\nWebsite: ${updated.website ?? '-'}`,
    );
    return this.view(updated);
  }

  // Puts "✓ Verified business on Telenotify: <name>" on the live bot's profile.
  async showOnBot(org: Organization, role: string, actor: User) {
    if (role !== 'OWNER') throw new ForbiddenException('Only an owner can change the bot profile');
    if (org.businessStatus !== 'VERIFIED') throw new BadRequestException('Your business is not verified yet');
    const live = await this.prisma.environment.findFirst({ where: { orgId: org.id, type: 'LIVE' } });
    if (!live?.botTokenEncrypted) throw new BadRequestException('Connect your live Telegram bot first');
    const text = this.badgeText(org.legalName ?? org.name);
    await this.telegram.clientForEnvironment(live).setMyShortDescription(text);
    await this.audit.record(org.id, actor, 'business.badge_on_bot', live.botUsername ?? '');
    return { shortDescription: text };
  }

  // ---------- Operator side ----------

  async approve(orgId: string, actor: User) {
    const org = await this.find(orgId);
    if (!org.legalName || !org.tin) throw new BadRequestException('This organization has not sent its business details');
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { businessStatus: 'VERIFIED', businessVerifiedAt: new Date(), businessRejectReason: null },
    });
    await this.audit.record(org.id, actor, 'business.verified', updated.legalName!);
    void this.emailOwners(
      org.id,
      `${org.name} is now a verified business on Telenotify`,
      `Good news: we checked your business details and ${updated.legalName} is now verified.\n\nYour customers see "✓ Verified business" on the Telenotify verify page and at ${this.portal()}/check.\nYou can also add it to your bot's profile from Organization settings in the portal.`,
    );
    return this.view(updated);
  }

  async reject(orgId: string, reason: string, actor: User) {
    const org = await this.find(orgId);
    const wasVerified = org.businessStatus === 'VERIFIED';
    const updated = await this.prisma.organization.update({
      where: { id: org.id },
      data: { businessStatus: 'REJECTED', businessVerifiedAt: null, businessRejectReason: reason.trim().slice(0, 500) },
    });
    await this.audit.record(org.id, actor, wasVerified ? 'business.revoked' : 'business.rejected', org.legalName ?? org.name, { reason: updated.businessRejectReason });
    if (wasVerified) await this.removeFromBot(org.id);
    void this.emailOwners(
      org.id,
      wasVerified ? `${org.name}: verified business badge removed` : `${org.name}: business verification not approved`,
      `${wasVerified ? 'We removed the Verified business badge' : 'We could not verify your business details'}.\n\nReason: ${updated.businessRejectReason}\n\nYou can correct your details and ask again from Organization settings in the portal.`,
    );
    return this.view(updated);
  }

  // ---------- Public ----------

  // "Is this bot really that business?" Anyone can ask, e.g. before sharing a phone number.
  async lookup(botUsername: string) {
    const username = botUsername.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{5,64}$/.test(username)) throw new BadRequestException('Enter a bot username, e.g. @abebe_pharmacy_bot');
    const live = await this.prisma.environment.findFirst({
      where: { type: 'LIVE', botUsername: { equals: username, mode: 'insensitive' } },
      include: { org: true },
    });
    if (!live) return { botUsername: username, onTelenotify: false, verified: false };
    const verified = live.org.businessStatus === 'VERIFIED' && live.org.status === 'ACTIVE';
    return {
      botUsername: live.botUsername,
      onTelenotify: true,
      verified,
      ...(verified ? { legalName: live.org.legalName, website: live.org.website, verifiedSince: live.org.businessVerifiedAt } : {}),
    };
  }

  // ---------- Helpers ----------

  private badgeText(legalName: string): string {
    const text = `${BADGE_PREFIX}: ${legalName}. Check any bot at ${this.portal().replace(/^https?:\/\//, '')}/check`;
    return text.length <= 120 ? text : `${BADGE_PREFIX}: ${legalName}`.slice(0, 120);
  }

  // Only removes the line if it's ours, so a description the business wrote stays.
  private async removeFromBot(orgId: string) {
    try {
      const live = await this.prisma.environment.findFirst({ where: { orgId, type: 'LIVE' } });
      if (!live?.botTokenEncrypted) return;
      const client = this.telegram.clientForEnvironment(live);
      const { short_description } = await client.getMyShortDescription();
      if (short_description.startsWith(BADGE_PREFIX)) await client.setMyShortDescription('');
    } catch (error) {
      this.logger.warn(`Could not remove the badge from the bot of org ${orgId}: ${(error as Error).message}`);
    }
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

  private async find(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private portal(): string {
    return this.config.get<string>('PORTAL_URL', '').replace(/\/$/, '');
  }
}
