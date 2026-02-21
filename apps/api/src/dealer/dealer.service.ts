import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { TenantDb } from '../database/tenant-db.service';

const createDealerSchema = z.object({
  name: z.string().trim().min(1),
  region: z.string().trim().optional(),
  contact_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
});

type DealerRow = {
  id: string;
  tenant_id: string;
  name: string;
  region: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateDealerInput = z.input<typeof createDealerSchema>;

export type DealerResponse = {
  id: string;
  tenantId: string;
  name: string;
  region: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DealerService {
  constructor(
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateDealerInput,
  ): Promise<DealerResponse> {
    const parsed = createDealerSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const created = await this.tenantDb.insert<DealerRow>(
      tenantId,
      'dealers',
      {
        name: parsed.data.name,
        region: parsed.data.region ?? null,
        contact_name: parsed.data.contact_name ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        status: 'active',
      },
      [
        'id',
        'tenant_id',
        'name',
        'region',
        'contact_name',
        'phone',
        'email',
        'status',
        'created_at',
        'updated_at',
      ],
    );

    if (!created) {
      throw new BadRequestException('Failed to create dealer');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'dealer.created',
      entityType: 'dealer',
      entityId: created.id,
      payload: {
        dealer_id: created.id,
        name: created.name,
      },
    });

    return this.toResponse(created);
  }

  async list(tenantId: string): Promise<DealerResponse[]> {
    const rows = await this.tenantDb.selectMany<DealerRow>(
      tenantId,
      'dealers',
      {},
      [
        'id',
        'tenant_id',
        'name',
        'region',
        'contact_name',
        'phone',
        'email',
        'status',
        'created_at',
        'updated_at',
      ],
      { orderBy: 'name ASC' },
    );

    return rows.map((row) => this.toResponse(row));
  }

  async getById(tenantId: string, id: string): Promise<DealerResponse> {
    const row = await this.tenantDb.selectOne<DealerRow>(
      tenantId,
      'dealers',
      { id },
      [
        'id',
        'tenant_id',
        'name',
        'region',
        'contact_name',
        'phone',
        'email',
        'status',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new NotFoundException('Dealer not found');
    }

    return this.toResponse(row);
  }

  private toResponse(row: DealerRow): DealerResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      region: row.region,
      contactName: row.contact_name,
      phone: row.phone,
      email: row.email,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
