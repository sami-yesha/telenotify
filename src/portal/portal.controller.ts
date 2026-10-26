import { Throttle } from '@nestjs/throttler';
import { AUTH_LIMITS } from '../common/throttling';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DeliveryStatus, MessageStatus, Organization, User } from '@prisma/client';
import type { Request } from 'express';
import { OrgAccessGuard } from '../common/org-access.guard';
import { CurrentEnvironment, CurrentUser, EnvironmentWithOrg } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import { RequestLogService } from '../request-log/request-log.service';
import { SessionGuard } from '../common/session.guard';
import { CustomersService } from '../customers/customers.service';
import { BillingService } from '../billing/billing.service';
import { MessagesService } from '../messages/messages.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { VerificationsService } from '../verifications/verifications.service';
import { ConnectBotDto, CreateApiKeyDto, CreateOrgDto, CustomerMessageDto, PlaygroundLinkDto, PlaygroundSendDto, PlaygroundVerifyDto, TestSmsDto, AllowedOriginsDto, UpdateEnvironmentDto, UpdateSmsFallbackDto } from './portal.dto';
import { PortalService } from './portal.service';
import { AdminService } from '../admin/admin.service';
import { LiveReviewDto } from '../admin/admin.dto';
import { SmsFallbackService } from '../sms-fallback/sms-fallback.service';

