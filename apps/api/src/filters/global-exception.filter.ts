import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLoggerService } from '../logger/app-logger.service';
import { RequestContextService } from '../logger/request-context.service';

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(AppLoggerService)
    private readonly logger?: AppLoggerService,
    @Inject(RequestContextService)
    private readonly requestContextService?: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    try {
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
      let requestId: string | null = request?.requestId ?? null;
      if (!requestId && this.requestContextService) {
        const maybeGetter = (this.requestContextService as { get?: () => { requestId?: string } | null })
          .get;
        if (typeof maybeGetter === 'function') {
          const context = maybeGetter.call(this.requestContextService);
          requestId = context?.requestId ?? null;
        }
      }

      if (this.logger && typeof this.logger.error === 'function') {
        const errorMeta =
          exception instanceof Error
            ? {
                error_name: exception.name,
                error_message: exception.message,
                error_stack: exception.stack ?? null,
              }
            : {
                error_name: 'unknown',
                error_message: String(exception),
                error_stack: null,
              };

        this.logger.error('request.failed', {
          status,
          path: request?.url ?? '',
          method: request?.method ?? '',
          code,
          message,
          ...errorMeta,
        });
      } else {
        console.error('request.failed', { status, code, message });
        console.error('request.failed.exception', exception);
      }

      if (response && typeof response.status === 'function') {
        response.status(status).json({
          error: {
            code,
            message,
          },
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      // Never let the exception filter throw recursively.
      console.error('global_exception_filter_failed', error);
    }
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
