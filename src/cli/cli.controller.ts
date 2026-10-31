import { Body, Controller, Get, HttpCode, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiKeyGuard } from '../common/api-key.guard';
import { CurrentEnvironment, EnvironmentWithOrg } from '../common/request-context';
import { RequestLogInterceptor } from '../request-log/request-log.interceptor';
import { CliService } from './cli.service';
import { TRIGGERABLE_EVENTS } from './sample-events';

export class TriggerEventDto {
  @ApiProperty({ enum: TRIGGERABLE_EVENTS, example: 'message.undeliverable' })
  @IsString()
  event!: string;
}

// Used by the `telenotify` CLI (npx telenotify listen / trigger). Polling isn't added
// to the request log: it runs every two seconds while the CLI is open.
@ApiTags('cli')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('v1/cli')
export class CliController {
  constructor(private readonly cli: CliService) {}

  @Post('listen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start or renew a CLI listening session (renew every 30 seconds)' })
  listen(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.cli.listen(environment);
  }

  @Get('events')
  @ApiOperation({ summary: 'Events after the cursor, each with the body and x-telenotify-signature a webhook delivery would have' })
  events(@CurrentEnvironment() environment: EnvironmentWithOrg, @Query('cursor') cursor?: string) {
    return this.cli.events(environment, cursor);
  }

  @Post('trigger')
  @HttpCode(202)
  @UseInterceptors(RequestLogInterceptor)
  @ApiOperation({ summary: 'Send a sample event to your webhook URL and any running `telenotify listen`' })
  trigger(@CurrentEnvironment() environment: EnvironmentWithOrg, @Body() dto: TriggerEventDto) {
    return this.cli.trigger(environment, dto.event);
  }
}
