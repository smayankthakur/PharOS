import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

const createCompetitorSchema = z.object({
  name: z.string().trim().min(1),
  website: z.string().trim().url().optional(),
});

const createCompetitorItemSchema = z.object({
  competitor_id: z.string().uuid(),
  sku_id: z.string().uuid(),
  product_url: z.string().trim().url(),
  external_sku: z.string().trim().optional(),
});

const patchCompetitorItemSchema = z.object({
  product_url: z.string().trim().url().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const listCompetitorItemsQuerySchema = z.object({
  sku_id: z.string().uuid().optional(),
  competitor_id: z.string().uuid().optional(),
});

const createSnapshotSchema = z.object({
  competitor_item_id: z.string().uuid(),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).default('INR'),
  captured_at: z.string().datetime().optional(),
  method: z.enum(['manual', 'worker', 'api']).default('manual'),
  evidence_json: z.record(z.string(), z.unknown()).optional(),
  raw_json: z.record(z.string(), z.unknown()).optional(),
});

const listSnapshotsQuerySchema = z
  .object({
    sku_id: z.string().uuid().optional(),
    competitor_item_id: z.string().uuid().optional(),
    date_from: z.string().trim().min(1).optional(),
    date_to: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (!value.sku_id && !value.competitor_item_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sku_id'],
        message: 'Either sku_id or competitor_item_id is required',
      });
    }
  });

