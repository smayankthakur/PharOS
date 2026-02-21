import { Inject, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../logger/request-context.service';
import { AuthService } from './auth.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(RequestContextService)
    private readonly requestContextService: RequestContextService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authorizationHeader = req.header('authorization');

    if (!authorizationHeader) {
      next();
      return;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    const user = this.authService.verifyToken(token);
    req.user = user;
    if (user.tenantId) {
      req.tenantId = user.tenantId;
      this.requestContextService.setTenantId(user.tenantId);
    }

    next();
  }
}
