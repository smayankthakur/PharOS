import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@pharos/types';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      ok: true,
      service: 'pharos-api',
    };
  }
}
