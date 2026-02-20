import { Controller, Get, Inject, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type DashboardSummaryQuery,
  type DashboardSummaryResponse,
  DashboardService,
} from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('summary')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async summary(@Req() req: Request, @Query() query: DashboardSummaryQuery): Promise<DashboardSummaryResponse> {
    const tenantId = req.tenantId;
    const user = req.user;
    const roles = req.userRoles ?? [];

    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.dashboardService.summary(tenantId, user.userId, roles, query);
  }
}