@ApiExcludeController()
@UseGuards(SessionGuard, OrgAccessGuard)
@Controller('portal/orgs')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly customers: CustomersService,
    private readonly messages: MessagesService,
    private readonly verifications: VerificationsService,
    private readonly billing: BillingService,
    private readonly webhooks: WebhooksService,
    private readonly audit: AuditService,
    private readonly requestLog: RequestLogService,
    private readonly smsFallback: SmsFallbackService,
    private readonly admin: AdminService,
  ) {}

  @Post()
  createOrg(@CurrentUser() user: User, @Body() dto: CreateOrgDto) {
    return this.portal.createOrg(user, dto.name);
  }

  @Get()
  listOrgs(@CurrentUser() user: User) {
    return this.portal.listOrgs(user);
  }

  @Get(':orgId')
  getOrg(@Req() req: Request & { membership: { org: Organization; role: string } }) {
    return this.portal.getOrg(req.membership.org, req.membership.role);
  }

  // Asks the operators to approve live sending (new orgs are capped per day until then).
  @Post(':orgId/live-review')
  @HttpCode(200)
  async requestLiveReview(@Req() req: Request & { membership: { org: Organization; role: string } }, @CurrentUser() user: User, @Body() dto: LiveReviewDto) {
    await this.admin.requestLiveReview(req.membership.org, dto, user);
    return this.portal.getOrg(await this.portal.reloadOrg(req.membership.org.id), req.membership.role);
  }

  @Get(':orgId/audit')
  auditLog(@Param('orgId') orgId: string, @Query('cursor') cursor?: string, @Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.audit.list(orgId, { cursor, limit });
  }

  @Get(':orgId/billing')
  billingOverview(@Req() req: Request & { membership: { org: Organization } }) {
    return this.billing.overview(req.membership.org);
  }

  @Get(':orgId/envs/:env')
  environment(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.portal.environmentView(environment);
  }

  @Patch(':orgId/envs/:env')
  updateEnvironment(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: UpdateEnvironmentDto) {
    return this.portal.updateEnvironment(environment, dto.eventWebhookUrl?.trim() || null, user);
  }

  @Post(':orgId/envs/:env/signing-secret/rotate')
  @HttpCode(200)
  rotateSigningSecret(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User) {
    return this.portal.rotateSigningSecret(environment, user);
  }

  @Post(':orgId/envs/:env/webhook/test')
  @HttpCode(200)
  testWebhook(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.portal.sendTestEvent(environment);
  }

  @Put(':orgId/envs/:env/bot')
  connectBot(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: ConnectBotDto) {
    return this.portal.connectBot(environment, dto.botToken, user);
  }

  @Delete(':orgId/envs/:env/bot')
  disconnectBot(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User) {
    return this.portal.disconnectBot(environment, user);
  }

  @Put(':orgId/envs/:env/verify-widget/origins')
  setAllowedOrigins(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: AllowedOriginsDto) {
    return this.portal.setAllowedOrigins(environment, dto.origins, user);
  }

  @Post(':orgId/envs/:env/verify-widget/rotate-key')
  @HttpCode(200)
  rotatePublishableKey(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User) {
    return this.portal.rotatePublishableKey(environment, user);
  }

  @Get(':orgId/envs/:env/sms-fallback')
  smsFallbackSettings(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.smsFallback.view(environment);
  }

  @Put(':orgId/envs/:env/sms-fallback')
  updateSmsFallback(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: UpdateSmsFallbackDto) {
    return this.smsFallback.update(environment, dto, user);
  }

  @Get(':orgId/envs/:env/sms-fallback/history')
  smsFallbackHistory(@CurrentEnvironment() environment: EnvironmentWithOrg, @Query('before') before?: string) {
    return this.smsFallback.history(environment, before && !Number.isNaN(Date.parse(before)) ? before : undefined);
  }

  @Post(':orgId/envs/:env/sms-fallback/check')
  @HttpCode(200)
  @Throttle(AUTH_LIMITS.testSms)
  checkSmsFallbackToken(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.smsFallback.checkSavedToken(environment);
  }

  @Post(':orgId/envs/:env/sms-fallback/test')
  @HttpCode(200)
  @Throttle(AUTH_LIMITS.testSms)
  testSmsFallback(@CurrentEnvironment() environment: EnvironmentWithOrg, @Body() dto: TestSmsDto) {
    return this.smsFallback.sendTest(environment, dto.phone);
  }

  @Get(':orgId/envs/:env/requests')
  apiRequests(
    @CurrentEnvironment() environment: EnvironmentWithOrg,
    @Query('keyId') keyId?: string,
    @Query('errorsOnly', new ParseBoolPipe({ optional: true })) errorsOnly?: boolean,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.requestLog.list(environment, { apiKeyId: keyId || undefined, errorsOnly, cursor, limit });
  }

  @Get(':orgId/envs/:env/keys')
  listKeys(@CurrentEnvironment() environment: EnvironmentWithOrg) {
    return this.portal.listKeys(environment);
  }

  @Post(':orgId/envs/:env/keys')
  createKey(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: CreateApiKeyDto) {
    return this.portal.createKey(environment, dto.name, user);
  }

  @Delete(':orgId/envs/:env/keys/:keyId')
  @HttpCode(204)
  revokeKey(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Param('keyId') keyId: string) {
    return this.portal.revokeKey(environment, keyId, user);
  }

  @Get(':orgId/envs/:env/messages')
  listMessages(
    @CurrentEnvironment() environment: EnvironmentWithOrg,
    @Query('customer') customer?: string,
    @Query('status', new ParseEnumPipe(MessageStatus, { optional: true })) status?: MessageStatus,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.messages.list(environment, { customer: customer || undefined, status, cursor, limit });
  }

  @Get(':orgId/envs/:env/analytics')
  analytics(@CurrentEnvironment() environment: EnvironmentWithOrg, @Query('days', new ParseIntPipe({ optional: true })) days?: number) {
    return this.portal.analytics(environment, days ?? 14);
  }

  @Get(':orgId/envs/:env/messages/:messageId')
  messageDetail(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('messageId') messageId: string) {
    return this.portal.messageDetail(environment, messageId);
  }

  @Get(':orgId/envs/:env/webhooks/deliveries')
  listDeliveries(
    @CurrentEnvironment() environment: EnvironmentWithOrg,
    @Query('status', new ParseEnumPipe(DeliveryStatus, { optional: true })) status?: DeliveryStatus,
    @Query('event') event?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.webhooks.list(environment, { status, event: event || undefined, cursor, limit });
  }

  @Get(':orgId/envs/:env/webhooks/deliveries/:deliveryId')
  delivery(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('deliveryId') deliveryId: string) {
    return this.webhooks.get(environment, deliveryId);
  }

  @Post(':orgId/envs/:env/webhooks/deliveries/:deliveryId/resend')
  @HttpCode(200)
  async resendDelivery(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('deliveryId') deliveryId: string) {
    return this.webhooks.toView(await this.webhooks.resend(environment, deliveryId));
  }

  @Get(':orgId/envs/:env/customers')
  listCustomers(
    @CurrentEnvironment() environment: EnvironmentWithOrg,
    @Query('search') search?: string,
    @Query('linked', new ParseBoolPipe({ optional: true })) linked?: boolean,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.customers.list(environment, { search: search || undefined, linked, cursor, limit });
  }

  @Get(':orgId/envs/:env/customers/:externalId')
  customerDetail(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('externalId') externalId: string) {
    return this.portal.customerDetail(environment, externalId);
  }

  // Connect link (with QR in the portal) for any customer, in either environment.
  @Post(':orgId/envs/:env/customers/:externalId/link')
  customerLink(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('externalId') externalId: string) {
    return this.customers.createLink(environment, externalId);
  }

  @Post(':orgId/envs/:env/customers/:externalId/messages')
  customerMessage(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('externalId') externalId: string, @Body() dto: CustomerMessageDto) {
    return this.messages.send(environment, { to: externalId, text: dto.text });
  }

  @Post(':orgId/envs/:env/customers/:externalId/unlink')
  @HttpCode(204)
  unlinkCustomer(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Param('externalId') externalId: string) {
    return this.portal.unlinkCustomer(environment, externalId, user);
  }

  // Sandbox playground: lets a signed-in developer try the flow without an API key.
  @Post(':orgId/envs/:env/playground/link')
  playgroundLink(@CurrentEnvironment() environment: EnvironmentWithOrg, @CurrentUser() user: User, @Body() dto: PlaygroundLinkDto) {
    this.assertSandbox(environment);
    return this.customers.createLink(environment, dto.externalId?.trim() || `dev_${user.id.slice(0, 8)}`);
  }

  @Post(':orgId/envs/:env/playground/send')
  playgroundSend(@CurrentEnvironment() environment: EnvironmentWithOrg, @Body() dto: PlaygroundSendDto) {
    this.assertSandbox(environment);
    return this.messages.send(environment, dto);
  }

  @Post(':orgId/envs/:env/playground/verify')
  playgroundVerify(@CurrentEnvironment() environment: EnvironmentWithOrg, @Body() dto: PlaygroundVerifyDto) {
    this.assertSandbox(environment);
    return this.verifications.create(environment, { externalId: dto.externalId?.trim() || undefined, phone: dto.phone?.trim() || undefined });
  }

  @Get(':orgId/envs/:env/verifications/:id')
  verification(@CurrentEnvironment() environment: EnvironmentWithOrg, @Param('id') id: string) {
    return this.verifications.get(environment, id);
  }

  private assertSandbox(environment: EnvironmentWithOrg) {
    if (environment.type !== 'SANDBOX') throw new BadRequestException('The playground is only available in the sandbox');
  }
}
