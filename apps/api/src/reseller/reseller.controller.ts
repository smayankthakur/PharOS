import {
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
import {
  type AddTenantDomainInput,
  type CreateResellerInput,
  type CreateResellerUserInput,
  type PatchTenantDomainInput,
  type ProvisionTenantInput,
  ResellerService,
  type UpdateTenantFlagsInput,
} from './reseller.service';

@Controller()
@UseGuards(AuthenticatedGuard)
export class ResellerController {
  constructor(
    @Inject(ResellerService)
    private readonly resellerService: ResellerService,
  ) {}

  @Post('resellers')
  async createReseller(
    @Req() req: Request,
    @Body() body: CreateResellerInput,
  ): Promise<{ reseller_id: string }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    return this.resellerService.createReseller(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      body,
    );
  }

  @Get('resellers')
  async listResellers(@Req() req: Request): Promise<Array<Record<string, unknown>>> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const rows = await this.resellerService.listResellers(user.email);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  @Post('resellers/:id/users')
  async addResellerUser(
    @Req() req: Request,
    @Param('id') resellerId: string,
    @Body() body: CreateResellerUserInput,
  ): Promise<{ user_id: string }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.resellerService.addResellerUser(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      resellerId,
      body,
    );
  }

  @Post('reseller/tenants')
  async provisionTenant(
    @Req() req: Request,
    @Body() body: ProvisionTenantInput,
  ): Promise<{ tenant_id: string; tenant_slug: string; owner_email: string }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    return this.resellerService.provisionTenant(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      body,
    );
  }

  @Get('reseller/tenants')
  async listProvisionedTenants(@Req() req: Request): Promise<{ items: Array<Record<string, unknown>> }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const rows = await this.resellerService.listProvisionedTenants({
      userId: user.userId,
      email: user.email,
    });
    return {
      items: rows.map((row) => ({
        tenantId: row.tenant_id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        plan: row.plan,
        createdAt: row.created_at,
      })),
    };
  }

  @Patch('tenants/:tenantId/flags')
  async updateTenantFlags(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateTenantFlagsInput,
  ): Promise<{ tenant_id: string; flags_json: Record<string, boolean> }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    return this.resellerService.updateTenantFlags(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      tenantId,
      body,
    );
  }

  @Get('tenants/:tenantId/flags')
  async getTenantFlags(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
  ): Promise<{ tenant_id: string; flags_json: Record<string, boolean> }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    return this.resellerService.getTenantFlags(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      tenantId,
    );
  }

  @Post('tenants/:tenantId/domains')
  async addTenantDomain(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
    @Body() body: AddTenantDomainInput,
  ): Promise<Record<string, unknown>> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const row = await this.resellerService.addTenantDomain(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      tenantId,
      body,
    );
    return {
      id: row.id,
      tenantId: row.tenant_id,
      domain: row.domain,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  @Patch('tenants/:tenantId/domains/:domainId')
  async patchTenantDomain(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: PatchTenantDomainInput,
  ): Promise<Record<string, unknown>> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const row = await this.resellerService.patchTenantDomain(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      tenantId,
      domainId,
      body,
    );
    return {
      id: row.id,
      tenantId: row.tenant_id,
      domain: row.domain,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  @Get('tenants/:tenantId/domains')
  async listTenantDomains(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }
    const rows = await this.resellerService.listTenantDomains(
      { userId: user.userId, email: user.email, tenantId: user.tenantId },
      tenantId,
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        domain: row.domain,
        status: row.status,
        createdAt: row.created_at,
      })),
    };
  }
}
