import { Module } from '@nestjs/common';
import { LimitsAdminController, LimitsController } from './limits.controller';
import { LimitsService } from './limits.service';

@Module({
  controllers: [LimitsController, LimitsAdminController],
  providers: [LimitsService],
})
export class LimitsModule {}
