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
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { loadConfig } from '@pharos/config';
import { AuthenticatedGuard } from '../rbac/authenticated.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  type CreateTenantInput,
  type TenantBrandingOnlyResponse,
  TenantsService,
  type TenantBrandingResponse,
  type TenantSettingsResponse,
  type TenantListItem,
  type UpdateBrandingInput,
} from './tenants.service';

@Controller('tenants')
export class TenantsController {
  private readonly systemOwnerKey: string;

  constructor(
    @Inject(TenantsService)
    private readonly tenantsService: TenantsService,
  ) {
    this.systemOwnerKey = loadConfig().systemOwnerKey;
  }

  @Get()
  async listTenants(@Headers('x-system-owner-key') systemOwnerKey?: string): Promise<TenantListItem[]> {
    this.assertSystemOwner(systemOwnerKey);
    return this.tenantsService.listTenants();
  }

  @Post()
  async createTenant(
    @Headers('x-system-owner-key') systemOwnerKey: string | undefined,
    @Body() body: CreateTenantInput,
  ): Promise<TenantBrandingResponse> {
    this.assertSystemOwner(systemOwnerKey);
    return this.tenantsService.createTenant(body);
  }

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

  @Get('current/branding')
  @UseGuards(AuthenticatedGuard)
  async currentBranding(@Req() req: Request): Promise<TenantBrandingOnlyResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tenantsService.getCurrentBranding(tenantId, user.userId);
  }

  @Patch('current/branding')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles('Owner')
  async updateCurrentBranding(
    @Req() req: Request,
    @Body() body: UpdateBrandingInput,
  ): Promise<TenantBrandingOnlyResponse> {
    const user = req.user;
    const tenantId = req.tenantId;

    if (!user || !tenantId) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.tenantsService.updateCurrentBranding(tenantId, user.userId, body);
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

  private assertSystemOwner(systemOwnerKey: string | undefined): void {
    if (!this.systemOwnerKey || systemOwnerKey !== this.systemOwnerKey) {
      throw new UnauthorizedException('Invalid system owner key');
    }
  }
}
