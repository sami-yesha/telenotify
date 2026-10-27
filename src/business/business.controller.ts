import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Organization, User } from '@prisma/client';
import type { Request } from 'express';
import { OperatorGuard } from '../admin/operator.guard';
import { OrgAccessGuard } from '../common/org-access.guard';
import { CurrentUser } from '../common/request-context';
import { SessionGuard } from '../common/session.guard';
import { AUTH_LIMITS } from '../common/throttling';
import { BusinessVerificationDto, RejectBusinessDto } from './business.dto';
import { BusinessService } from './business.service';

type OrgRequest = Request & { membership: { org: Organization; role: string } };

@ApiExcludeController()
@UseGuards(SessionGuard, OrgAccessGuard)
@Controller('portal/orgs/:orgId/business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  get(@Req() req: OrgRequest) {
    return this.business.view(req.membership.org);
  }

  @Post()
  @HttpCode(200)
  request(@Req() req: OrgRequest, @CurrentUser() user: User, @Body() dto: BusinessVerificationDto) {
    return this.business.request(req.membership.org, req.membership.role, user, dto);
  }

  @Post('show-on-bot')
  @HttpCode(200)
  showOnBot(@Req() req: OrgRequest, @CurrentUser() user: User) {
    return this.business.showOnBot(req.membership.org, req.membership.role, user);
  }
}

@ApiExcludeController()
@UseGuards(SessionGuard, OperatorGuard)
@Controller('admin/orgs/:orgId/business')
export class BusinessAdminController {
  constructor(private readonly business: BusinessService) {}

  @Post('approve')
  @HttpCode(200)
  approve(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User) {
    return this.business.approve(orgId, user);
  }

  // Also revokes an existing badge.
  @Post('reject')
  @HttpCode(200)
  reject(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User, @Body() dto: RejectBusinessDto) {
    return this.business.reject(orgId, dto.reason, user);
  }
}

// Public "is this bot really that business?" check, used by the /check page.
@ApiExcludeController()
@UseGuards(ThrottlerGuard)
@Controller('v1/public/businesses')
export class PublicBusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get(':botUsername')
  @Throttle(AUTH_LIMITS.businessLookup)
  lookup(@Param('botUsername') botUsername: string) {
    return this.business.lookup(botUsername);
  }
}
