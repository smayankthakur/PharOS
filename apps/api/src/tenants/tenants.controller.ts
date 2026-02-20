import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  TenantsService,
  type TenantBrandingResponse,
  type TenantSettingsResponse,
} from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @UseGuards(AuthenticatedGuard)
  async current(@Req() req: Request): Promise<TenantBrandingResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tenantsService.getCurrent(tenantId, user.userId);
  }

  @Get('by-slug/:slug')
  async bySlug(@Param('slug') slug: string): Promise<TenantBrandingResponse> {
    return this.tenantsService.getBySlug(slug);
  }

  @Get('current/settings')
  @UseGuards(AuthenticatedGuard)
  async currentSettings(@Req() req: Request): Promise<TenantSettingsResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tenantsService.getCurrentSettings(tenantId, user.userId);
  }

  @Patch('current/settings')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner')
  async updateCurrentSettings(
    @Req() req: Request,
    @Body() body: { demo_mode?: boolean },
  ): Promise<TenantSettingsResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    if (typeof body.demo_mode !== 'boolean') {
      throw new BadRequestException('demo_mode boolean is required');
    }

    return this.tenantsService.updateCurrentSettings(tenantId, user.userId, body.demo_mode);
  }
}
