import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import { getDefaultFeatureFlags } from '../security/feature-flags.guard';

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

type RoleRow = {
  id: string;
  name: string;
};

const createTenantSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/),
  owner_name: z.string().trim().min(1),
  owner_email: z.string().trim().email(),
  owner_password: z.string().min(8),
  branding: z
    .object({
      logo_url: z.string().trim().url().nullable().optional(),
      primary_color: z.string().trim().min(1).nullable().optional(),
      secondary_color: z.string().trim().min(1).nullable().optional(),
      email_from: z.string().trim().email().nullable().optional(),
      domain_custom: z.string().trim().min(1).nullable().optional(),
    })
    .optional(),
});

const updateBrandingSchema = z.object({
  logo_url: z.string().trim().url().nullable().optional(),
  primary_color: z.string().trim().min(1).nullable().optional(),
  secondary_color: z.string().trim().min(1).nullable().optional(),
  email_from: z.string().trim().email().nullable().optional(),
  domain_custom: z.string().trim().min(1).nullable().optional(),
});

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

export type CreateTenantInput = z.input<typeof createTenantSchema>;
export type UpdateBrandingInput = z.input<typeof updateBrandingSchema>;

export type TenantListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
};

export type TenantBrandingOnlyResponse = {
  tenantId: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  emailFrom: string | null;
  domainCustom: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
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

  async listTenants(): Promise<TenantListItem[]> {
    const result = await this.databaseService.query<TenantRow>(
      `
      SELECT id, name, slug, status, created_at
      FROM tenants
      ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async createTenant(input: CreateTenantInput): Promise<TenantBrandingResponse> {
    const parsed = createTenantSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const payload = parsed.data;
    const slug = payload.slug.toLowerCase();
    const ownerEmail = payload.owner_email.toLowerCase();
    const ownerPasswordHash = await bcrypt.hash(payload.owner_password, 10);

    const tenantId = await this.databaseService.withTransaction(async (client) => {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
        [slug],
      );

      if (existing.rows[0]) {
        throw new BadRequestException('Tenant slug already exists');
      }

      const tenantResult = await client.query<{ id: string }>(
        `
        INSERT INTO tenants (name, slug, status)
        VALUES ($1, $2, 'active')
        RETURNING id
        `,
        [payload.name, slug],
      );

      const createdTenantId = tenantResult.rows[0]?.id;
      if (!createdTenantId) {
        throw new BadRequestException('Failed to create tenant');
      }

      await client.query(
        `
        INSERT INTO tenant_branding (
          tenant_id,
          logo_url,
          primary_color,
          secondary_color,
          email_from,
          domain_custom
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id) DO UPDATE SET
          logo_url = EXCLUDED.logo_url,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          email_from = EXCLUDED.email_from,
          domain_custom = EXCLUDED.domain_custom,
          updated_at = now()
        `,
        [
          createdTenantId,
          payload.branding?.logo_url ?? null,
          payload.branding?.primary_color ?? null,
          payload.branding?.secondary_color ?? null,
          payload.branding?.email_from ?? null,
          payload.branding?.domain_custom ?? null,
        ],
      );

      await client.query(
        `
        INSERT INTO tenant_settings (tenant_id, demo_mode)
        VALUES ($1, false)
        ON CONFLICT (tenant_id) DO NOTHING
        `,
        [createdTenantId],
      );

      await client.query(
        `
        INSERT INTO tenant_feature_flags (tenant_id, flags_json, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          flags_json = EXCLUDED.flags_json,
          updated_at = now()
        `,
        [createdTenantId, JSON.stringify(getDefaultFeatureFlags())],
      );

      const roles = ['Owner', 'Sales', 'Ops', 'Viewer'];
      for (const roleName of roles) {
        await client.query(
          `
          INSERT INTO roles (tenant_id, name)
          VALUES ($1, $2)
          ON CONFLICT (tenant_id, name) DO NOTHING
          `,
          [createdTenantId, roleName],
        );
      }

      const userResult = await client.query<{ id: string }>(
        `
        INSERT INTO users (tenant_id, name, email, password_hash, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING id
        `,
        [createdTenantId, payload.owner_name, ownerEmail, ownerPasswordHash],
      );

      const ownerUserId = userResult.rows[0]?.id;
      if (!ownerUserId) {
        throw new BadRequestException('Failed to create tenant owner');
      }

      const ownerRole = await client.query<RoleRow>(
        `
        SELECT id, name
        FROM roles
        WHERE tenant_id = $1 AND name = 'Owner'
        LIMIT 1
        `,
        [createdTenantId],
      );

      const ownerRoleId = ownerRole.rows[0]?.id;
      if (!ownerRoleId) {
        throw new BadRequestException('Owner role not found');
      }

      await client.query(
        `
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        [ownerUserId, ownerRoleId],
      );

      return createdTenantId;
    });

    await this.auditService.record({
      tenantId,
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: tenantId,
      payload: { slug },
    });

    return this.getBySlug(slug);
  }

  async getCurrentBranding(
    tenantId: string,
    actorUserId: string,
  ): Promise<TenantBrandingOnlyResponse> {
    const branding = await this.getBranding(tenantId);

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'tenant.branding.view',
      entityType: 'tenant_branding',
      entityId: tenantId,
      payload: { has_logo: Boolean(branding?.logo_url) },
    });

    return this.toBrandingResponse(tenantId, branding);
  }

  async updateCurrentBranding(
    tenantId: string,
    actorUserId: string,
    input: UpdateBrandingInput,
  ): Promise<TenantBrandingOnlyResponse> {
    const parsed = updateBrandingSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = await this.tenantDb.update<BrandingRow>(
      tenantId,
      'tenant_branding',
      {
        logo_url: parsed.data.logo_url ?? null,
        primary_color: parsed.data.primary_color ?? null,
        secondary_color: parsed.data.secondary_color ?? null,
        email_from: parsed.data.email_from ?? null,
        domain_custom: parsed.data.domain_custom ?? null,
        updated_at: new Date(),
      },
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

    const branding =
      row ??
      (await this.tenantDb.insert<BrandingRow>(
        tenantId,
        'tenant_branding',
        {
          logo_url: parsed.data.logo_url ?? null,
          primary_color: parsed.data.primary_color ?? null,
          secondary_color: parsed.data.secondary_color ?? null,
          email_from: parsed.data.email_from ?? null,
          domain_custom: parsed.data.domain_custom ?? null,
        },
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
      ));

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'tenant.branding.update',
      entityType: 'tenant_branding',
      entityId: tenantId,
      payload: {
        logo_url: parsed.data.logo_url ?? null,
        primary_color: parsed.data.primary_color ?? null,
        secondary_color: parsed.data.secondary_color ?? null,
      },
    });

    return this.toBrandingResponse(tenantId, branding);
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

  private toBrandingResponse(
    tenantId: string,
    row: BrandingRow | null,
  ): TenantBrandingOnlyResponse {
    return {
      tenantId,
      logoUrl: row?.logo_url ?? null,
      primaryColor: row?.primary_color ?? null,
      secondaryColor: row?.secondary_color ?? null,
      emailFrom: row?.email_from ?? null,
      domainCustom: row?.domain_custom ?? null,
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  }
}
