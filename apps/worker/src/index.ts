import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { loadConfig } from '@pharos/config';
import { processProviderSync, type ProviderSyncJob } from './connectors/sync.js';

const startWorker = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.redisUrl) {
    throw new Error('REDIS_URL is required for worker runtime');
  }

  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const worker = new Worker(
    'pharos-queue',
    async (job) => {
      if (job.name === 'competitor.capture') {
        const payload = job.data as {
          tenant_id: string;
          competitor_item_id: string;
          price: number;
          currency?: string;
          captured_at?: string;
          evidence_json?: Record<string, unknown>;
          raw_json?: Record<string, unknown>;
        };

        const itemResult = await pool.query<{ id: string }>(
          `
          SELECT id
          FROM competitor_items
          WHERE tenant_id = $1
            AND id = $2
          LIMIT 1
          `,
          [payload.tenant_id, payload.competitor_item_id],
        );

        if (!itemResult.rows[0]) {
          throw new Error('competitor_item_id not found for tenant');
        }

        await pool.query(
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
          VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), 'worker', $6::jsonb, $7::jsonb)
          `,
          [
            payload.tenant_id,
            payload.competitor_item_id,
            payload.price,
            payload.currency ?? 'INR',
            payload.captured_at ?? null,
            JSON.stringify(payload.evidence_json ?? {}),
            JSON.stringify(payload.raw_json ?? {}),
          ],
        );

        return;
      }

      if (job.name === 'webhook.process') {
        const payload = job.data as {
          tenant_id: string;
          provider: 'shopify' | 'woocommerce' | 'generic_rest';
        };

        await processWebhookEvents(pool, payload.tenant_id, payload.provider);
        return;
      }

      if (job.name === 'provider.sync') {
        const payload = job.data as ProviderSyncJob;
        await processProviderSync(pool, payload);
        return;
      }
    },
    { connection },
  );

  let shuttingDown = false;

  console.log('Worker started');

  worker.on('failed', (job, error) => {
    console.error('Worker job failed', {
      jobId: job?.id,
      name: job?.name,
      message: error.message,
    });
  });

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await worker.close();
      await pool.end();
      await connection.quit();
    } catch {
      await pool.end().catch(() => undefined);
      connection.disconnect();
    }

    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('beforeExit', () => {
    void shutdown();
  });
};

const processWebhookEvents = async (
  pool: Pool,
  tenantId: string,
  provider: 'shopify' | 'woocommerce' | 'generic_rest',
): Promise<void> => {
  const accountRes = await pool.query<{ config_json: Record<string, unknown> }>(
    `
    SELECT config_json
    FROM integration_accounts
    WHERE tenant_id = $1 AND provider = $2
    LIMIT 1
    `,
    [tenantId, provider],
  );
  const accountConfig = accountRes.rows[0]?.config_json ?? {};

  const events = await pool.query<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
  }>(
    `
    SELECT id, event_type, payload_json
    FROM webhook_events
    WHERE tenant_id = $1 AND provider = $2 AND status = 'received'
    ORDER BY received_at ASC
    `,
    [tenantId, provider],
  );

  for (const event of events.rows) {
    try {
      await pool.query('BEGIN');
      const mappedSales = mapWebhookToDealerSales(provider, accountConfig, event.payload_json);
      if (mappedSales.length === 0) {
        throw new Error('No dealer_sales rows could be mapped from payload');
      }

      for (const sale of mappedSales) {
        if (!sale.sku_code || !sale.dealer_name) {
          throw new Error('Mapped sale is missing sku_code or dealer_name');
        }
        if (!Number.isFinite(sale.qty) || sale.qty <= 0 || !Number.isInteger(sale.qty)) {
          throw new Error('Mapped qty must be positive integer');
        }
        if (!Number.isFinite(sale.sale_price) || sale.sale_price <= 0) {
          throw new Error('Mapped sale_price must be positive');
        }

        const skuRes = await pool.query<{ id: string }>(
          `SELECT id FROM skus WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
          [tenantId, sale.sku_code],
        );
        const skuId = skuRes.rows[0]?.id;
        if (!skuId) {
          throw new Error(`SKU not found for code ${sale.sku_code}`);
        }

        const dealerId = await getOrCreateDealer(pool, tenantId, sale.dealer_name);
        await pool.query(
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
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            tenantId,
            dealerId,
            skuId,
            sale.sale_price,
            sale.qty,
            sale.sale_date,
            provider,
            sale.ref_no ?? null,
          ],
        );
      }

      await pool.query(
        `
        UPDATE webhook_events
        SET status = 'processed', processed_at = now(), error_text = null
        WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, event.id],
      );

      await insertAudit(pool, tenantId, 'webhook.processed', 'webhook_event', event.id, {
        provider,
        event_type: event.event_type,
      });

      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      const errorText = error instanceof Error ? error.message : 'webhook_process_error';

      await pool.query(
        `
        UPDATE webhook_events
        SET status = 'failed', processed_at = now(), error_text = $3
        WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, event.id, errorText],
      );

      await insertAudit(pool, tenantId, 'webhook.failed', 'webhook_event', event.id, {
        provider,
        error: errorText,
      });
    }
  }
};

