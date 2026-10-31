import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { safeEqual } from '../common/crypto';
import { maskPhone, PASS_CALLBACK, PASS_JOIN_PREFIX, PassService } from '../verifications/pass.service';
import { VerificationsService } from '../verifications/verifications.service';
import { TelegramUpdate } from './telegram-update.types';

const WELCOME =
  '👋 This is Telenotify Pass.\n\n' +
  'Verify your phone number once. After that, when you sign up or log in at a business that uses Telenotify, ' +
  'you just tap "Yes" here. No codes, no searching for their bot.\n\n' +
  'We only message you when a business asks to confirm your number, and nothing is shared unless you tap Yes. ' +
  'Send /stop anytime to leave and delete your number.\n\n' +
  'To join, tap "Share my phone number" below.';

const JOINED = (phone: string) =>
  `✅ You're in Telenotify Pass with ${maskPhone(phone)}.\n\n` +
  "Next time a business on Telenotify asks for your number, you'll get a Yes/No message here. Send /stop anytime to leave.";

// Our own bot for Telenotify Pass (separate path from the per-environment bots, so a
// UUID route can't shadow it). Telegram retries non-2xx, so we always answer 200.
@ApiExcludeController()
@Controller('telegram/pass-webhook')
export class PassWebhookController {
  private readonly logger = new Logger(PassWebhookController.name);

  constructor(
    private readonly pass: PassService,
    private readonly verifications: VerificationsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TelegramUpdate) {
    const expected = this.config.get<string>('PASS_WEBHOOK_SECRET');
    if (!expected || !secret || !safeEqual(secret, expected) || !this.pass.enabled()) throw new UnauthorizedException();
    try {
      if (update.callback_query) await this.onTap(update.callback_query);
      if (update.message) await this.onMessage(update.message);
      // Blocking the Pass bot means leaving: delete their number.
      if (update.my_chat_member?.new_chat_member.status === 'kicked') await this.pass.leave(update.my_chat_member.from.id);
    } catch (error) {
      this.logger.error(`Pass update ${update.update_id} failed: ${(error as Error).message}`);
    }
    return { ok: true };
  }

  private async onTap(query: NonNullable<TelegramUpdate['callback_query']>) {
    const bot = this.pass.client();
    const match = PASS_CALLBACK.exec(query.data ?? '');
    if (!match) return bot.answerCallbackQuery(query.id);
    const outcome = await this.verifications.answerPass(match[1], query.from.id, match[2] === 'y');
    await bot.answerCallbackQuery(query.id, outcome.kind === 'verified' ? 'Confirmed ✅' : outcome.kind === 'denied' ? 'Okay, declined' : outcome.text.slice(0, 190));
  }

  private async onMessage(message: NonNullable<TelegramUpdate['message']>) {
    if (message.chat.type !== 'private' || !message.from) return;
    const bot = this.pass.client();
    const chatId = String(message.chat.id);

    if (message.contact) {
      const joined = await this.pass.joinWithContact(message.contact, message.from.id, chatId);
      await bot.removeKeyboardMessage(chatId, joined ? JOINED(joined.phone) : 'Please share your own phone number using the button below.');
      return;
    }

    const text = message.text?.trim() ?? '';
    if (text === '/stop') {
      const left = await this.pass.leave(message.from.id);
      await bot.removeKeyboardMessage(chatId, left ? 'Done. You left Telenotify Pass and your number is deleted. Send /start to join again.' : "You're not in Telenotify Pass. Send /start to join.");
      return;
    }

    if (text.startsWith(`/start ${PASS_JOIN_PREFIX}`)) {
      const joined = await this.pass.joinWithToken(text.slice(`/start ${PASS_JOIN_PREFIX}`.length).trim(), message.from.id, chatId);
      if (joined) {
        await bot.sendMessage(chatId, JOINED(joined.phone));
        return;
      }
      // Expired or opened from another account: fall through to the normal welcome.
    }

    const member = await this.pass.member(message.from.id);
    if (member) {
      await bot.sendMessage(chatId, `You're in Telenotify Pass with ${maskPhone(member.phone)}. Requests from businesses appear here. Send /stop to leave.`);
      return;
    }
    await bot.sendMessage(chatId, WELCOME, { requestContact: true });
  }
}
