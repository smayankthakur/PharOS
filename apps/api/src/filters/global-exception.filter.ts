import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';
import { RequestContextService } from '../logger/request-context.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly requestContextService: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.getHttpMessage(exception)
        : 'Internal server error';

    const code = this.resolveCode(status);
    const requestId = request.requestId ?? this.requestContextService.get()?.requestId ?? null;

    this.logger.error('request.failed', {
      status,
      path: request.url,
      method: request.method,
      code,
      message,
    });

    response.status(status).json({
      error: {
        code,
        message,
      },
      request_id: requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private getHttpMessage(exception: HttpException): string {
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const obj = payload as { message?: string | string[] };
      if (Array.isArray(obj.message)) {
        return obj.message.join(', ');
      }

      if (typeof obj.message === 'string') {
        return obj.message;
      }
    }

    return exception.message;
  }

  private resolveCode(status: number): string {
    if (status >= 500) {
      return 'internal_error';
    }

    if (status === 401) {
      return 'unauthorized';
    }

    if (status === 403) {
      return 'forbidden';
    }

    if (status === 404) {
      return 'not_found';
    }

    if (status === 400) {
      return 'bad_request';
    }

    return 'request_error';
  }
}
