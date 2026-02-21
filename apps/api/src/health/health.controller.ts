import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import type { HealthResponse } from '@pharos/types';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(RedisService)
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    await Promise.all([
      this.databaseService.checkConnection(),
      this.redisService.checkConnection(),
    ]);

    return {
      status: 'ok',
      db: this.databaseService.status,
      redis: this.redisService.status,
      timestamp: new Date(),
    };
  }
}
