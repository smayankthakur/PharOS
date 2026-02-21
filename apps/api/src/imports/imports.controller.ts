import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { RequireFeature } from '../security/feature-flags.decorator';
import { FeatureFlagsGuard } from '../security/feature-flags.guard';
import {
  type ImportJobDetailResponse,
  type StartImportInput,
  ImportsService,
} from './imports.service';

@Controller('imports')
@UseGuards(AuthenticatedGuard, RolesGuard, FeatureFlagsGuard)
@RequireFeature('imports')
export class ImportsController {
  constructor(
    @Inject(ImportsService)
    private readonly importsService: ImportsService,
  ) {}

  @Post('start')
  @Roles('Owner', 'Ops')
  async start(
    @Req() req: Request,
    @Body() body: StartImportInput,
  ): Promise<{ import_job_id: string }> {
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.importsService.startImport(tenantId, user.userId, body);
  }

  @Get(':id')
  @Roles('Owner', 'Ops')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<ImportJobDetailResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.importsService.getImportJob(tenantId, id);
  }
}
