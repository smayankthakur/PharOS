import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type AlertDetail,
  type AlertListItem,
  type ListAlertsQuery,
  type RuleRunResponse,
  RulesEngineService,
} from './rules-engine.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
export class RulesEngineController {
  constructor(
    @Inject(RulesEngineService)
    private readonly rulesEngineService: RulesEngineService,
  ) {}

  @Post('rules/run')
  @Roles('Owner', 'Ops')
  async run(@Req() req: Request): Promise<RuleRunResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.rulesEngineService.run(tenantId, user.userId);
  }

  @Get('alerts')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request, @Query() query: ListAlertsQuery): Promise<{ items: AlertListItem[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.rulesEngineService.listAlerts(tenantId, query) };
  }

  @Get('alerts/:id')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async byId(@Req() req: Request, @Param('id') id: string): Promise<AlertDetail> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.rulesEngineService.getAlertById(tenantId, id);
  }
}
