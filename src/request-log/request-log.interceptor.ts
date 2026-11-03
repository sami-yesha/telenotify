import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { parseClient } from './client';
import { RequestLogService } from './request-log.service';

type ApiRequest = Request & { apiKeyId?: string; environment?: { id: string } };

// Logs every authenticated /v1 call (after ApiKeyGuard), including validation and
// business errors, so developers can debug from the portal.
@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(private readonly log: RequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ApiRequest>();
    const response = http.getResponse<Response>();
    const started = Date.now();
    const write = (statusCode: number, error?: string) => {
      if (!request.apiKeyId || !request.environment) return;
      this.log.record({
        environmentId: request.environment.id,
        apiKeyId: request.apiKeyId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode,
        durationMs: Date.now() - started,
        error: error ?? null,
        ip: request.ip ?? null,
        ...parseClient(request.headers['user-agent']),
      });
    };

    return next.handle().pipe(
      tap(() => write(response.statusCode)),
      catchError((error: unknown) => {
        if (error instanceof HttpException) {
          const body = error.getResponse() as string | { message?: string | string[] };
          const message = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? error.message);
          write(error.getStatus(), message);
        } else {
          write(500, 'Internal server error');
        }
        return throwError(() => error);
      }),
    );
  }
}
