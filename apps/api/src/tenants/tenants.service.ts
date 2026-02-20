import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
};

type BrandingRow = {
  tenant_id: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  email_from: string | null;
  domain_custom: string | null;
  created_at: Date;
  updated_at: Date;
};

type TenantSettingsRow = {
  tenant_id: string;
  demo_mode: boolean;
  created_at: Date;
  updated_at: Date;
};

export type TenantBrandingResponse = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
  };
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    emailFrom: string | null;
    domainCustom: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
};

export type TenantSettingsResponse = {
  tenantId: string;
  demo_mode: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantDb: TenantDb,
    private readonly auditService: AuditService,
  ) {}

  async getCurrent(tenantId: string, actorUserId: string): Promise<TenantBrandingResponse> {
    const tenant = await this.getTenantById(tenantId);
    const branding = await this.getBranding(tenantId);

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'tenant.view',
      entityType: 'tenant',
      entityId: tenant.id,
      payload: { slug: tenant.slug },
    });

    return this.toResponse(tenant, branding);
  }

  async getBySlug(slug: string): Promise<TenantBrandingResponse> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) {
      throw new BadRequestException('Invalid slug');
    }

    const tenantResult = await this.databaseService.query<TenantRow>(
      `
      SELECT id, name, slug, status, created_at
      FROM tenants
      WHERE slug = $1
      LIMIT 1
      `,
      [normalizedSlug],
    );

    const tenant = tenantResult.rows[0];
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const branding = await this.getBranding(tenant.id);

    await this.auditService.record({
      tenantId: tenant.id,
      action: 'tenant.lookup',
      entityType: 'tenant',
      entityId: tenant.id,
      payload: { slug: tenant.slug },
    });

    return this.toResponse(tenant, branding);
  }

  async getCurrentSettings(tenantId: string, actorUserId: string): Promise<TenantSettingsResponse> {
    const settings = await this.ensureAndGetSettingsRow(tenantId);

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'tenant.settings.view',
      entityType: 'tenant_settings',
      entityId: tenantId,
      payload: { demo_mode: settings.demo_mode },
    });

    return this.toSettingsResponse(settings);
  }

  async updateCurrentSettings(
    tenantId: string,
    actorUserId: string,
    demoMode: boolean,
  ): Promise<TenantSettingsResponse> {
    const row = await this.tenantDb.update<TenantSettingsRow>(
      tenantId,
      'tenant_settings',
      { demo_mode: demoMode, updated_at: new Date() },
      {},
      ['tenant_id', 'demo_mode', 'created_at', 'updated_at'],
    );

    const settings =
      row ??
      (await this.tenantDb.insert<TenantSettingsRow>(
        tenantId,
        'tenant_settings',
        { demo_mode: demoMode },
        ['tenant_id', 'demo_mode', 'created_at', 'updated_at'],
      ));

    if (!settings) {
      throw new NotFoundException('Tenant settings not found');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'tenant.settings.update',
      entityType: 'tenant_settings',
      entityId: tenantId,
      payload: { demo_mode: demoMode },
    });

    return this.toSettingsResponse(settings);
  }

  private async ensureAndGetSettingsRow(tenantId: string): Promise<TenantSettingsRow> {
    const existing = await this.tenantDb.selectOne<TenantSettingsRow>(
      tenantId,
      'tenant_settings',
      {},
      ['tenant_id', 'demo_mode', 'created_at', 'updated_at'],
    );

    if (existing) {
      return existing;
    }

    const inserted = await this.tenantDb.insert<TenantSettingsRow>(
      tenantId,
      'tenant_settings',
      { demo_mode: false },
      ['tenant_id', 'demo_mode', 'created_at', 'updated_at'],
    );

    if (!inserted) {
      throw new NotFoundException('Tenant settings not found');
    }

    return inserted;
  }

  private async getTenantById(tenantId: string): Promise<TenantRow> {
    const result = await this.databaseService.query<TenantRow>(
      `
      SELECT id, name, slug, status, created_at
      FROM tenants
      WHERE id = $1
      LIMIT 1
      `,
      [tenantId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Tenant not found');
    }

    return row;
  }

  private async getBranding(tenantId: string): Promise<BrandingRow | null> {
    return this.tenantDb.selectOne<BrandingRow>(
      tenantId,
      'tenant_branding',
      {},
      [
        'tenant_id',
        'logo_url',
        'primary_color',
        'secondary_color',
        'email_from',
        'domain_custom',
        'created_at',
        'updated_at',
      ],
    );
  }

  private toResponse(tenant: TenantRow, branding: BrandingRow | null): TenantBrandingResponse {
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.created_at,
      },
      branding: {
        logoUrl: branding?.logo_url ?? null,
        primaryColor: branding?.primary_color ?? null,
        secondaryColor: branding?.secondary_color ?? null,
        emailFrom: branding?.email_from ?? null,
        domainCustom: branding?.domain_custom ?? null,
        createdAt: branding?.created_at ?? null,
        updatedAt: branding?.updated_at ?? null,
      },
    };
  }

  private toSettingsResponse(row: TenantSettingsRow): TenantSettingsResponse {
    return {
      tenantId: row.tenant_id,
      demo_mode: row.demo_mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
