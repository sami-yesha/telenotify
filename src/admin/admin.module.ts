import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MESSAGES_QUEUE } from '../messages/messages.constants';
import { SMS_FALLBACK_QUEUE } from '../sms-fallback/sms-fallback.constants';
import { WEBHOOKS_QUEUE } from '../webhooks/webhooks.constants';
import { AdminInsightsController } from './admin-insights.controller';
import { AdminInsightsService } from './admin-insights.service';
import { TelegramModule } from '../telegram/telegram.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { OperatorNotifier } from './operator-notifier.service';

@Global()
@Module({
  imports: [TelegramModule, BullModule.registerQueue({ name: MESSAGES_QUEUE }, { name: WEBHOOKS_QUEUE }, { name: SMS_FALLBACK_QUEUE })],
  controllers: [AdminController, AdminInsightsController],
  providers: [AdminService, AdminInsightsService, OperatorNotifier],
  exports: [AdminService, OperatorNotifier],
})
export class AdminModule {}