type MappedSale = {
  dealer_name: string;
  sku_code: string;
  qty: number;
  sale_price: number;
  sale_date: string;
  ref_no?: string;
};

const mapWebhookToDealerSales = (
  provider: 'shopify' | 'woocommerce' | 'generic_rest',
  config: Record<string, unknown>,
  payload: Record<string, unknown>,
): MappedSale[] => {
  const mappingRaw = readPath(config, 'order_mapping');
  const mapping = isRecord(mappingRaw) ? mappingRaw : {};

  const dealerKey = readString(mapping, 'dealer_name_key') ?? 'dealer_name';
  const saleDateKey = readString(mapping, 'sale_date_key') ?? 'sale_date';
  const refNoKey = readString(mapping, 'ref_no_key') ?? 'ref_no';
  const itemsKey = readString(mapping, 'items_key') ?? 'items';
  const itemSkuKey = readString(mapping, 'item_sku_code_key') ?? 'sku_code';
  const itemQtyKey = readString(mapping, 'item_qty_key') ?? 'qty';
  const itemPriceKey = readString(mapping, 'item_price_key') ?? 'sale_price';

  const dealerName = toStringSafe(readPath(payload, dealerKey)) ?? `${provider}-dealer`;
  const saleDate = normalizeDate(toStringSafe(readPath(payload, saleDateKey)));
  const refNo = toStringSafe(readPath(payload, refNoKey));

  const itemsRaw = readPath(payload, itemsKey);
  if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
    const sales: MappedSale[] = [];
    for (const item of itemsRaw) {
      if (!isRecord(item)) {
        continue;
      }
      const skuCode = toStringSafe(readPath(item, itemSkuKey)) ?? '';
      const qty = Number(readPath(item, itemQtyKey));
      const salePrice = Number(readPath(item, itemPriceKey));
      const mapped: MappedSale = {
        dealer_name: dealerName,
        sku_code: skuCode,
        qty,
        sale_price: salePrice,
        sale_date: saleDate,
      };
      if (refNo) {
        mapped.ref_no = refNo;
      }
      sales.push(mapped);
    }
    return sales;
  }

  const skuCode = toStringSafe(readPath(payload, itemSkuKey)) ?? '';
  const qty = Number(readPath(payload, itemQtyKey));
  const salePrice = Number(readPath(payload, itemPriceKey));
  const mapped: MappedSale = {
    dealer_name: dealerName,
    sku_code: skuCode,
    qty,
    sale_price: salePrice,
    sale_date: saleDate,
  };
  if (refNo) {
    mapped.ref_no = refNo;
  }
  return [mapped];
};

const readPath = (obj: unknown, path: string): unknown => {
  if (!path || !isRecord(obj)) {
    return undefined;
  }
  const parts = path.split('.').map((part) => part.trim()).filter((part) => part.length > 0);
  let current: unknown = obj;
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (obj: Record<string, unknown>, key: string): string | null => {
  const value = obj[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const toStringSafe = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeDate = (value: string | null): string => {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date().toISOString().slice(0, 10);
};

const getOrCreateDealer = async (pool: Pool, tenantId: string, name: string): Promise<string> => {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM dealers WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tenantId, name],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const created = await pool.query<{ id: string }>(
    `
    INSERT INTO dealers (tenant_id, name, status)
    VALUES ($1,$2,'active')
    RETURNING id
    `,
    [tenantId, name],
  );
  const id = created.rows[0]?.id;
  if (!id) {
    throw new Error('Failed to create dealer from webhook');
  }
  return id;
};

const insertAudit = async (
  pool: Pool,
  tenantId: string,
  action: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await pool.query(
    `
    INSERT INTO audit_logs (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      payload_json
    )
    VALUES ($1, null, $2, $3, $4, $5::jsonb)
    `,
    [tenantId, action, entityType, entityId, JSON.stringify(payload)],
  );
};

startWorker().catch((error: unknown) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});
