import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type CreateWarehouseInput,
  type WarehouseResponse,
  WarehouseService,
} from './warehouse.service';

@Controller('warehouses')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @Roles('Owner')
  async create(@Req() req: Request, @Body() body: CreateWarehouseInput): Promise<WarehouseResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.warehouseService.create(tenantId, user.userId, body);
  }

  @Get()
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request): Promise<{ items: WarehouseResponse[] }> {
    const tenantId = req.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.warehouseService.list(tenantId) };
  }
}
