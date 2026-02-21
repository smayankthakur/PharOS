import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { loadConfig } from '@pharos/config';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import { getDefaultFeatureFlags } from '../security/feature-flags.guard';

const createResellerSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/),
});

const createResellerUserSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
  reseller_role: z.enum(['reseller_admin', 'reseller_ops', 'reseller_viewer']).default('reseller_admin'),
});

const provisionTenantSchema = z.object({
  tenant_name: z.string().trim().min(1),
  tenant_slug: z.string().trim().regex(/^[a-z0-9-]+$/),
  owner_name: z.string().trim().min(1),
  owner_email: z.string().trim().email(),
  owner_password: z.string().min(8),
  plan: z.string().trim().min(1).default('trial'),
  branding: z
    .object({
      logo_url: z.string().trim().url().optional(),
      primary_color: z.string().trim().min(1).optional(),
      secondary_color: z.string().trim().min(1).optional(),
    })
    .optional(),
  flags: z.record(z.string(), z.boolean()).optional(),
});

const updateFlagsSchema = z.object({
  flags_json: z.record(z.string(), z.boolean()),
});

const addDomainSchema = z.object({
  domain: z.string().trim().min(1),
});

const patchDomainSchema = z.object({
  status: z.enum(['pending', 'disabled']),
});

type ResellerRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
};

type ResellerUserRow = {
  reseller_id: string;
  user_id: string;
  role: 'reseller_admin' | 'reseller_ops' | 'reseller_viewer';
};

type UserRow = {
  id: string;
  tenant_id: string | null;
  email: string;
};

type ProvisioningRow = {
  tenant_id: string;
  reseller_id: string | null;
  provisioned_by_user_id: string | null;
  plan: string;
  created_at: Date;
};

type TenantDomainRow = {
  id: string;
  tenant_id: string;
  domain: string;
  status: 'pending' | 'active' | 'disabled';
  created_at: Date;
};

type TenantSummaryRow = {
  tenant_id: string;
  plan: string;
  created_at: Date;
  name: string;
  slug: string;
  status: string;
};

export type CreateResellerInput = z.input<typeof createResellerSchema>;
export type CreateResellerUserInput = z.input<typeof createResellerUserSchema>;
export type ProvisionTenantInput = z.input<typeof provisionTenantSchema>;
export type UpdateTenantFlagsInput = z.input<typeof updateFlagsSchema>;
export type AddTenantDomainInput = z.input<typeof addDomainSchema>;
export type PatchTenantDomainInput = z.input<typeof patchDomainSchema>;

@Injectable()
export class ResellerService {
  private readonly systemAdminEmails: Set<string>;

  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {
    this.systemAdminEmails = new Set(loadConfig().systemAdminEmails);
  }

  isSystemAdmin(email: string): boolean {
    return this.systemAdminEmails.has(email.trim().toLowerCase());
  }

