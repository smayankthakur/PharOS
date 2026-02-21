import { Controller, Get, Inject, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { AuditService, type AuditLogResponse } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  @Get('current')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner')
  async current(@Req() req: Request): Promise<{ items: AuditLogResponse[] }> {
    const tenantId = req.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    const items = await this.auditService.listCurrentTenant(tenantId, 100);
    return { items };
  }
}
