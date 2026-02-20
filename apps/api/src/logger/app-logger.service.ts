import { Injectable } from '@nestjs/common';
import { RequestContextService } from './request-context.service';

type LogPayload = {
  level: 'info' | 'warn' | 'error';
  message: string;
  request_id: string | null;
  tenant_id: string | null;
  timestamp: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class AppLoggerService {
  constructor(private readonly requestContextService: RequestContextService) {}

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  private write(
    level: LogPayload['level'],
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const context = this.requestContextService.get();

    const payload: LogPayload = {
      level,
      message,
      request_id: context?.requestId ?? null,
      tenant_id: context?.tenantId ?? null,
      timestamp: new Date().toISOString(),
      ...(meta ? { meta } : {}),
    };

    const encoded = JSON.stringify(payload);
    if (level === 'error') {
      console.error(encoded);
      return;
    }

    if (level === 'warn') {
      console.warn(encoded);
      return;
    }

    console.log(encoded);
  }
}
