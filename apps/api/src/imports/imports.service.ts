import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantDb } from '../database/tenant-db.service';
import { InventoryService } from '../inventory/inventory.service';
import { UsageService } from '../usage/usage.service';

const importTypeSchema = z.enum(['dealer_sales', 'inventory_movements', 'competitor_snapshots']);

const startImportSchema = z.object({
  type: importTypeSchema,
  idempotency_key: z.string().trim().min(1),
  file_name: z.string().trim().optional(),
  csv_text: z.string().min(1),
});

type ImportType = z.infer<typeof importTypeSchema>;

type CsvRow = Record<string, string>;

type ImportJobStatus = 'queued' | 'processing' | 'success' | 'partial' | 'failed';

type ImportJobRow = {
  id: string;
  tenant_id: string;
  type: ImportType;
  status: ImportJobStatus;
  file_name: string | null;
  file_hash: string | null;
  idempotency_key: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

type ImportRowRecord = {
  id: string;
  tenant_id: string;
  import_job_id: string;
  row_number: number;
  status: 'success' | 'error';
  error_text: string | null;
  raw_json: Record<string, unknown>;
  created_at: Date;
};

type DealerRow = { id: string; name: string };
type WarehouseRow = { id: string; name: string };
type CompetitorRow = { id: string; name: string };
type SkuRow = { id: string; code: string };
type CompetitorItemRow = { id: string };

const dealerSalesHeaders = ['sku_code', 'dealer_name', 'sale_price', 'qty', 'sale_date', 'ref_no'] as const;
const inventoryHeaders = ['sku_code', 'warehouse_name', 'type', 'qty', 'ref_type', 'ref_id', 'note', 'occurred_at'] as const;
const snapshotHeaders = ['sku_code', 'competitor_name', 'price', 'product_url', 'captured_at', 'currency'] as const;

const inventoryTypeSchema = z.enum(['in', 'out', 'adjust']);

export type StartImportInput = z.input<typeof startImportSchema>;

export type ImportJobDetailResponse = {
  job: {
    id: string;
    type: ImportType;
    status: ImportJobStatus;
    fileName: string | null;
    idempotencyKey: string;
    totalRows: number;
    successRows: number;
    errorRows: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  };
  rows: Array<{
    rowNumber: number;
    status: 'success' | 'error';
    errorText: string | null;
    raw: Record<string, unknown>;
    createdAt: Date;
  }>;
};

@Injectable()
export class ImportsService {
  constructor(
    @Inject(TenantDb)
    private readonly tenantDb: TenantDb,
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(InventoryService)
    private readonly inventoryService: InventoryService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(UsageService)
    private readonly usageService: UsageService,
  ) {}

  async startImport(
    tenantId: string,
    actorUserId: string,
    input: StartImportInput,
  ): Promise<{ import_job_id: string }> {
    const parsed = startImportSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = await this.tenantDb.selectOne<ImportJobRow>(
      tenantId,
      'import_jobs',
      { idempotency_key: parsed.data.idempotency_key },
      [
        'id',
        'tenant_id',
        'type',
        'status',
        'file_name',
        'file_hash',
        'idempotency_key',
        'total_rows',
        'success_rows',
        'error_rows',
        'started_at',
        'completed_at',
        'created_at',
      ],
    );
    if (existing) {
      return { import_job_id: existing.id };
    }

    const fileHash = createHash('sha256').update(parsed.data.csv_text).digest('hex');
    const rows = this.parseCsv(parsed.data.csv_text, parsed.data.type);

    const job = await this.tenantDb.insert<ImportJobRow>(
      tenantId,
      'import_jobs',
      {
        type: parsed.data.type,
        status: 'processing',
        file_name: parsed.data.file_name ?? null,
        file_hash: fileHash,
        idempotency_key: parsed.data.idempotency_key,
        total_rows: rows.length,
        success_rows: 0,
        error_rows: 0,
        started_at: new Date(),
      },
      [
        'id',
        'tenant_id',
        'type',
        'status',
        'file_name',
        'file_hash',
        'idempotency_key',
        'total_rows',
        'success_rows',
        'error_rows',
        'started_at',
        'completed_at',
        'created_at',
      ],
    );

    if (!job) {
      throw new BadRequestException('Failed to create import job');
    }

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'import.started',
      entityType: 'import_job',
      entityId: job.id,
      payload: {
        import_job_id: job.id,
        type: job.type,
        total_rows: rows.length,
        idempotency_key: job.idempotency_key,
      },
    });
    await this.usageService.incrementUsage(tenantId, 'imports_created');

    let successRows = 0;
    let errorRows = 0;

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 1;

      try {
        if (parsed.data.type === 'dealer_sales') {
          await this.ingestDealerSaleRow(tenantId, rawRow);
        } else if (parsed.data.type === 'inventory_movements') {
          await this.ingestInventoryMovementRow(tenantId, actorUserId, rawRow, parsed.data.idempotency_key, rowNumber);
        } else {
          await this.ingestSnapshotRow(tenantId, rawRow, job.id);
        }

        successRows += 1;
        await this.insertImportRow(tenantId, job.id, rowNumber, 'success', null, rawRow);
      } catch (error) {
        errorRows += 1;
        const message = error instanceof Error ? error.message : 'row_import_error';
        await this.insertImportRow(tenantId, job.id, rowNumber, 'error', message, rawRow);

        await this.auditService.record({
          tenantId,
          actorUserId,
          action: 'import.row.error',
          entityType: 'import_job',
          entityId: job.id,
          payload: {
            import_job_id: job.id,
            row_number: rowNumber,
            error: message,
          },
        });
      }
    }

    const finalStatus: ImportJobStatus =
      errorRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';

    await this.tenantDb.update<ImportJobRow>(
      tenantId,
      'import_jobs',
      {
        status: finalStatus,
        success_rows: successRows,
        error_rows: errorRows,
        completed_at: new Date(),
      },
      { id: job.id },
      ['id'],
    );

    await this.auditService.record({
      tenantId,
      actorUserId,
      action: 'import.completed',
      entityType: 'import_job',
      entityId: job.id,
      payload: {
        import_job_id: job.id,
        status: finalStatus,
        success_rows: successRows,
        error_rows: errorRows,
      },
    });

    return { import_job_id: job.id };
  }

  async getImportJob(tenantId: string, importJobId: string): Promise<ImportJobDetailResponse> {
    const job = await this.tenantDb.selectOne<ImportJobRow>(
      tenantId,
      'import_jobs',
      { id: importJobId },
      [
        'id',
        'tenant_id',
        'type',
        'status',
        'file_name',
        'file_hash',
        'idempotency_key',
        'total_rows',
        'success_rows',
        'error_rows',
        'started_at',
        'completed_at',
        'created_at',
      ],
    );

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const result = await this.databaseService.query<ImportRowRecord>(
      `
      SELECT
        id,
        tenant_id,
        import_job_id,
        row_number,
        status,
        error_text,
        raw_json,
        created_at
      FROM import_rows
      WHERE tenant_id = $1 AND import_job_id = $2
      ORDER BY row_number DESC
      LIMIT 50
      `,
      [tenantId, importJobId],
    );

    return {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        fileName: job.file_name,
        idempotencyKey: job.idempotency_key,
        totalRows: job.total_rows,
        successRows: job.success_rows,
        errorRows: job.error_rows,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        createdAt: job.created_at,
      },
      rows: result.rows.map((row) => ({
        rowNumber: row.row_number,
        status: row.status,
        errorText: row.error_text,
        raw: row.raw_json,
        createdAt: row.created_at,
      })),
    };
  }

  private parseCsv(csvText: string, type: ImportType): CsvRow[] {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException('CSV must contain header + at least 1 row');
    }

    const headerLine = lines[0];
    if (!headerLine) {
      throw new BadRequestException('CSV header is missing');
    }
    const headers = this.splitCsvLine(headerLine).map((header) => header.trim().toLowerCase());
    this.assertHeaders(type, headers);

    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const rowLine = lines[i];
      if (!rowLine) {
        continue;
      }
      const values = this.splitCsvLine(rowLine).map((value) => value.trim());
      if (values.length !== headers.length) {
        throw new BadRequestException(`CSV row ${i + 1} has ${values.length} columns; expected ${headers.length}`);
      }

      const row: CsvRow = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return rows;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = i < line.length - 1 ? line[i + 1] : '';

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current);
    return result;
  }

  private assertHeaders(type: ImportType, headers: string[]): void {
    const expected =
      type === 'dealer_sales'
        ? dealerSalesHeaders
        : type === 'inventory_movements'
          ? inventoryHeaders
          : snapshotHeaders;

    const missing = expected.filter((header) => !headers.includes(header));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing CSV headers for ${type}: ${missing.join(', ')}`);
    }
  }

  private async ingestDealerSaleRow(tenantId: string, row: CsvRow): Promise<void> {
    const skuCode = (row.sku_code ?? '').trim();
    const dealerName = (row.dealer_name ?? '').trim();
    const salePrice = Number(row.sale_price);
    const qty = Number(row.qty);
    const saleDate = (row.sale_date ?? '').trim();
    const refNo = (row.ref_no ?? '').trim() || null;

    if (dealerName.length === 0) {
      throw new BadRequestException('dealer_name is required');
    }
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      throw new BadRequestException('sale_price must be > 0');
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty must be a positive integer');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
      throw new BadRequestException('sale_date must be YYYY-MM-DD');
    }

    const sku = await this.getSkuByCode(tenantId, skuCode);
    if (!sku) {
      throw new BadRequestException(`sku_code not found: ${skuCode}`);
    }

    const dealer = await this.getOrCreateDealerByName(tenantId, dealerName);

    await this.databaseService.query(
      `
      INSERT INTO dealer_sales (
        tenant_id,
        dealer_id,
        sku_id,
        sale_price,
        qty,
        sale_date,
        source,
        ref_no
      )
      VALUES ($1,$2,$3,$4,$5,$6,'csv',$7)
      `,
      [tenantId, dealer.id, sku.id, salePrice, qty, saleDate, refNo],
    );
  }

  private async ingestInventoryMovementRow(
    tenantId: string,
    actorUserId: string,
    row: CsvRow,
    idempotencyKey: string,
    rowNumber: number,
  ): Promise<void> {
    const skuCode = (row.sku_code ?? '').trim();
    const warehouseName = (row.warehouse_name ?? '').trim();
    const movementType = inventoryTypeSchema.safeParse((row.type ?? '').trim().toLowerCase());
    const qty = Number(row.qty);
    const refType = (row.ref_type ?? '').trim();
    const refId = (row.ref_id ?? '').trim();
    const note = (row.note ?? '').trim();
    const occurredAt = (row.occurred_at ?? '').trim();

    if (!movementType.success) {
      throw new BadRequestException('type must be in|out|adjust');
    }
    if (warehouseName.length === 0) {
      throw new BadRequestException('warehouse_name is required');
    }
    if (!Number.isInteger(qty)) {
      throw new BadRequestException('qty must be an integer');
    }
    if ((movementType.data === 'in' || movementType.data === 'out') && qty <= 0) {
      throw new BadRequestException('qty must be > 0 for in/out');
    }
    if (movementType.data === 'adjust' && qty === 0) {
      throw new BadRequestException('qty cannot be 0 for adjust');
    }

    const sku = await this.getSkuByCode(tenantId, skuCode);
    if (!sku) {
      throw new BadRequestException(`sku_code not found: ${skuCode}`);
    }

    const warehouse = await this.getOrCreateWarehouseByName(tenantId, warehouseName);

    await this.inventoryService.createMovement(tenantId, actorUserId, {
      warehouse_id: warehouse.id,
      sku_id: sku.id,
      type: movementType.data,
      qty,
      ref_type: refType || 'csv',
      ref_id: refId || `${idempotencyKey}:${rowNumber}`,
      note: note || undefined,
      occurred_at: occurredAt || undefined,
    });
  }

  private async ingestSnapshotRow(tenantId: string, row: CsvRow, importJobId: string): Promise<void> {
    const skuCode = (row.sku_code ?? '').trim();
    const competitorName = (row.competitor_name ?? '').trim();
    const price = Number(row.price);
    const productUrl = (row.product_url ?? '').trim();
    const capturedAt = (row.captured_at ?? '').trim();
    const currency = (row.currency ?? '').trim();

    if (competitorName.length === 0) {
      throw new BadRequestException('competitor_name is required');
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('price must be > 0');
    }
    if (productUrl.length === 0) {
      throw new BadRequestException('product_url is required');
    }

    const sku = await this.getSkuByCode(tenantId, skuCode);
    if (!sku) {
      throw new BadRequestException(`sku_code not found: ${skuCode}`);
    }

    const competitor = await this.getOrCreateCompetitorByName(tenantId, competitorName);
    const competitorItem = await this.getOrCreateCompetitorItem(tenantId, competitor.id, sku.id, productUrl);

    await this.databaseService.query(
      `
      INSERT INTO competitor_snapshots (
        tenant_id,
        competitor_item_id,
        price,
        currency,
        captured_at,
        method,
        evidence_json,
        raw_json
      )
      VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, now()),'csv',$6::jsonb,'{}'::jsonb)
      `,
      [
        tenantId,
        competitorItem.id,
        price,
        currency || 'INR',
        capturedAt || null,
        JSON.stringify({ product_url: productUrl, import_job_id: importJobId }),
      ],
    );
  }

  private async insertImportRow(
    tenantId: string,
    importJobId: string,
    rowNumber: number,
    status: 'success' | 'error',
    errorText: string | null,
    rawRow: CsvRow,
  ): Promise<void> {
    await this.tenantDb.insert<ImportRowRecord>(
      tenantId,
      'import_rows',
      {
        import_job_id: importJobId,
        row_number: rowNumber,
        status,
        error_text: errorText,
        raw_json: rawRow,
      },
      ['id'],
    );
  }

  private async getSkuByCode(tenantId: string, code: string): Promise<SkuRow | null> {
    return this.tenantDb.selectOne<SkuRow>(tenantId, 'skus', { code }, ['id', 'code']);
  }

  private async getOrCreateDealerByName(tenantId: string, name: string): Promise<DealerRow> {
    const existing = await this.tenantDb.selectOne<DealerRow>(tenantId, 'dealers', { name }, ['id', 'name']);
    if (existing) {
      return existing;
    }

    const created = await this.tenantDb.insert<DealerRow>(
      tenantId,
      'dealers',
      { name, status: 'active' },
      ['id', 'name'],
    );

    if (!created) {
      throw new BadRequestException('Failed to create dealer');
    }
    return created;
  }

  private async getOrCreateWarehouseByName(tenantId: string, name: string): Promise<WarehouseRow> {
    const existing = await this.tenantDb.selectOne<WarehouseRow>(tenantId, 'warehouses', { name }, ['id', 'name']);
    if (existing) {
      return existing;
    }

    const created = await this.tenantDb.insert<WarehouseRow>(
      tenantId,
      'warehouses',
      { name, status: 'active' },
      ['id', 'name'],
    );

    if (!created) {
      throw new BadRequestException('Failed to create warehouse');
    }
    return created;
  }

  private async getOrCreateCompetitorByName(tenantId: string, name: string): Promise<CompetitorRow> {
    const existing = await this.tenantDb.selectOne<CompetitorRow>(
      tenantId,
      'competitors',
      { name },
      ['id', 'name'],
    );
    if (existing) {
      return existing;
    }

    const created = await this.tenantDb.insert<CompetitorRow>(
      tenantId,
      'competitors',
      { name, status: 'active' },
      ['id', 'name'],
    );

    if (!created) {
      throw new BadRequestException('Failed to create competitor');
    }
    return created;
  }

  private async getOrCreateCompetitorItem(
    tenantId: string,
    competitorId: string,
    skuId: string,
    productUrl: string,
  ): Promise<CompetitorItemRow> {
    const existing = await this.tenantDb.selectOne<CompetitorItemRow>(
      tenantId,
      'competitor_items',
      { competitor_id: competitorId, sku_id: skuId },
      ['id'],
    );
    if (existing) {
      return existing;
    }

    const created = await this.tenantDb.insert<CompetitorItemRow>(
      tenantId,
      'competitor_items',
      {
        competitor_id: competitorId,
        sku_id: skuId,
        product_url: productUrl,
        selector_json: {},
        status: 'active',
      },
      ['id'],
    );

    if (!created) {
      throw new BadRequestException('Failed to create competitor item');
    }
    return created;
  }
}
