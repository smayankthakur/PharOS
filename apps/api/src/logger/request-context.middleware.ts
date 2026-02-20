import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(RequestContextService)
    private readonly requestContextService: RequestContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerValue = req.header('x-request-id');
    const requestId = headerValue && headerValue.trim() ? headerValue : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    this.requestContextService.run({ requestId, tenantId: null }, () => {
      next();
    });
  }
}
