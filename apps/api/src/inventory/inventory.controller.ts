import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
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
  type CreateInventoryMovementInput,
  type InventoryBalanceResponse,
  type InventoryMovementResponse,
  InventoryService,
} from './inventory.service';

@Controller('inventory')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class InventoryController {
  constructor(
    @Inject(InventoryService)
    private readonly inventoryService: InventoryService,
  ) {}

  @Get('balances')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async balances(
    @Req() req: Request,
    @Query('warehouse_id') warehouseId?: string,
  ): Promise<{ items: InventoryBalanceResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    if (warehouseId && !this.isUuid(warehouseId)) {
      throw new BadRequestException('warehouse_id must be a valid uuid');
    }

    return {
      items: await this.inventoryService.listBalances(tenantId, warehouseId),
    };
  }

  @Post('movements')
  @Roles('Owner', 'Ops')
  async createMovement(
    @Req() req: Request,
    @Body() body: CreateInventoryMovementInput,
  ): Promise<InventoryMovementResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.inventoryService.createMovement(tenantId, user.userId, body);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
