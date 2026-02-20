import {
  Body,
  Controller,
  Get,
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
import { type CreateDealerInput, type DealerResponse, DealerService } from './dealer.service';

@Controller('dealers')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class DealerController {
  constructor(private readonly dealerService: DealerService) {}

  @Post()
  @Roles('Owner')
  async create(@Req() req: Request, @Body() body: CreateDealerInput): Promise<DealerResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.dealerService.create(tenantId, user.userId, body);
  }

  @Get()
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async list(@Req() req: Request): Promise<{ items: DealerResponse[] }> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return { items: await this.dealerService.list(tenantId) };
  }

  @Get(':id')
  @Roles('Owner', 'Sales', 'Ops', 'Viewer')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<DealerResponse> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.dealerService.getById(tenantId, id);
  }
}
