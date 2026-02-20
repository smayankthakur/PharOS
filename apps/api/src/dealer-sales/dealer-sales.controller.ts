import {
  Body,
  Controller,
  Get,
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
  type CreateDealerSaleInput,
  type DealerSaleResponse,
  type ListDealerSalesQuery,
  DealerSalesService,
} from './dealer-sales.service';

@Controller('dealer-sales')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class DealerSalesController {
  constructor(private readonly dealerSalesService: DealerSalesService) {}

  @Post()
  @Roles('Owner', 'Sales')
  async create(@Req() req: Request, @Body() body: CreateDealerSaleInput): Promise<DealerSaleResponse> {
    const user = req.user;
    const tenantId = req.tenantId;
    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.dealerSalesService.create(tenantId, user.userId, body);
  }

  @Get()
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request, @Query() query: ListDealerSalesQuery): Promise<{ items: DealerSaleResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.dealerSalesService.list(tenantId, query) };
  }

  @Get(':id')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<DealerSaleResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.dealerSalesService.getById(tenantId, id);
  }
}
