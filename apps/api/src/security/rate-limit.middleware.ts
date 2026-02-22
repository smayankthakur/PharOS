import { HttpException, HttpStatus, Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loadConfig } from '@pharos/config';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';

type Bucket = {
  count: number;
  resetAt: number;
};

interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<Bucket>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async increment(key: string, windowMs: number): Promise<Bucket> {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }

    current.count += 1;
    this.buckets.set(key, current);
    return current;
  }
}

class RedisRateLimitStore implements RateLimitStore {
  private readonly fallback = new MemoryRateLimitStore();

  constructor(private readonly redisService: RedisService) {}

  async increment(key: string, windowMs: number): Promise<Bucket> {
    const now = Date.now();
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const lua = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then
        redis.call("EXPIRE", KEYS[1], ARGV[1])
      end
      local ttl = redis.call("TTL", KEYS[1])
      return {current, ttl}
    `;
    const result = await this.redisService.evalLua<[number, number]>(lua, [key], [String(ttlSeconds)]);
    if (!result) {
      return this.fallback.increment(key, windowMs);
    }
    const count = Number(result?.[0] ?? 0);
    const ttl = Number(result?.[1] ?? ttlSeconds);
    const resetAt = now + Math.max(1, ttl) * 1000;
    return { count, resetAt };
  }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly store: RateLimitStore;
  private readonly windowMs: number;
  private readonly max: number;
  private readonly loginMax: number;
  private readonly systemOwnerMax: number;

  constructor(
    @Inject(RedisService)
    redisService: RedisService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {
    const config = loadConfig();
    this.store = config.redisUrl ? new RedisRateLimitStore(redisService) : new MemoryRateLimitStore();
    this.windowMs = config.rateLimitWindowMs;
    this.max = config.rateLimitMax;
    this.loginMax = config.rateLimitLoginMax;
    this.systemOwnerMax = config.rateLimitSystemMax;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const routeKey = `${req.method}:${req.path}`;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}|${routeKey}`;
    const limit = this.getLimitForRequest(req);
    const current = await this.store.increment(key, this.windowMs);

    if (current.count > limit) {
      const now = Date.now();
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));

      if (req.tenantId) {
        await this.auditService.record({
          tenantId: req.tenantId,
          actorUserId: req.user?.userId ?? null,
          action: 'security.ratelimit',
          entityType: 'security',
          payload: { ip, route: routeKey, limit, retry_after_sec: retryAfterSeconds },
        });
      }

      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    next();
  }

  private getLimitForRequest(req: Request): number {
    if (req.method === 'POST' && req.path === '/auth/login') {
      return this.loginMax;
    }

    if ((req.method === 'POST' || req.method === 'GET') && req.path === '/tenants') {
      return this.systemOwnerMax;
    }

    return this.max;
  }
}
