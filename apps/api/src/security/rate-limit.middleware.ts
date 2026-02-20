import { Injectable, NestMiddleware, TooManyRequestsException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loadConfig } from '@pharos/config';
import { AuditService } from '../audit/audit.service';

type Bucket = {
  count: number;
  resetAt: number;
};

interface RateLimitStore {
  get(key: string): Bucket | undefined;
  set(key: string, value: Bucket): void;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  get(key: string): Bucket | undefined {
    return this.buckets.get(key);
  }

  set(key: string, value: Bucket): void {
    this.buckets.set(key, value);
  }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly store: RateLimitStore;
  private readonly windowMs: number;
  private readonly max: number;

  constructor(private readonly auditService: AuditService) {
    const config = loadConfig();
    this.store = new MemoryRateLimitStore();
    this.windowMs = config.rateLimitWindowMs;
    this.max = config.rateLimitMax;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const routeKey = `${req.method}:${req.path}`;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}|${routeKey}`;

    const now = Date.now();
    const current = this.store.get(key);

    if (!current || current.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      next();
      return;
    }

    current.count += 1;

    if (current.count > this.max) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));

      if (req.tenantId) {
        await this.auditService.record({
          tenantId: req.tenantId,
          actorUserId: req.user?.userId ?? null,
          action: 'security.ratelimit',
          entityType: 'security',
          payload: { ip, route: routeKey, retry_after_sec: retryAfterSeconds },
        });
      }

      throw new TooManyRequestsException('Rate limit exceeded');
    }

    next();
  }
}
