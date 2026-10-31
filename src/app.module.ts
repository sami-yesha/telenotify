import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptions } from './common/throttling';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BusinessModule } from './business/business.module';
import { CliModule } from './cli/cli.module';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health.controller';
import { MailModule } from './mail/mail.module';
import { MessagesModule } from './messages/messages.module';
import { PortalModule } from './portal/portal.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestLogModule } from './request-log/request-log.service';
import { TeamModule } from './team/team.module';
import { TelegramWebhookModule } from './telegram/telegram-webhook.module';
import { TemplatesModule } from './templates/templates.module';
import { VerificationsModule } from './verifications/verifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(throttlerOptions),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
        },
      }),
    }),
    PrismaModule,
    MailModule,
    WebhooksModule,
    AuditModule,
    AdminModule,
    RequestLogModule,
    BillingModule,
    AuthModule,
    PortalModule,
    BusinessModule,
    CliModule,
    TeamModule,
    CustomersModule,
    TemplatesModule,
    MessagesModule,
    VerificationsModule,
    TelegramWebhookModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
