import {
  Controller,
  Get,
  Inject,
  Param,
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
  type ExplainMarginLossQuery,
  type ExplainMarginLossResponse,
  type ExplainResponse,
  ExplainabilityService,
} from './explainability.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ExplainabilityController {
  constructor(
    @Inject(ExplainabilityService)
    private readonly explainabilityService: ExplainabilityService,
  ) {}

  @Get('alerts/:id/explain')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async explainAlert(@Req() req: Request, @Param('id') id: string): Promise<ExplainResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.explainabilityService.explainAlert(tenantId, id);
  }

  @Get('analytics/explain/margin-loss')
  @Roles('Owner', 'Ops')
  async explainMarginLoss(
    @Req() req: Request,
    @Query() query: ExplainMarginLossQuery,
  ): Promise<ExplainMarginLossResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.explainabilityService.explainMarginLoss(tenantId, query);
  }
}

