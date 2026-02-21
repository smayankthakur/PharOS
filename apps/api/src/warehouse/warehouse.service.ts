import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { TenantDb } from '../database/tenant-db.service';

const createWarehouseSchema = z.object({
  name: z.string().trim().min(1),
  location: z.string().trim().optional(),
});

type WarehouseRow = {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateWarehouseInput = z.input<typeof createWarehouseSchema>;

export type WarehouseResponse = {
  id: string;
  tenantId: string;
  name: string;
  location: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateWarehouseInput,
  ): Promise<WarehouseResponse> {
    const parsed = createWarehouseSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = await this.tenantDb.insert<WarehouseRow>(
      tenantId,
      'warehouses',
      {
        name: parsed.data.name,
        location: parsed.data.location ?? null,
        status: 'active',
      },
      ['id', 'tenant_id', 'name', 'location', 'status', 'created_at', 'updated_at'],
    );

    if (!row) {
      throw new BadRequestException('Failed to create warehouse');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'warehouse.created',
      entityType: 'warehouse',
      entityId: row.id,
      payload: {
        warehouse_id: row.id,
        name: row.name,
      },
    });

    return this.toResponse(row);
  }

  async list(tenantId: string): Promise<WarehouseResponse[]> {
    const rows = await this.tenantDb.selectMany<WarehouseRow>(
      tenantId,
      'warehouses',
      {},
      ['id', 'tenant_id', 'name', 'location', 'status', 'created_at', 'updated_at'],
      { orderBy: 'name ASC' },
    );

    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(row: WarehouseRow): WarehouseResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      location: row.location,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
