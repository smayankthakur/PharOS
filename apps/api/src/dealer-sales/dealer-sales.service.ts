import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';

const createDealerSaleSchema = z.object({
  dealer_id: z.string().uuid(),
  sku_id: z.string().uuid(),
  sale_price: z.number().finite().positive(),
  qty: z.number().int().positive(),
  sale_date: z.string().date(),
  source: z.enum(['manual', 'csv', 'shopify', 'woocommerce', 'rest']).default('manual'),
  ref_no: z.string().trim().optional(),
});

const listDealerSalesQuerySchema = z.object({
  dealer_id: z.string().uuid().optional(),
  sku_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type DealerRow = {
  id: string;
};

type SkuRow = {
  id: string;
};

type DealerSaleRow = {
  id: string;
  tenant_id: string;
  dealer_id: string;
  sku_id: string;
  sale_price: string;
  qty: number;
  sale_date: string;
  source: string;
  ref_no: string | null;
  created_at: Date;
};

type DealerSaleListRow = DealerSaleRow & {
  dealer_name: string;
  sku_code: string;
  sku_name: string;
};

export type CreateDealerSaleInput = z.input<typeof createDealerSaleSchema>;
export type ListDealerSalesQuery = z.input<typeof listDealerSalesQuerySchema>;

export type DealerSaleResponse = {
  id: string;
  tenantId: string;
  dealerId: string;
  dealerName?: string;
  skuId: string;
  skuCode?: string;
  skuName?: string;
  salePrice: number;
  qty: number;
  saleDate: string;
  source: string;
  refNo: string | null;
  createdAt: Date;
};

@Injectable()
export class DealerSalesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantDb: TenantDb,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateDealerSaleInput,
  ): Promise<DealerSaleResponse> {
    const parsed = createDealerSaleSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.ensureDealerAndSkuExist(tenantId, parsed.data.dealer_id, parsed.data.sku_id);

    const row = await this.tenantDb.insert<DealerSaleRow>(
      tenantId,
      'dealer_sales',
      {
        dealer_id: parsed.data.dealer_id,
        sku_id: parsed.data.sku_id,
        sale_price: parsed.data.sale_price,
        qty: parsed.data.qty,
        sale_date: parsed.data.sale_date,
        source: parsed.data.source,
        ref_no: parsed.data.ref_no ?? null,
      },
      [
        'id',
        'tenant_id',
        'dealer_id',
        'sku_id',
        'sale_price',
        'qty',
        'sale_date',
        'source',
        'ref_no',
        'created_at',
      ],
    );

    if (!row) {
      throw new BadRequestException('Failed to create dealer sale');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'dealer.sale.recorded',
      entityType: 'dealer_sale',
      entityId: row.id,
      payload: {
        dealer_id: row.dealer_id,
        sku_id: row.sku_id,
        sale_price: Number(row.sale_price),
        qty: row.qty,
        sale_date: row.sale_date,
        source: row.source,
        ref_no: row.ref_no,
      },
    });

    return this.toResponse(row);
  }

  async list(tenantId: string, query: ListDealerSalesQuery): Promise<DealerSaleResponse[]> {
    const parsed = listDealerSalesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const values: unknown[] = [tenantId];
    const where: string[] = ['ds.tenant_id = $1'];

    if (parsed.data.dealer_id) {
      values.push(parsed.data.dealer_id);
      where.push(`ds.dealer_id = $${values.length}`);
    }

    if (parsed.data.sku_id) {
      values.push(parsed.data.sku_id);
      where.push(`ds.sku_id = $${values.length}`);
    }

    if (parsed.data.date_from) {
      values.push(parsed.data.date_from);
      where.push(`ds.sale_date >= $${values.length}::date`);
    }

    if (parsed.data.date_to) {
      values.push(parsed.data.date_to);
      where.push(`ds.sale_date <= $${values.length}::date`);
    }

    values.push(parsed.data.limit);
    const limitIndex = values.length;
    values.push(parsed.data.offset);
    const offsetIndex = values.length;

    const result = await this.databaseService.query<DealerSaleListRow>(
      `
      SELECT
        ds.id,
        ds.tenant_id,
        ds.dealer_id,
        ds.sku_id,
        ds.sale_price,
        ds.qty,
        ds.sale_date::text AS sale_date,
        ds.source,
        ds.ref_no,
        ds.created_at,
        d.name AS dealer_name,
        s.code AS sku_code,
        s.name AS sku_name
      FROM dealer_sales ds
      INNER JOIN dealers d ON d.id = ds.dealer_id AND d.tenant_id = ds.tenant_id
      INNER JOIN skus s ON s.id = ds.sku_id AND s.tenant_id = ds.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY ds.sale_date DESC, ds.created_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
      `,
      values,
    );

    return result.rows.map((row) => this.toResponse(row));
  }

  async getById(tenantId: string, id: string): Promise<DealerSaleResponse> {
    const result = await this.databaseService.query<DealerSaleListRow>(
      `
      SELECT
        ds.id,
        ds.tenant_id,
        ds.dealer_id,
        ds.sku_id,
        ds.sale_price,
        ds.qty,
        ds.sale_date::text AS sale_date,
        ds.source,
        ds.ref_no,
        ds.created_at,
        d.name AS dealer_name,
        s.code AS sku_code,
        s.name AS sku_name
      FROM dealer_sales ds
      INNER JOIN dealers d ON d.id = ds.dealer_id AND d.tenant_id = ds.tenant_id
      INNER JOIN skus s ON s.id = ds.sku_id AND s.tenant_id = ds.tenant_id
      WHERE ds.tenant_id = $1
        AND ds.id = $2
      LIMIT 1
      `,
      [tenantId, id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Dealer sale not found');
    }

    return this.toResponse(row);
  }

  private async ensureDealerAndSkuExist(
    tenantId: string,
    dealerId: string,
    skuId: string,
  ): Promise<void> {
    const dealer = await this.tenantDb.selectOne<DealerRow>(tenantId, 'dealers', { id: dealerId }, ['id']);
    if (!dealer) {
      throw new BadRequestException('dealer_id does not exist in current tenant');
    }

    const sku = await this.tenantDb.selectOne<SkuRow>(tenantId, 'skus', { id: skuId }, ['id']);
    if (!sku) {
      throw new BadRequestException('sku_id does not exist in current tenant');
    }
  }

  private toResponse(row: DealerSaleRow | DealerSaleListRow): DealerSaleResponse {
    const listRow = row as DealerSaleListRow;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      dealerId: row.dealer_id,
      dealerName: listRow.dealer_name,
      skuId: row.sku_id,
      skuCode: listRow.sku_code,
      skuName: listRow.sku_name,
      salePrice: Number(row.sale_price),
      qty: row.qty,
      saleDate: row.sale_date,
      source: row.source,
      refNo: row.ref_no,
      createdAt: row.created_at,
    };
  }
}
