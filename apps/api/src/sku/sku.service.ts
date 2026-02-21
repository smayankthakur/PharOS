import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

const pricingSchema = z
  .object({
    cost: z.number().finite().min(0),
    map: z.number().finite().min(0),
    mrp: z.number().finite().min(0),
    active_price: z.number().finite().min(0),
    currency_code: z.string().trim().min(1).default('INR'),
  })
  .superRefine((value, ctx) => {
    if (value.cost > value.map) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cost'],
        message: 'cost must be <= map',
      });
    }

    if (value.map > value.mrp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['map'],
        message: 'map must be <= mrp',
      });
    }
  });

const createSkuSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  pricing: pricingSchema,
});

const updatePricingSchema = pricingSchema;

type SkuRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type PricingRow = {
  id: string;
  tenant_id: string;
  sku_id: string;
  cost: string;
  map: string;
  mrp: string;
  active_price: string;
  currency_code: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateSkuInput = z.input<typeof createSkuSchema>;
export type UpdateSkuPricingInput = z.input<typeof updatePricingSchema>;

export type SkuListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  pricing: {
    cost: number;
    map: number;
    mrp: number;
    active_price: number;
    currency_code: string;
  } | null;
};

export type SkuDetailResponse = SkuListItem;

@Injectable()
export class SkuService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async createSku(
    tenantId: string,
    actorUserId: string,
    input: CreateSkuInput,
  ): Promise<SkuDetailResponse> {
    const parsed = createSkuSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const sku = await this.tenantDb.insert<SkuRow>(
      tenantId,
      'skus',
      {
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        status: 'active',
      },
      ['id', 'tenant_id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at'],
    );

    if (!sku) {
      throw new BadRequestException('Failed to create sku');
    }

    const pricing = await this.tenantDb.insert<PricingRow>(
      tenantId,
      'sku_pricing',
      {
        sku_id: sku.id,
        cost: parsed.data.pricing.cost,
        map: parsed.data.pricing.map,
        mrp: parsed.data.pricing.mrp,
        active_price: parsed.data.pricing.active_price,
        currency_code: parsed.data.pricing.currency_code,
      },
      [
        'id',
        'tenant_id',
        'sku_id',
        'cost',
        'map',
        'mrp',
        'active_price',
        'currency_code',
        'created_at',
        'updated_at',
      ],
    );

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'sku.created',
      entityType: 'sku',
      entityId: sku.id,
      payload: { code: sku.code, name: sku.name },
    });

    return this.toSkuDetail(sku, pricing);
  }

  async listSkus(tenantId: string): Promise<SkuListItem[]> {
    const result = await this.databaseService.query<
      SkuRow & {
        pricing_id: string | null;
        cost: string | null;
        map: string | null;
        mrp: string | null;
        active_price: string | null;
        currency_code: string | null;
      }
    >(
      `
      SELECT
        s.id,
        s.tenant_id,
        s.code,
        s.name,
        s.description,
        s.status,
        s.created_at,
        s.updated_at,
        p.id AS pricing_id,
        p.cost,
        p.map,
        p.mrp,
        p.active_price,
        p.currency_code
      FROM skus s
      LEFT JOIN sku_pricing p ON p.sku_id = s.id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
      ORDER BY s.code ASC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      pricing: row.pricing_id
        ? {
            cost: Number(row.cost),
            map: Number(row.map),
            mrp: Number(row.mrp),
            active_price: Number(row.active_price),
            currency_code: row.currency_code ?? 'INR',
          }
        : null,
    }));
  }

  async getSkuById(tenantId: string, id: string): Promise<SkuDetailResponse> {
    const sku = await this.tenantDb.selectOne<SkuRow>(
      tenantId,
      'skus',
      { id },
      ['id', 'tenant_id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at'],
    );

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    const pricing = await this.tenantDb.selectOne<PricingRow>(
      tenantId,
      'sku_pricing',
      { sku_id: sku.id },
      [
        'id',
        'tenant_id',
        'sku_id',
        'cost',
        'map',
        'mrp',
        'active_price',
        'currency_code',
        'created_at',
        'updated_at',
      ],
    );

    return this.toSkuDetail(sku, pricing);
  }

  async updatePricing(
    tenantId: string,
    actorUserId: string,
    skuId: string,
    input: UpdateSkuPricingInput,
  ): Promise<SkuDetailResponse> {
    const parsed = updatePricingSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const sku = await this.tenantDb.selectOne<SkuRow>(
      tenantId,
      'skus',
      { id: skuId },
      ['id', 'tenant_id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at'],
    );

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    const updated = await this.tenantDb.update<PricingRow>(
      tenantId,
      'sku_pricing',
      {
        cost: parsed.data.cost,
        map: parsed.data.map,
        mrp: parsed.data.mrp,
        active_price: parsed.data.active_price,
        currency_code: parsed.data.currency_code,
        updated_at: new Date(),
      },
      { sku_id: sku.id },
      [
        'id',
        'tenant_id',
        'sku_id',
        'cost',
        'map',
        'mrp',
        'active_price',
        'currency_code',
        'created_at',
        'updated_at',
      ],
    );

    const pricing =
      updated ??
      (await this.tenantDb.insert<PricingRow>(
        tenantId,
        'sku_pricing',
        {
          sku_id: sku.id,
          cost: parsed.data.cost,
          map: parsed.data.map,
          mrp: parsed.data.mrp,
          active_price: parsed.data.active_price,
          currency_code: parsed.data.currency_code,
        },
        [
          'id',
          'tenant_id',
          'sku_id',
          'cost',
          'map',
          'mrp',
          'active_price',
          'currency_code',
          'created_at',
          'updated_at',
        ],
      ));

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'sku.pricing.updated',
      entityType: 'sku',
      entityId: sku.id,
      payload: {
        cost: parsed.data.cost,
        map: parsed.data.map,
        mrp: parsed.data.mrp,
        active_price: parsed.data.active_price,
      },
    });

    return this.toSkuDetail(sku, pricing);
  }

  private toSkuDetail(sku: SkuRow, pricing: PricingRow | null): SkuDetailResponse {
    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      description: sku.description,
      status: sku.status,
      pricing: pricing
        ? {
            cost: Number(pricing.cost),
            map: Number(pricing.map),
            mrp: Number(pricing.mrp),
            active_price: Number(pricing.active_price),
            currency_code: pricing.currency_code,
          }
        : null,
    };
  }
}
