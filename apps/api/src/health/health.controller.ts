import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import type { HealthResponse } from '@pharos/types';

@Controller('health')
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
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
