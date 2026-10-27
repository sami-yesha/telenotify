import { Body, Controller, Headers, HttpCode, Logger, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { AdminService } from '../admin/admin.service';
import { safeEqual } from '../common/crypto';
import { ChatScope, CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';
import { VERIFICATION_PREFIX, VerificationsService } from '../verifications/verifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramUpdate } from './telegram-update.types';
import { TelegramService } from './telegram.service';

interface BotContext {
  scope: ChatScope;
  bot: TelegramApiClient;
  // Live: the organization's name. Sandbox: shared bot, so a generic name.
  displayName: string;
  // Phone linking is ambiguous on the shared sandbox bot, so live only.
  phoneLinkEnvironmentId?: string;
}

// Receives updates for the shared sandbox bot and every live bot. Telegram retries
// non-2xx responses, so after authentication we always answer 200 and log failures.
@ApiExcludeController()
@Controller('telegram/webhook')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly customers: CustomersService,
    private readonly messages: MessagesService,
    private readonly verifications: VerificationsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
    private readonly admin: AdminService,
  ) {}

  @Post('sandbox')
  @HttpCode(200)
  async sandbox(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TelegramUpdate) {
    const expected = this.config.get<string>('SANDBOX_WEBHOOK_SECRET');
    if (!expected || !secret || !safeEqual(secret, expected)) throw new UnauthorizedException();
    await this.handle(update, {
      scope: { environment: { type: 'SANDBOX' } },
      bot: this.telegram.sandboxClient(),
      displayName: 'Telenotify Sandbox',
    });
    return { ok: true };
  }

  @Post(':environmentId')
  @HttpCode(200)
  async live(
    @Param('environmentId') environmentId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    const environment = await this.prisma.environment.findFirst({ where: { id: environmentId, type: 'LIVE' }, include: { org: true } });
    if (!environment) throw new NotFoundException();
    if (!secret || !safeEqual(secret, environment.webhookSecret)) throw new UnauthorizedException();
    await this.handle(update, {
      scope: { environmentId },
      bot: this.telegram.clientForEnvironment(environment),
      displayName: environment.org.name,
      phoneLinkEnvironmentId: environmentId,
    });
    return { ok: true };
  }

  private async handle(update: TelegramUpdate, ctx: BotContext) {
    try {
      if (update.my_chat_member) await this.onMembershipChange(ctx, update.my_chat_member);
      if (update.message) await this.onMessage(ctx, update.message);
    } catch (error) {
      this.logger.error(`Update ${update.update_id} failed: ${(error as Error).message}`);
    }
  }

  private async onMembershipChange(ctx: BotContext, change: NonNullable<TelegramUpdate['my_chat_member']>) {
    if (change.chat.type !== 'private') return;
    const blocked = change.new_chat_member.status === 'kicked';
    const customers = await this.customers.setBlocked(ctx.scope, String(change.chat.id), blocked);
    if (blocked) {
      for (const customer of customers) {
        await this.webhooks.emit(customer.environment, 'customer.blocked', { externalId: customer.externalId });
        await this.admin.onCustomerBlocked(customer.environment.id);
      }
    }
  }

  private async onMessage(ctx: BotContext, message: NonNullable<TelegramUpdate['message']>) {
    if (message.chat.type !== 'private' || !message.from) return;
    const chat = { chatId: String(message.chat.id), username: message.from.username };
    const { bot } = ctx;

    if (message.contact) {
      // An open phone verification for this chat takes precedence over phone-based linking.
      const outcome = await this.verifications.completeWithContact(ctx.scope, chat, message.contact, message.from.id);
      if (outcome.kind === 'not_own_contact') {
        await bot.sendMessage(chat.chatId, 'Please share your own phone number using the button below.', { requestContact: true });
        return;
      }
      if (outcome.kind === 'verified') {
        await bot.removeKeyboardMessage(chat.chatId, `✅ Your phone number is verified. You can go back to ${outcome.orgName} now.`);
        if (outcome.passJoinUrl) {
          await bot.sendMessage(chat.chatId, '⚡ Next time, verify with one tap: Telenotify Pass keeps your verified number, and you confirm each request with Yes or No.', {
            buttons: [[{ text: 'Use Telenotify Pass', url: outcome.passJoinUrl }]],
          });
        }
        return;
      }
      if (outcome.kind === 'mismatch') {
        await bot.removeKeyboardMessage(
          chat.chatId,
          `❌ This Telegram account's phone number doesn't match the one you entered at ${outcome.orgName}. Go back and check the number.`,
        );
        return;
      }

      if (!ctx.phoneLinkEnvironmentId) {
        await bot.removeKeyboardMessage(chat.chatId, 'In the sandbox, connect using the link from the developer portal.');
        return;
      }
      // Only accept the user's own contact card, not one they forwarded.
      if (message.contact.user_id !== message.from.id) {
        await bot.sendMessage(chat.chatId, 'Please share your own phone number using the button below.', { requestContact: true });
        return;
      }
      const linked = await this.customers.linkByPhone(ctx.phoneLinkEnvironmentId, message.contact.phone_number, chat);
      if (linked.length === 0) {
        await bot.removeKeyboardMessage(chat.chatId, `We couldn't find an account with this number at ${ctx.displayName}. Ask them for your connect link.`);
        return;
      }
      await bot.removeKeyboardMessage(chat.chatId, `✅ Connected to ${ctx.displayName}. You'll get your updates here.`);
      for (const customer of linked) {
        await this.webhooks.emit(customer.environment, 'customer.linked', { externalId: customer.externalId, method: 'phone' });
      }
      return;
    }

    const text = message.text?.trim();
    if (!text) return;

    if (text === '/start' || text.startsWith('/start ')) {
      const token = text.slice('/start'.length).trim();
      if (token.startsWith(VERIFICATION_PREFIX)) {
        const started = await this.verifications.start(ctx.scope, token.slice(VERIFICATION_PREFIX.length), chat);
        if (!started) {
          await bot.sendMessage(chat.chatId, 'This verification link has expired or was already used. Go back and start again.');
          return;
        }
        await bot.sendMessage(
          chat.chatId,
          `${started.orgName} wants to confirm your phone number.\n\nTap “Share my phone number” below. Telegram shares only your number, nothing else.`,
          { requestContact: true },
        );
        return;
      }
      if (token) {
        const result = await this.customers.linkByToken(ctx.scope, token, chat);
        if (result.ok) {
          const name = await this.connectedName(ctx, result.customer.environment.orgId);
          if (result.alreadyLinked) {
            await bot.sendMessage(chat.chatId, `You're already connected to ${name}.`);
            return;
          }
          await bot.sendMessage(chat.chatId, `✅ Connected to ${name}. You'll get your updates here.`);
          await this.webhooks.emit(result.customer.environment, 'customer.linked', { externalId: result.customer.externalId, method: 'link' });
          return;
        }
        if (result.reason === 'sandbox_limit') {
          await bot.sendMessage(chat.chatId, 'This sandbox has reached its limit of linked Telegram users. Use the test customers, or switch to live.');
          return;
        }
      }
      if (ctx.phoneLinkEnvironmentId) {
        const existing = await this.customers.findByChat(ctx.scope, chat.chatId);
        if (existing.length > 0) {
          await bot.sendMessage(chat.chatId, `You're already connected to ${ctx.displayName}.`);
          return;
        }
        await bot.sendMessage(
          chat.chatId,
          `Welcome to ${ctx.displayName}! ${token ? 'That link has expired or was already used. ' : ''}Share your phone number to connect your account.`,
          { requestContact: true },
        );
        return;
      }
      await bot.sendMessage(
        chat.chatId,
        token
          ? 'That link has expired or was already used. Create a new one in the developer portal.'
          : 'This is the Telenotify sandbox bot. Connect using a link from the developer portal or POST /v1/customers/link.',
      );
      return;
    }

    const customers = await this.customers.findByChat(ctx.scope, chat.chatId);
    for (const customer of customers) {
      await this.messages.recordInbound(customer.environment, customer, text, String(message.message_id));
    }
  }

  private async connectedName(ctx: BotContext, orgId: string): Promise<string> {
    if (ctx.phoneLinkEnvironmentId) return ctx.displayName;
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return `${org?.name ?? 'the organization'} (sandbox)`;
  }
}
