import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import type { Request } from 'express';
import { OperatorGuard } from '../admin/operator.guard';
import { OrgAccessGuard } from '../common/org-access.guard';
import { CurrentUser } from '../common/request-context';
import { SessionGuard } from '../common/session.guard';
import { ApproveLimitDto, DeclineLimitDto, RequestLimitDto, SetLimitDto } from './limits.dto';
import { LimitsService } from './limits.service';

type OrgRequest = Request & { membership: { org: Organization; role: string } };

@ApiExcludeController()
@UseGuards(SessionGuard, OrgAccessGuard)
@Controller('portal/orgs/:orgId/limit-request')
export class LimitsController {
  constructor(private readonly limits: LimitsService) {}

  @Post()
  @HttpCode(200)
  request(@Req() req: OrgRequest, @CurrentUser() user: User, @Body() dto: RequestLimitDto) {
    return this.limits.request(req.membership.org, req.membership.role, user, dto.monthlyLimit, dto.reason);
  }
}

@ApiExcludeController()
@UseGuards(SessionGuard, OperatorGuard)
@Controller('admin/orgs/:orgId')
export class LimitsAdminController {
  constructor(private readonly limits: LimitsService) {}

  @Post('limit-request/approve')
  @HttpCode(200)
  approve(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User, @Body() dto: ApproveLimitDto) {
    return this.limits.approve(orgId, dto.monthlyLimit, user);
  }

  @Post('limit-request/decline')
  @HttpCode(200)
  decline(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User, @Body() dto: DeclineLimitDto) {
    return this.limits.decline(orgId, dto.reason, user);
  }

  @Put('limit')
  set(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User, @Body() dto: SetLimitDto) {
    return this.limits.set(orgId, dto.monthlyLimit ?? null, user);
  }
}
