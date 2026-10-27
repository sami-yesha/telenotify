import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, Organization, Verification } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { randomToken } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { isTestCustomer } from '../common/sandbox';
import { ChatScope, CustomersService, TelegramChat } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { signResult } from './result-token';

// Telegram start parameters for verification links look like "v_<token>".
export const VERIFICATION_PREFIX = 'v_';

export type ContactOutcome =
  | { kind: 'none' }
  | { kind: 'not_own_contact' }
  | { kind: 'verified'; orgName: string }
  | { kind: 'mismatch'; orgName: string };

@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly customers: CustomersService,
    private readonly webhooks: WebhooksService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  async create(
    environment: Environment,
    input: { externalId?: string; phone?: string; expiresInMinutes?: number; returnUrl?: string; origin?: string },
  ) {
    if (input.externalId && isTestCustomer(input.externalId)) {
      throw new BadRequestException(`"${input.externalId}" is a built-in test customer and cannot be verified`);
    }
    const botUsername = this.telegram.botUsernameFor(environment);
    if (!botUsername) {
      throw new BadRequestException(
        environment.type === 'LIVE' ? 'Connect your Telegram bot in the portal first' : 'The sandbox bot is not configured on this server',
      );
    }
    await this.billing.assertWithinQuota(environment);
    const verification = await this.prisma.verification.create({
      data: {
        environmentId: environment.id,
        token: randomToken(18),
        externalId: input.externalId,
        expectedPhone: input.phone ? normalizePhone(input.phone) : undefined,
        expiresAt: new Date(Date.now() + (input.expiresInMinutes ?? 10) * 60_000),
        returnUrl: input.returnUrl ? httpUrl(input.returnUrl) : undefined,
        origin: input.origin,
      },
    });
    return this.toView(verification, botUsername);
  }

  async get(environment: Environment, id: string) {
    const verification = await this.prisma.verification.findFirst({ where: { id, environmentId: environment.id } });
    if (!verification) throw new NotFoundException('Verification not found');
    return this.toView(await this.expireIfDue(verification), this.telegram.botUsernameFor(environment));
  }

  // The person opened the link: remember their chat so the contact they share is attributed correctly.
  async start(scope: ChatScope, token: string, chat: TelegramChat): Promise<{ orgName: string } | null> {
    const verification = await this.prisma.verification.findFirst({
      where: { token, status: { in: ['PENDING', 'AWAITING_CONTACT'] }, environment: 'environmentId' in scope ? { id: scope.environmentId } : scope.environment },
      include: { environment: { include: { org: true } } },
    });
    if (!verification) return null;
    if (verification.expiresAt < new Date()) {
      await this.expireIfDue(verification);
      return null;
    }
    // Only one open verification per chat, so a shared contact can't be misattributed.
    await this.prisma.verification.updateMany({
      where: { telegramChatId: chat.chatId, status: 'AWAITING_CONTACT', NOT: { id: verification.id } },
      data: { status: 'EXPIRED' },
    });
    await this.prisma.verification.update({
      where: { id: verification.id },
      data: { status: 'AWAITING_CONTACT', telegramChatId: chat.chatId },
    });
    return { orgName: verification.environment.org.name };
  }

  // Handles a shared contact if this chat has an open verification.
  async completeWithContact(
    scope: ChatScope,
    chat: TelegramChat,
    contact: { phone_number: string; user_id?: number },
    fromUserId: number,
  ): Promise<ContactOutcome> {
    const verification = await this.prisma.verification.findFirst({
      where: {
        telegramChatId: chat.chatId,
        status: 'AWAITING_CONTACT',
        expiresAt: { gt: new Date() },
        environment: 'environmentId' in scope ? { id: scope.environmentId } : scope.environment,
      },
      include: { environment: { include: { org: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) return { kind: 'none' };
    // Telegram only guarantees ownership when the shared contact is the sender's own.
    if (contact.user_id !== fromUserId) return { kind: 'not_own_contact' };

    const phone = normalizePhone(contact.phone_number);
    const { environment } = verification;
    const orgName = environment.org.name;

    if (verification.expectedPhone && verification.expectedPhone !== phone) {
      const failed = await this.prisma.verification.update({
        where: { id: verification.id },
        data: { status: 'FAILED', reason: 'phone_mismatch', phone, telegramUserId: String(fromUserId) },
      });
      await this.webhooks.emit(environment, 'verification.failed', this.toView(failed));
      return { kind: 'mismatch', orgName };
    }

    const verified = await this.prisma.verification.update({
      where: { id: verification.id },
      data: { status: 'VERIFIED', phone, telegramUserId: String(fromUserId), verifiedAt: new Date() },
    });
    if (verification.externalId) {
      const { linked } = await this.customers.linkVerified(environment, verification.externalId, phone, chat);
      if (linked) {
        await this.webhooks.emit(environment, 'customer.linked', { externalId: verification.externalId, method: 'verification' });
      }
    }
    await this.webhooks.emit(environment, 'verification.completed', this.toView(verified));
    return { kind: 'verified', orgName };
  }

  // ---------- Hosted verify page and the embeddable button ----------

  // Started from a web page with a publishable key: no externalId (a browser must not be
  // able to link a customer account), and in live only from the allowed websites.
  async createPublic(input: { publishableKey: string; origin?: string; returnUrl?: string; phone?: string }) {
    const environment = await this.prisma.environment.findUnique({ where: { publishableKey: input.publishableKey }, include: { org: true } });
    if (!environment) throw new BadRequestException('Unknown publishable key');
    const site = input.origin ?? (input.returnUrl ? new URL(httpUrl(input.returnUrl)).origin : undefined);
    if (!site) throw new BadRequestException('Give the website (origin) or a returnUrl');
    const origin = new URL(httpUrl(site)).origin;
    if (environment.type === 'LIVE' && !environment.allowedOrigins.includes(origin)) {
      throw new ForbiddenException(`${origin} isn't an allowed website for this key. Add it under Live → Verify widget in the portal.`);
    }
    const created = await this.create(environment, { phone: input.phone, returnUrl: input.returnUrl, origin });
    return { id: created.id, hostedUrl: created.hostedUrl };
  }

  // What the hosted page shows. The id is an unguessable UUID that only the person
  // verifying receives, so it doubles as the capability to read this.
  async getPublic(id: string) {
    const found = await this.prisma.verification.findUnique({ where: { id }, include: { environment: { include: { org: true } } } });
    if (!found) throw new NotFoundException('Verification not found');
    const verification = await this.expireIfDue(found);
    const environment = found.environment;
    const view = this.toView(verification, this.telegram.botUsernameFor(environment));
    const final = verification.status === 'VERIFIED' || verification.status === 'FAILED';
    return {
      id: view.id,
      status: view.status,
      reason: view.reason,
      url: view.url,
      expiresAt: view.expiresAt,
      environment: environment.type === 'LIVE' ? 'live' : 'sandbox',
      orgName: environment.org.name,
      // The "Verified business" badge (live only: the sandbox is for testing).
      verifiedBusiness:
        environment.type === 'LIVE' && environment.org.businessStatus === 'VERIFIED' && environment.org.status === 'ACTIVE' ? { legalName: environment.org.legalName } : null,
      botUsername: this.telegram.botUsernameFor(environment) ?? null,
      returnUrl: verification.returnUrl,
      origin: verification.origin,
      phone: verification.status === 'VERIFIED' ? verification.phone : null,
      token: final ? this.resultToken(verification, environment) : null,
    };
  }

  resultToken(verification: Verification, environment: Environment & { org?: Organization }) {
    return signResult(
      {
        id: verification.id,
        status: verification.status as 'VERIFIED' | 'FAILED',
        phone: verification.status === 'VERIFIED' ? verification.phone : null,
        reason: verification.reason,
        environment: environment.type === 'LIVE' ? 'live' : 'sandbox',
      },
      environment.eventSigningSecret,
    );
  }

  toView(verification: Verification, botUsername?: string) {
    return {
      id: verification.id,
      status: verification.status,
      reason: verification.reason,
      externalId: verification.externalId,
      // The verified number, once VERIFIED (or the mismatching one, on phone_mismatch).
      phone: verification.phone,
      url: botUsername && ['PENDING', 'AWAITING_CONTACT'].includes(verification.status) ? `https://t.me/${botUsername}?start=${VERIFICATION_PREFIX}${verification.token}` : null,
      // Send the person here instead of to the t.me link: it shows your organization, a
      // QR code on desktop and the live status, then returns to returnUrl.
      hostedUrl: `${this.config.get<string>('PORTAL_URL', '').replace(/\/$/, '')}/verify/${verification.id}`,
      returnUrl: verification.returnUrl,
      expiresAt: verification.expiresAt,
      verifiedAt: verification.verifiedAt,
      createdAt: verification.createdAt,
    };
  }

  private async expireIfDue(verification: Verification): Promise<Verification> {
    if (!['PENDING', 'AWAITING_CONTACT'].includes(verification.status) || verification.expiresAt > new Date()) return verification;
    return this.prisma.verification.update({ where: { id: verification.id }, data: { status: 'EXPIRED' } });
  }
}

function httpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(`Not a valid URL: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BadRequestException('Only http and https URLs are allowed');
  return url.toString();
}
