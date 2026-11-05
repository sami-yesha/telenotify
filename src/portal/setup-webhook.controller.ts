import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { safeEqual } from '../common/crypto';
import { TelegramUpdate } from '../telegram/telegram-update.types';
import { BotSetupService } from './bot-setup.service';

// Our setup bot, which creates businesses' bots (see BotSetupService). Telegram retries
// non-2xx, so we always answer 200 once the secret checks out.
@ApiExcludeController()
@Controller('telegram/setup-webhook')
export class SetupWebhookController {
  private readonly logger = new Logger(SetupWebhookController.name);

  constructor(
    private readonly setup: BotSetupService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TelegramUpdate) {
    const expected = this.config.get<string>('SETUP_WEBHOOK_SECRET');
    if (!expected || !secret || !safeEqual(secret, expected) || !this.setup.enabled()) throw new UnauthorizedException();
    try {
      await this.setup.handleUpdate(update);
    } catch (error) {
      this.logger.error(`Setup update ${update.update_id} failed: ${(error as Error).message}`);
    }
    return { ok: true };
  }
}
