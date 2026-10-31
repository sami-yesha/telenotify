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
import { maskPhone, PassService } from './pass.service';
import { signResult } from './result-token';

// Telegram start parameters for verification links look like "v_<token>".
export const VERIFICATION_PREFIX = 'v_';

export type ContactOutcome =
  | { kind: 'none' }
  | { kind: 'not_own_contact' }
  | { kind: 'verified'; orgName: string; passJoinUrl: string | null }
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
    private readonly pass: PassService,
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
    // A Telenotify Pass member with this number gets a one-tap Yes/No in parallel.
    if (verification.expectedPhone) void this.pass.offer(verification.id);
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
        data: { status: 'FAILED', reason: 'phone_mismatch', phone, telegramUserId: String(fromUserId), method: 'telegram' },
      });
      await this.webhooks.emit(environment, 'verification.failed', this.toView(failed));
      return { kind: 'mismatch', orgName };
    }

    const verified = await this.prisma.verification.update({
      where: { id: verification.id },
      data: { status: 'VERIFIED', phone, telegramUserId: String(fromUserId), verifiedAt: new Date(), method: 'telegram' },
    });
    await this.pass.replaceRequest({ ...verified, passIdentity: await this.passIdentityOf(verified) }, `✅ Confirmed in ${orgName}'s bot.`);
    if (verification.externalId) {
      const { linked } = await this.customers.linkVerified(environment, verification.externalId, phone, chat);
      if (linked) {
        await this.webhooks.emit(environment, 'customer.linked', { externalId: verification.externalId, method: 'verification' });
      }
    }
    await this.webhooks.emit(environment, 'verification.completed', this.toView(verified));
    const invite = environment.type === 'SANDBOX' || environment.passInvite;
    return { kind: 'verified', orgName, passJoinUrl: invite ? await this.pass.joinUrl(verified) : null };
  }

  // ---------- Telenotify Pass ----------

  // The member tapped Yes or No on a request in the Pass bot. Only the member it was
  // sent to can answer, and only while the verification is still open.
  async answerPass(verificationId: string, telegramUserId: number, approve: boolean): Promise<{ kind: 'verified' | 'denied' | 'closed' | 'not_yours'; orgName: string; text: string }> {
    const found = await this.prisma.verification.findUnique({ where: { id: verificationId }, include: { environment: { include: { org: true } }, passIdentity: true } });
    if (!found) return { kind: 'closed', orgName: '', text: 'This request no longer exists.' };
    const orgName = found.environment.org.name;
    if (!found.passIdentity || found.passIdentity.telegramUserId !== String(telegramUserId)) return { kind: 'not_yours', orgName, text: 'This request was not sent to you.' };
    const verification = await this.expireIfDue(found);
    if (!['PENDING', 'AWAITING_CONTACT'].includes(verification.status)) {
      const text = verification.status === 'VERIFIED' ? `✅ Already confirmed for ${orgName}.` : `This request from ${orgName} has ${verification.status === 'EXPIRED' ? 'expired' : 'closed'}. Start again on their website if you need to.`;
      await this.pass.replaceRequest(found, text);
      return { kind: 'closed', orgName, text };
    }
    const { environment, passIdentity } = found;
    if (approve) {
      const verified = await this.prisma.verification.update({
        where: { id: verification.id },
        data: { status: 'VERIFIED', phone: passIdentity.phone, telegramUserId: passIdentity.telegramUserId, verifiedAt: new Date(), method: 'pass' },
      });
      await this.webhooks.emit(environment, 'verification.completed', this.toView(verified));
      const text = `✅ Confirmed ${maskPhone(passIdentity.phone)} for ${orgName}. You can go back to them now.`;
      await this.pass.replaceRequest(found, text);
      return { kind: 'verified', orgName, text };
    }
    const failed = await this.prisma.verification.update({ where: { id: verification.id }, data: { status: 'FAILED', reason: 'denied', method: 'pass' } });
    await this.webhooks.emit(environment, 'verification.failed', this.toView(failed));
    const text = `Okay, we told ${orgName} it wasn't you. If you get requests you didn't start, just tap No. Send /stop to leave Telenotify Pass.`;
    await this.pass.replaceRequest(found, text);
    return { kind: 'denied', orgName, text };
  }

  private passIdentityOf(verification: Verification) {
    return verification.passIdentityId ? this.prisma.passIdentity.findUnique({ where: { id: verification.passIdentityId } }) : Promise.resolve(null);
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
      // Shown whenever a number was given, member or not, so the page reveals nothing.
      passAvailable: this.pass.enabled() && Boolean(verification.expectedPhone) && !final,
      passJoinUrl: verification.status === 'VERIFIED' ? await this.pass.joinUrl(verification) : null,
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
      // "telegram" (shared their contact with your bot) or "pass" (one tap in Telenotify Pass).
      method: verification.method,
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
