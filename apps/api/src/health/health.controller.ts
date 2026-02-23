import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import type { HealthResponse } from '@pharos/types';

@Controller()
export class HealthController {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(RedisService)
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getRootHealth(): { ok: true } {
    return { ok: true };
  }

  @Get('health')
  @Get('healthz')
  async getHealth(): Promise<HealthResponse & { ok: true; service: 'pharos-api'; ts: string }> {
    await Promise.all([
      this.databaseService.checkConnection(),
      this.redisService.checkConnection(),
    ]);

    const now = new Date();
    return {
      ok: true,
      service: 'pharos-api',
      ts: now.toISOString(),
      status: 'ok',
      db: this.databaseService.status,
      redis: this.redisService.status,
      timestamp: now,
    };
  }
}
