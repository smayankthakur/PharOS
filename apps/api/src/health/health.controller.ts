import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  getHealth(): { ok: true; service: 'pharos-api'; ts: string } {
    return {
      ok: true,
      service: 'pharos-api',
      ts: new Date().toISOString(),
    };
  }
}
