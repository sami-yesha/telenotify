import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'org.created'
  | 'org.renamed'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'bot.connected'
  | 'bot.disconnected'
  | 'webhook.updated'
  | 'signing_secret.rotated'
  | 'member.invited'
  | 'invitation.revoked'
  | 'member.joined'
  | 'member.removed'
  | 'member.left'
  | 'plan.changed'
  | 'customer.unlinked'
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'sms_fallback.updated'
  | 'org.suspended'
  | 'org.unsuspended'
  | 'live.approved'
  | 'live.review_requested'
  | 'verify_widget.updated'
  | 'business.verification_requested'
  | 'business.verified'
  | 'business.rejected'
  | 'business.revoked'
  | 'business.badge_on_bot';

export type Actor = Pick<User, 'id' | 'email'> | null;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Best effort: an audit failure must never undo the action it describes.
  async record(orgId: string, actor: Actor, action: AuditAction, target?: string | null, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          orgId,
          actorUserId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
          action,
          target: target ?? null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Could not record ${action} for org ${orgId}: ${(error as Error).message}`);
    }
  }

  async list(orgId: string, options: { cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const rows = await this.prisma.auditEvent.findMany({
      where: { orgId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return {
      data: page.map((e) => ({ id: e.id, action: e.action, actorEmail: e.actorEmail, target: e.target, metadata: e.metadata, createdAt: e.createdAt })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
