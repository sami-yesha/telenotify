import { Module } from '@nestjs/common';
import { CliController } from './cli.controller';
import { CliService } from './cli.service';

@Module({
  controllers: [CliController],
  providers: [CliService],
})
export class CliModule {}
