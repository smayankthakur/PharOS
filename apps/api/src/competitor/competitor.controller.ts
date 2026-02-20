import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  type CompetitorItemResponse,
  type CompetitorResponse,
  type CreateCompetitorInput,
  type CreateCompetitorItemInput,
  type CreateSnapshotInput,
  type ListCompetitorItemsQuery,
  type ListSnapshotsQuery,
  type PatchCompetitorItemInput,
  type SnapshotResponse,
  CompetitorService,
} from './competitor.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
export class CompetitorController {
  constructor(private readonly competitorService: CompetitorService) {}

  @Post('competitors')
  @Roles('Owner', 'Ops')
  async createCompetitor(
    @Req() req: Request,
    @Body() body: CreateCompetitorInput,
  ): Promise<CompetitorResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.competitorService.createCompetitor(tenantId, user.userId, body);
  }

  @Get('competitors')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async listCompetitors(@Req() req: Request): Promise<{ items: CompetitorResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.competitorService.listCompetitors(tenantId) };
  }

  @Post('competitor-items')
  @Roles('Owner', 'Ops')
  async createCompetitorItem(
    @Req() req: Request,
    @Body() body: CreateCompetitorItemInput,
  ): Promise<CompetitorItemResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.competitorService.createCompetitorItem(tenantId, user.userId, body);
  }

  @Get('competitor-items')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async listCompetitorItems(
    @Req() req: Request,
    @Query() query: ListCompetitorItemsQuery,
  ): Promise<{ items: CompetitorItemResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.competitorService.listCompetitorItems(tenantId, query) };
  }

  @Patch('competitor-items/:id')
  @Roles('Owner', 'Ops')
  async patchCompetitorItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchCompetitorItemInput,
  ): Promise<CompetitorItemResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.competitorService.patchCompetitorItem(tenantId, id, body);
  }

  @Post('competitor-snapshots')
  @Roles('Owner', 'Ops')
  async createSnapshot(@Req() req: Request, @Body() body: CreateSnapshotInput): Promise<SnapshotResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.competitorService.createSnapshot(tenantId, user.userId, body);
  }

  @Get('competitor-snapshots')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async listSnapshots(
    @Req() req: Request,
    @Query() query: ListSnapshotsQuery,
  ): Promise<{ items: SnapshotResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.competitorService.listSnapshots(tenantId, query) };
  }
}