type CompetitorRow = {
  id: string;
  tenant_id: string;
  name: string;
  website: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type SkuRow = {
  id: string;
};

type CompetitorItemRow = {
  id: string;
  tenant_id: string;
  competitor_id: string;
  sku_id: string;
  product_url: string;
  external_sku: string | null;
  selector_json: Record<string, unknown>;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type SnapshotRow = {
  id: string;
  tenant_id: string;
  competitor_item_id: string;
  price: string;
  currency: string;
  captured_at: Date;
  method: string;
  evidence_json: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  created_at: Date;
};

type SnapshotListRow = SnapshotRow & {
  sku_id: string;
  sku_code: string;
  competitor_id: string;
  competitor_name: string;
  product_url: string;
};

export type CreateCompetitorInput = z.input<typeof createCompetitorSchema>;
export type CreateCompetitorItemInput = z.input<typeof createCompetitorItemSchema>;
export type PatchCompetitorItemInput = z.input<typeof patchCompetitorItemSchema>;
export type ListCompetitorItemsQuery = z.input<typeof listCompetitorItemsQuerySchema>;
export type CreateSnapshotInput = z.input<typeof createSnapshotSchema>;
export type ListSnapshotsQuery = z.input<typeof listSnapshotsQuerySchema>;

export type CompetitorResponse = {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompetitorItemResponse = {
  id: string;
  tenantId: string;
  competitorId: string;
  skuId: string;
  productUrl: string;
  externalSku: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SnapshotResponse = {
  id: string;
  tenantId: string;
  competitorItemId: string;
  skuId?: string;
  skuCode?: string;
  competitorId?: string;
  competitorName?: string;
  productUrl?: string;
  price: number;
  currency: string;
  capturedAt: Date;
  method: string;
  evidenceJson: Record<string, unknown>;
  rawJson: Record<string, unknown>;
  createdAt: Date;
};

@Injectable()
export class CompetitorService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantDb: TenantDb,
    private readonly auditService: AuditService,
  ) {}

  async createCompetitor(
    tenantId: string,
    actorUserId: string,
    input: CreateCompetitorInput,
  ): Promise<CompetitorResponse> {
    const parsed = createCompetitorSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const row = await this.tenantDb.insert<CompetitorRow>(
      tenantId,
      'competitors',
      {
        name: parsed.data.name,
        website: parsed.data.website ?? null,
        status: 'active',
      },
      ['id', 'tenant_id', 'name', 'website', 'status', 'created_at', 'updated_at'],
    );

    if (!row) {
      throw new BadRequestException('Failed to create competitor');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'competitor.created',
      entityType: 'competitor',
      entityId: row.id,
      payload: {
        competitor_id: row.id,
        name: row.name,
        website: row.website,
      },
    });

    return this.toCompetitorResponse(row);
  }

  async listCompetitors(tenantId: string): Promise<CompetitorResponse[]> {
    const rows = await this.tenantDb.selectMany<CompetitorRow>(
      tenantId,
      'competitors',
      {},
      ['id', 'tenant_id', 'name', 'website', 'status', 'created_at', 'updated_at'],
      { orderBy: 'name ASC' },
    );

    return rows.map((row) => this.toCompetitorResponse(row));
  }

  async createCompetitorItem(
    tenantId: string,
    actorUserId: string,
    input: CreateCompetitorItemInput,
  ): Promise<CompetitorItemResponse> {
    const parsed = createCompetitorItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.ensureCompetitorExists(tenantId, parsed.data.competitor_id);
    await this.ensureSkuExists(tenantId, parsed.data.sku_id);

    const row = await this.tenantDb.insert<CompetitorItemRow>(
      tenantId,
      'competitor_items',
      {
        competitor_id: parsed.data.competitor_id,
        sku_id: parsed.data.sku_id,
        product_url: parsed.data.product_url,
        external_sku: parsed.data.external_sku ?? null,
        selector_json: {},
        status: 'active',
      },
      [
        'id',
        'tenant_id',
        'competitor_id',
        'sku_id',
        'product_url',
        'external_sku',
        'selector_json',
        'status',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new BadRequestException('Failed to create competitor item');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'competitor.item.mapped',
      entityType: 'competitor_item',
      entityId: row.id,
      payload: {
        competitor_item_id: row.id,
        competitor_id: row.competitor_id,
        sku_id: row.sku_id,
        product_url: row.product_url,
      },
    });

    return this.toCompetitorItemResponse(row);
  }

  async listCompetitorItems(
    tenantId: string,
    query: ListCompetitorItemsQuery,
  ): Promise<CompetitorItemResponse[]> {
    const parsed = listCompetitorItemsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const where: Record<string, unknown> = {};
    if (parsed.data.sku_id) {
      where.sku_id = parsed.data.sku_id;
    }
    if (parsed.data.competitor_id) {
      where.competitor_id = parsed.data.competitor_id;
    }

    const rows = await this.tenantDb.selectMany<CompetitorItemRow>(
      tenantId,
      'competitor_items',
      where,
      [
        'id',
        'tenant_id',
        'competitor_id',
        'sku_id',
        'product_url',
        'external_sku',
        'selector_json',
        'status',
        'created_at',
        'updated_at',
      ],
      { orderBy: 'created_at DESC' },
    );

    return rows.map((row) => this.toCompetitorItemResponse(row));
  }

  async patchCompetitorItem(
    tenantId: string,
    id: string,
    input: PatchCompetitorItemInput,
  ): Promise<CompetitorItemResponse> {
    const parsed = patchCompetitorItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    if (!parsed.data.product_url && !parsed.data.status) {
      throw new BadRequestException('No patch fields provided');
    }

    const row = await this.tenantDb.update<CompetitorItemRow>(
      tenantId,
      'competitor_items',
      {
        ...(parsed.data.product_url ? { product_url: parsed.data.product_url } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        updated_at: new Date(),
      },
      { id },
      [
        'id',
        'tenant_id',
        'competitor_id',
        'sku_id',
        'product_url',
        'external_sku',
        'selector_json',
        'status',
        'created_at',
        'updated_at',
      ],
    );

    if (!row) {
      throw new NotFoundException('Competitor item not found');
    }

    return this.toCompetitorItemResponse(row);
  }

  async createSnapshot(
    tenantId: string,
    actorUserId: string,
    input: CreateSnapshotInput,
  ): Promise<SnapshotResponse> {
    const parsed = createSnapshotSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const item = await this.tenantDb.selectOne<Pick<CompetitorItemRow, 'id' | 'sku_id' | 'competitor_id' | 'product_url'>>(
      tenantId,
      'competitor_items',
      { id: parsed.data.competitor_item_id },
      ['id', 'sku_id', 'competitor_id', 'product_url'],
    );

    if (!item) {
      throw new BadRequestException('competitor_item_id not found in current tenant');
    }

    const row = await this.tenantDb.insert<SnapshotRow>(
      tenantId,
      'competitor_snapshots',
      {
        competitor_item_id: parsed.data.competitor_item_id,
        price: parsed.data.price,
        currency: parsed.data.currency,
        captured_at: parsed.data.captured_at ? new Date(parsed.data.captured_at) : new Date(),
        method: parsed.data.method,
        evidence_json: parsed.data.evidence_json ?? {},
        raw_json: parsed.data.raw_json ?? {},
      },
      [
        'id',
        'tenant_id',
        'competitor_item_id',
        'price',
        'currency',
        'captured_at',
        'method',
        'evidence_json',
        'raw_json',
        'created_at',
      ],
    );

    if (!row) {
      throw new BadRequestException('Failed to create competitor snapshot');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'competitor.snapshot.recorded',
      entityType: 'competitor_snapshot',
      entityId: row.id,
      payload: {
        competitor_snapshot_id: row.id,
        competitor_item_id: row.competitor_item_id,
        sku_id: item.sku_id,
        competitor_id: item.competitor_id,
        product_url: item.product_url,
        price: Number(row.price),
      },
    });

    return this.toSnapshotResponse(row);
  }

  async listSnapshots(tenantId: string, query: ListSnapshotsQuery): Promise<SnapshotResponse[]> {
    const parsed = listSnapshotsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const values: unknown[] = [tenantId];
    const where: string[] = ['cs.tenant_id = $1'];

    if (parsed.data.sku_id) {
      values.push(parsed.data.sku_id);
      where.push(`ci.sku_id = $${values.length}`);
    }

    if (parsed.data.competitor_item_id) {
      values.push(parsed.data.competitor_item_id);
      where.push(`cs.competitor_item_id = $${values.length}`);
    }

    if (parsed.data.date_from) {
      values.push(parsed.data.date_from);
      where.push(`cs.captured_at >= $${values.length}::timestamptz`);
    }

    if (parsed.data.date_to) {
      values.push(parsed.data.date_to);
      where.push(`cs.captured_at <= $${values.length}::timestamptz`);
    }

    values.push(parsed.data.limit);
    const limitIndex = values.length;
    values.push(parsed.data.offset);
    const offsetIndex = values.length;

    const result = await this.databaseService.query<SnapshotListRow>(
      `
      SELECT
        cs.id,
        cs.tenant_id,
        cs.competitor_item_id,
        cs.price,
        cs.currency,
        cs.captured_at,
        cs.method,
        cs.evidence_json,
        cs.raw_json,
        cs.created_at,
        ci.sku_id,
        s.code AS sku_code,
        ci.competitor_id,
        c.name AS competitor_name,
        ci.product_url
      FROM competitor_snapshots cs
      INNER JOIN competitor_items ci
        ON ci.id = cs.competitor_item_id
       AND ci.tenant_id = cs.tenant_id
      INNER JOIN skus s
        ON s.id = ci.sku_id
       AND s.tenant_id = ci.tenant_id
      INNER JOIN competitors c
        ON c.id = ci.competitor_id
       AND c.tenant_id = ci.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY cs.captured_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
      `,
      values,
    );

    return result.rows.map((row) => this.toSnapshotResponse(row));
  }

  private async ensureCompetitorExists(tenantId: string, competitorId: string): Promise<void> {
    const competitor = await this.tenantDb.selectOne<Pick<CompetitorRow, 'id'>>(
      tenantId,
      'competitors',
      { id: competitorId },
      ['id'],
    );

    if (!competitor) {
      throw new BadRequestException('competitor_id does not exist in current tenant');
    }
  }

  private async ensureSkuExists(tenantId: string, skuId: string): Promise<void> {
    const sku = await this.tenantDb.selectOne<SkuRow>(tenantId, 'skus', { id: skuId }, ['id']);

    if (!sku) {
      throw new BadRequestException('sku_id does not exist in current tenant');
    }
  }

  private toCompetitorResponse(row: CompetitorRow): CompetitorResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      website: row.website,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toCompetitorItemResponse(row: CompetitorItemRow): CompetitorItemResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      competitorId: row.competitor_id,
      skuId: row.sku_id,
      productUrl: row.product_url,
      externalSku: row.external_sku,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toSnapshotResponse(row: SnapshotRow | SnapshotListRow): SnapshotResponse {
    const listRow = row as SnapshotListRow;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      competitorItemId: row.competitor_item_id,
      skuId: listRow.sku_id,
      skuCode: listRow.sku_code,
      competitorId: listRow.competitor_id,
      competitorName: listRow.competitor_name,
      productUrl: listRow.product_url,
      price: Number(row.price),
      currency: row.currency,
      capturedAt: row.captured_at,
      method: row.method,
      evidenceJson: row.evidence_json,
      rawJson: row.raw_json,
      createdAt: row.created_at,
    };
  }
}
