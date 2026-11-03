import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Environment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS = 30;

export interface RequestRecord {
  environmentId: string;
  apiKeyId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  error?: string | null;
  ip?: string | null;
  client?: string | null;
  clientDetail?: string | null;
}

@Injectable()
export class RequestLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestLogService.name);
  private pruneTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.prune();
    this.pruneTimer = setInterval(() => void this.prune(), 6 * 3_600_000);
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  // Fire-and-forget: logging must never slow down or fail an API call.
  record(entry: RequestRecord): void {
    this.prisma.apiRequestLog
      .create({ data: { ...entry, path: entry.path.slice(0, 300), error: entry.error?.slice(0, 500) ?? null } })
      .catch((error) => this.logger.warn(`Could not log request: ${(error as Error).message}`));
  }

  async list(environment: Environment, options: { apiKeyId?: string; errorsOnly?: boolean; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const rows = await this.prisma.apiRequestLog.findMany({
      where: {
        environmentId: environment.id,
        ...(options.apiKeyId ? { apiKeyId: options.apiKeyId } : {}),
        ...(options.errorsOnly ? { statusCode: { gte: 400 } } : {}),
      },
      include: { apiKey: { select: { name: true, prefix: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return {
      data: page.map((r) => ({
        id: r.id,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
        error: r.error,
        key: { id: r.apiKeyId, name: r.apiKey.name, prefix: r.apiKey.prefix },
        createdAt: r.createdAt,
      })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  private async prune() {
    try {
      await this.prisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
    } catch (error) {
      this.logger.warn(`Could not prune request log: ${(error as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [RequestLogService],
  exports: [RequestLogService],
})
export class RequestLogModule {}