  async createReseller(
    actor: { userId: string; email: string; tenantId: string | null },
    input: CreateResellerInput,
  ): Promise<{ reseller_id: string }> {
    this.assertSystemAdmin(actor.email);
    const parsed = createResellerSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = await this.databaseService.query<ResellerRow>(
      `
      INSERT INTO resellers (name, slug, status)
      VALUES ($1, $2, 'active')
      RETURNING id, name, slug, status, created_at
      `,
      [parsed.data.name, parsed.data.slug.toLowerCase()],
    );

    const reseller = row.rows[0];
    if (!reseller) {
      throw new BadRequestException('Unable to create reseller');
    }

    if (actor.tenantId) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'reseller.created',
        entityType: 'reseller',
        entityId: reseller.id,
        payload: { slug: reseller.slug },
      });
    }

    return { reseller_id: reseller.id };
  }

  async listResellers(actorEmail: string): Promise<ResellerRow[]> {
    this.assertSystemAdmin(actorEmail);
    const result = await this.databaseService.query<ResellerRow>(
      `
      SELECT id, name, slug, status, created_at
      FROM resellers
      ORDER BY created_at DESC
      `,
    );
    return result.rows;
  }

  async addResellerUser(
    actor: { userId: string; email: string; tenantId: string | null },
    resellerId: string,
    input: CreateResellerUserInput,
  ): Promise<{ user_id: string }> {
    const parsed = createResellerUserSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const actorMembership = await this.getResellerMembership(actor.userId, resellerId);
    const isAllowed = this.isSystemAdmin(actor.email) || actorMembership?.role === 'reseller_admin';
    if (!isAllowed) {
      throw new ForbiddenException('Insufficient reseller access');
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const email = parsed.data.email.toLowerCase();

    const createdUserId = await this.databaseService.withTransaction(async (client) => {
      const existing = await client.query<UserRow>(
        `
        SELECT id, tenant_id, email
        FROM users
        WHERE lower(email) = $1
        ORDER BY created_at ASC
        LIMIT 1
        `,
        [email],
      );

      let userId = existing.rows[0]?.id;

      if (userId) {
        await client.query(
          `
          UPDATE users
          SET name = $1, password_hash = $2, status = 'active'
          WHERE id = $3
          `,
          [parsed.data.name, passwordHash, userId],
        );
      } else {
        const created = await client.query<{ id: string }>(
          `
          INSERT INTO users (tenant_id, name, email, password_hash, status)
          VALUES (NULL, $1, $2, $3, 'active')
          RETURNING id
          `,
          [parsed.data.name, email, passwordHash],
        );
        userId = created.rows[0]?.id;
      }

      if (!userId) {
        throw new BadRequestException('Unable to create reseller user');
      }

      await client.query(
        `
        INSERT INTO reseller_users (reseller_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (reseller_id, user_id) DO UPDATE SET role = EXCLUDED.role
        `,
        [resellerId, userId, parsed.data.reseller_role],
      );

      return userId;
    });

    if (actor.tenantId) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'reseller.user.added',
        entityType: 'reseller',
        entityId: resellerId,
        payload: { user_id: createdUserId, role: parsed.data.reseller_role },
      });
    }

    return { user_id: createdUserId };
  }

  async provisionTenant(
    actor: { userId: string; email: string; tenantId: string | null },
    input: ProvisionTenantInput,
  ): Promise<{ tenant_id: string; tenant_slug: string; owner_email: string }> {
    const parsed = provisionTenantSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const memberships = await this.getUserResellerMemberships(actor.userId);
    const hasSystemAdmin = this.isSystemAdmin(actor.email);
    const adminMemberships = memberships.filter((membership) => membership.role === 'reseller_admin');
    if (!hasSystemAdmin && adminMemberships.length === 0) {
      throw new ForbiddenException('Reseller access required');
    }

    const resellerId = adminMemberships[0]?.reseller_id ?? null;
    const ownerEmail = parsed.data.owner_email.toLowerCase();
    const ownerPasswordHash = await bcrypt.hash(parsed.data.owner_password, 10);
    const defaultFlags = getDefaultFeatureFlags();
    const mergedFlags = { ...defaultFlags, ...(parsed.data.flags ?? {}) };

    const tenantId = await this.databaseService.withTransaction(async (client) => {
      const existingTenant = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
        [parsed.data.tenant_slug.toLowerCase()],
      );
      if (existingTenant.rows[0]) {
        throw new BadRequestException('tenant_slug already exists');
      }

      const tenantResult = await client.query<{ id: string }>(
        `
        INSERT INTO tenants (name, slug, status)
        VALUES ($1, $2, 'active')
        RETURNING id
        `,
        [parsed.data.tenant_name, parsed.data.tenant_slug.toLowerCase()],
      );
      const createdTenantId = tenantResult.rows[0]?.id;
      if (!createdTenantId) {
        throw new BadRequestException('Failed to create tenant');
      }

      await client.query(
        `
        INSERT INTO tenant_branding (tenant_id, logo_url, primary_color, secondary_color)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id) DO UPDATE SET
          logo_url = EXCLUDED.logo_url,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          updated_at = now()
        `,
        [
          createdTenantId,
          parsed.data.branding?.logo_url ?? null,
          parsed.data.branding?.primary_color ?? null,
          parsed.data.branding?.secondary_color ?? null,
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
        [createdTenantId, JSON.stringify(mergedFlags)],
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

      const ownerResult = await client.query<{ id: string }>(
        `
        INSERT INTO users (tenant_id, name, email, password_hash, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING id
        `,
        [createdTenantId, parsed.data.owner_name, ownerEmail, ownerPasswordHash],
      );

      const ownerUserId = ownerResult.rows[0]?.id;
      if (!ownerUserId) {
        throw new BadRequestException('Failed to create owner');
      }

      await client.query(
        `
        INSERT INTO user_roles (user_id, role_id)
        SELECT $1, r.id
        FROM roles r
        WHERE r.tenant_id = $2 AND r.name = 'Owner'
        ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        [ownerUserId, createdTenantId],
      );

      await client.query(
        `
        INSERT INTO tenant_provisioning (tenant_id, reseller_id, provisioned_by_user_id, plan)
        VALUES ($1, $2, $3, $4)
        `,
        [createdTenantId, resellerId, actor.userId, parsed.data.plan],
      );

      return createdTenantId;
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'tenant.provisioned',
      entityType: 'tenant',
      entityId: tenantId,
      payload: { reseller_id: resellerId, tenant_slug: parsed.data.tenant_slug.toLowerCase() },
    });

    return {
      tenant_id: tenantId,
      tenant_slug: parsed.data.tenant_slug.toLowerCase(),
      owner_email: ownerEmail,
    };
  }

  async listProvisionedTenants(actor: {
    userId: string;
    email: string;
  }): Promise<TenantSummaryRow[]> {
    if (this.isSystemAdmin(actor.email)) {
      const all = await this.databaseService.query<TenantSummaryRow>(
        `
        SELECT tp.tenant_id, tp.plan, tp.created_at, t.name, t.slug, t.status
        FROM tenant_provisioning tp
        INNER JOIN tenants t ON t.id = tp.tenant_id
        ORDER BY tp.created_at DESC
        `,
      );
      return all.rows;
    }

    const memberships = await this.getUserResellerMemberships(actor.userId);
    if (memberships.length === 0) {
      throw new ForbiddenException('Reseller access required');
    }

    const resellerIds = memberships.map((row) => row.reseller_id);
    const result = await this.databaseService.query<TenantSummaryRow>(
      `
      SELECT tp.tenant_id, tp.plan, tp.created_at, t.name, t.slug, t.status
      FROM tenant_provisioning tp
      INNER JOIN tenants t ON t.id = tp.tenant_id
      WHERE tp.reseller_id = ANY($1::uuid[])
      ORDER BY tp.created_at DESC
      `,
      [resellerIds],
    );
    return result.rows;
  }

  async updateTenantFlags(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
    input: UpdateTenantFlagsInput,
  ): Promise<{ tenant_id: string; flags_json: Record<string, boolean> }> {
    const parsed = updateFlagsSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.assertCanManageTenant(actor, tenantId);

    const row = await this.tenantDb.update<{ tenant_id: string; flags_json: Record<string, boolean> }>(
      tenantId,
      'tenant_feature_flags',
      {
        flags_json: parsed.data.flags_json,
        updated_at: new Date(),
      },
      {},
      ['tenant_id', 'flags_json'],
    );

    const upserted =
      row ??
      (await this.tenantDb.insert<{ tenant_id: string; flags_json: Record<string, boolean> }>(
        tenantId,
        'tenant_feature_flags',
        {
          flags_json: parsed.data.flags_json,
          updated_at: new Date(),
        },
        ['tenant_id', 'flags_json'],
      ));

    if (!upserted) {
      throw new BadRequestException('Unable to update flags');
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'tenant.flags.updated',
      entityType: 'tenant_feature_flags',
      entityId: tenantId,
      payload: { flags_json: parsed.data.flags_json },
    });

    return upserted;
  }

  async getTenantFlags(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
  ): Promise<{ tenant_id: string; flags_json: Record<string, boolean> }> {
    await this.assertCanManageTenant(actor, tenantId);
    const row = await this.tenantDb.selectOne<{ tenant_id: string; flags_json: Record<string, boolean> }>(
      tenantId,
      'tenant_feature_flags',
      {},
      ['tenant_id', 'flags_json'],
    );
    if (row) {
      return row;
    }

    const defaults = getDefaultFeatureFlags();
    const created = await this.tenantDb.insert<{ tenant_id: string; flags_json: Record<string, boolean> }>(
      tenantId,
      'tenant_feature_flags',
      { flags_json: defaults, updated_at: new Date() },
      ['tenant_id', 'flags_json'],
    );
    if (!created) {
      throw new BadRequestException('Unable to fetch flags');
    }
    return created;
  }

  async addTenantDomain(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
    input: AddTenantDomainInput,
  ): Promise<TenantDomainRow> {
    const parsed = addDomainSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.assertCanManageTenant(actor, tenantId);

    const created = await this.tenantDb.insert<TenantDomainRow>(
      tenantId,
      'tenant_domains',
      { domain: parsed.data.domain.toLowerCase(), status: 'pending' },
      ['id', 'tenant_id', 'domain', 'status', 'created_at'],
    );

    if (!created) {
      throw new BadRequestException('Unable to add domain');
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'tenant.domain.added',
      entityType: 'tenant_domain',
      entityId: created.id,
      payload: { domain: created.domain },
    });

    return created;
  }

  async listTenantDomains(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
  ): Promise<TenantDomainRow[]> {
    await this.assertCanManageTenant(actor, tenantId);
    return this.tenantDb.selectMany<TenantDomainRow>(
      tenantId,
      'tenant_domains',
      {},
      ['id', 'tenant_id', 'domain', 'status', 'created_at'],
      { orderBy: 'created_at DESC' },
    );
  }

  async patchTenantDomain(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
    domainId: string,
    input: PatchTenantDomainInput,
  ): Promise<TenantDomainRow> {
    const parsed = patchDomainSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.assertCanManageTenant(actor, tenantId);

    const updated = await this.tenantDb.update<TenantDomainRow>(
      tenantId,
      'tenant_domains',
      { status: parsed.data.status },
      { id: domainId },
      ['id', 'tenant_id', 'domain', 'status', 'created_at'],
    );

    if (!updated) {
      throw new NotFoundException('Domain not found');
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'tenant.domain.updated',
      entityType: 'tenant_domain',
      entityId: updated.id,
      payload: { status: updated.status },
    });

    return updated;
  }

  private async assertCanManageTenant(
    actor: { userId: string; email: string; tenantId: string | null },
    tenantId: string,
  ): Promise<void> {
    if (this.isSystemAdmin(actor.email)) {
      return;
    }

    const ownerResult = await this.databaseService.query<{ ok: number }>(
      `
      SELECT 1 AS ok
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1
        AND u.tenant_id = $2
        AND r.tenant_id = $2
        AND r.name = 'Owner'
      LIMIT 1
      `,
      [actor.userId, tenantId],
    );

    if (ownerResult.rows[0]) {
      return;
    }

    const memberships = await this.getUserResellerMemberships(actor.userId);
    if (memberships.length === 0) {
      throw new ForbiddenException('Insufficient access for tenant');
    }

    const adminResellerIds = memberships
      .filter((membership) => membership.role === 'reseller_admin')
      .map((membership) => membership.reseller_id);
    if (adminResellerIds.length === 0) {
      throw new ForbiddenException('Insufficient reseller role');
    }

    const provisioning = await this.databaseService.query<ProvisioningRow>(
      `
      SELECT tenant_id, reseller_id, provisioned_by_user_id, plan, created_at
      FROM tenant_provisioning
      WHERE tenant_id = $1
      LIMIT 1
      `,
      [tenantId],
    );

    const provisioned = provisioning.rows[0];
    if (!provisioned?.reseller_id || !adminResellerIds.includes(provisioned.reseller_id)) {
      throw new ForbiddenException('Reseller cannot access this tenant');
    }
  }

  private async getUserResellerMemberships(userId: string): Promise<ResellerUserRow[]> {
    const result = await this.databaseService.query<ResellerUserRow>(
      `
      SELECT reseller_id, user_id, role
      FROM reseller_users
      WHERE user_id = $1
      `,
      [userId],
    );
    return result.rows;
  }

  private async getResellerMembership(
    userId: string,
    resellerId: string,
  ): Promise<ResellerUserRow | null> {
    const result = await this.databaseService.query<ResellerUserRow>(
      `
      SELECT reseller_id, user_id, role
      FROM reseller_users
      WHERE user_id = $1 AND reseller_id = $2
      LIMIT 1
      `,
      [userId, resellerId],
    );
    return result.rows[0] ?? null;
  }

  private assertSystemAdmin(email: string): void {
    if (!this.isSystemAdmin(email)) {
      throw new ForbiddenException('System admin access required');
    }
  }
}
