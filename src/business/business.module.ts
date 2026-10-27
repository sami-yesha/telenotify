import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { BusinessAdminController, BusinessController, PublicBusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Module({
  imports: [TelegramModule],
  controllers: [BusinessController, BusinessAdminController, PublicBusinessController],
  providers: [BusinessService],
})
export class BusinessModule {}
