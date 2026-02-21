import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type CreateSkuInput,
  type SkuDetailResponse,
  type SkuListItem,
  type UpdateSkuPricingInput,
  SkuService,
} from './sku.service';

@Controller('skus')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class SkuController {
  constructor(
    @Inject(SkuService)
    private readonly skuService: SkuService,
  ) {}

  @Post()
  @Roles('Owner')
  async create(@Req() req: Request, @Body() body: CreateSkuInput): Promise<SkuDetailResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.skuService.createSku(tenantId, user.userId, body);
  }

  @Get()
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request): Promise<{ items: SkuListItem[] }> {
    const tenantId = req.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.skuService.listSkus(tenantId) };
  }

  @Get(':id')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<SkuDetailResponse> {
    const tenantId = req.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.skuService.getSkuById(tenantId, id);
  }

  @Patch(':id/pricing')
  @Roles('Owner', 'Ops')
  async updatePricing(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateSkuPricingInput,
  ): Promise<SkuDetailResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    if (!id) {
      throw new BadRequestException('sku id is required');
    }

    return this.skuService.updatePricing(tenantId, user.userId, id, body);
  }
}
