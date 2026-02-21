import { Pool } from 'pg';

export type Provider = 'shopify' | 'woocommerce' | 'generic_rest';
export type Resource = 'orders' | 'inventory' | 'products' | 'competitor';
export type SyncMode = 'full' | 'incremental';

export type ProviderSyncJob = {
  tenant_id: string;
  provider: Provider;
  resource: Resource;
  mode: SyncMode;
};

type SyncStats = {
  fetched: number;
  inserted: number;
  skipped: number;
  errors: number;
};

type IntegrationAccountRow = {
  config_json: Record<string, unknown>;
};

export const processProviderSync = async (pool: Pool, job: ProviderSyncJob): Promise<void> => {
  const runId = await startRun(pool, job);
  await insertAudit(pool, job.tenant_id, 'sync.started', 'sync_run', runId, {
    provider: job.provider,
    resource: job.resource,
    mode: job.mode,
  });

  try {
    const account = await getAccount(pool, job.tenant_id, job.provider);
    if (!account) {
      throw new Error('integration account config not found');
    }

    const stats: SyncStats = { fetched: 0, inserted: 0, skipped: 0, errors: 0 };

    if (job.resource === 'orders') {
      await syncOrders(pool, job, account.config_json, stats);
    } else if (job.resource === 'inventory') {
      await syncInventory(pool, job, account.config_json, stats);
    } else if (job.resource === 'competitor') {
      await syncCompetitor(pool, job, account.config_json, stats);
    } else {
      // products are intentionally read-only placeholder for V1.
    }

    const status = stats.errors > 0 && stats.inserted > 0 ? 'partial' : stats.errors > 0 ? 'failed' : 'success';
    await finishRun(pool, runId, status, stats, null);

    if (status === 'failed') {
      await insertAudit(pool, job.tenant_id, 'sync.failed', 'sync_run', runId, {
        provider: job.provider,
        resource: job.resource,
        stats,
      });
    } else {
      await insertAudit(pool, job.tenant_id, 'sync.completed', 'sync_run', runId, {
        provider: job.provider,
        resource: job.resource,
        status,
        stats,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_failed';
    await finishRun(pool, runId, 'failed', { fetched: 0, inserted: 0, skipped: 0, errors: 1 }, message);
    await insertAudit(pool, job.tenant_id, 'sync.failed', 'sync_run', runId, {
      provider: job.provider,
      resource: job.resource,
      error: message,
    });
    throw error;
  }
};

const syncOrders = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  if (job.provider === 'shopify') {
    await syncShopifyOrders(pool, job, config, stats);
    return;
  }
  if (job.provider === 'woocommerce') {
    await syncWooOrders(pool, job, config, stats);
    return;
  }
  await syncGenericOrders(pool, job, config, stats);
};

const syncInventory = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  if (job.provider !== 'generic_rest') {
    return;
  }

  const endpoints = readRecord(config, 'endpoints');
  const mappings = readRecord(config, 'mappings');
  const endpoint = endpoints ? readRecord(endpoints, 'inventory') : null;
  const mapping = mappings ? readRecord(mappings, 'inventory') : null;
  if (!endpoint || !mapping) {
    return;
  }

  const items = await fetchGenericItems(endpoint);
  for (const item of items) {
    stats.fetched += 1;
    try {
      const warehouseName = stringPath(item, readString(mapping, 'warehouse_name') ?? 'warehouse');
      const skuCode = stringPath(item, readString(mapping, 'sku_code') ?? 'sku');
      const onHand = numberPath(item, readString(mapping, 'on_hand') ?? 'on_hand');
      const externalId = stringPath(item, readString(mapping, 'external_id') ?? 'id');

      if (!warehouseName || !skuCode || onHand === null || !Number.isFinite(onHand)) {
        stats.errors += 1;
        continue;
      }
      const onHandValue = Math.trunc(onHand);

      const warehouseId = await getOrCreateWarehouse(pool, job.tenant_id, warehouseName);
      const skuId = await findSkuId(pool, job.tenant_id, skuCode);
      if (!skuId) {
        stats.errors += 1;
        continue;
      }

      const current = await pool.query<{ on_hand: number; reserved: number }>(
        `
        SELECT on_hand, reserved
        FROM inventory_balances
        WHERE tenant_id = $1 AND warehouse_id = $2 AND sku_id = $3
        LIMIT 1
        `,
        [job.tenant_id, warehouseId, skuId],
      );
      const currentOnHand = current.rows[0]?.on_hand ?? 0;
      const reserved = current.rows[0]?.reserved ?? 0;
      const delta = onHandValue - currentOnHand;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `
          INSERT INTO inventory_balances (tenant_id, warehouse_id, sku_id, on_hand, reserved, updated_at)
          VALUES ($1,$2,$3,$4,$5,now())
          ON CONFLICT (tenant_id, warehouse_id, sku_id)
          DO UPDATE SET on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved, updated_at = now()
          `,
          [job.tenant_id, warehouseId, skuId, onHandValue, reserved],
        );

        if (delta !== 0) {
          await client.query(
            `
            INSERT INTO inventory_movements (
              tenant_id, warehouse_id, sku_id, type, qty, ref_type, ref_id, note, occurred_at
            )
            VALUES ($1,$2,$3,'adjust',$4,'sync',$5,$6,now())
            `,
            [job.tenant_id, warehouseId, skuId, delta, externalId ?? `sync-${Date.now()}`, 'connector set'],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      stats.inserted += 1;
    } catch {
      stats.errors += 1;
    }
  }
};

const syncCompetitor = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  if (job.provider !== 'generic_rest') {
    return;
  }
  const endpoints = readRecord(config, 'endpoints');
  const mappings = readRecord(config, 'mappings');
  const endpoint = endpoints ? readRecord(endpoints, 'competitor') : null;
  const mapping = mappings ? readRecord(mappings, 'competitor') : null;
  if (!endpoint || !mapping) {
    return;
  }

  const items = await fetchGenericItems(endpoint);
  for (const item of items) {
    stats.fetched += 1;
    try {
      const competitorName = stringPath(item, readString(mapping, 'competitor_name') ?? 'competitor_name');
      const skuCode = stringPath(item, readString(mapping, 'sku_code') ?? 'sku');
      const productUrl = stringPath(item, readString(mapping, 'product_url') ?? 'product_url');
      const price = numberPath(item, readString(mapping, 'price') ?? 'price');
      const capturedAt = stringPath(item, readString(mapping, 'captured_at') ?? 'captured_at');

      if (!competitorName || !skuCode || !productUrl || !Number.isFinite(price)) {
        stats.errors += 1;
        continue;
      }

      const skuId = await findSkuId(pool, job.tenant_id, skuCode);
      if (!skuId) {
        stats.errors += 1;
        continue;
      }

      const competitorId = await getOrCreateCompetitor(pool, job.tenant_id, competitorName);
      const itemId = await getOrCreateCompetitorItem(pool, job.tenant_id, competitorId, skuId, productUrl);
      await pool.query(
        `
        INSERT INTO competitor_snapshots (
          tenant_id, competitor_item_id, price, currency, captured_at, method, evidence_json, raw_json
        )
        VALUES ($1,$2,$3,'INR',COALESCE($4::timestamptz,now()),'api',$5::jsonb,$6::jsonb)
        `,
        [
          job.tenant_id,
          itemId,
          price,
          capturedAt ?? null,
          JSON.stringify({ product_url: productUrl }),
          JSON.stringify(item),
        ],
      );
      stats.inserted += 1;
    } catch {
      stats.errors += 1;
    }
  }
};

const syncShopifyOrders = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  const shopDomain = readString(config, 'shop_domain');
  const accessToken = readString(config, 'access_token');
  if (!shopDomain || !accessToken) {
    throw new Error('shopify config missing shop_domain/access_token');
  }

  const cursor = job.mode === 'full' ? '0' : (await getCursor(pool, job.tenant_id, job.provider, 'orders')) ?? '0';
  let sinceId = Number.parseInt(cursor, 10);
  let keepGoing = true;

  while (keepGoing) {
    const url = new URL(`https://${shopDomain}/admin/api/2024-10/orders.json`);
    url.searchParams.set('status', 'any');
    url.searchParams.set('limit', '50');
    url.searchParams.set('since_id', Number.isFinite(sinceId) ? String(sinceId) : '0');

    const response = await requestWithRetry(url.toString(), {
      headers: { 'X-Shopify-Access-Token': accessToken, Accept: 'application/json' },
    });
    const data = (await response.json()) as { orders?: Array<Record<string, unknown>> };
    const orders = Array.isArray(data.orders) ? data.orders : [];

    if (orders.length === 0) {
      keepGoing = false;
      break;
    }

    for (const order of orders) {
      stats.fetched += 1;
      const orderId = Number(order.id);
      if (Number.isFinite(orderId) && orderId > sinceId) {
        sinceId = orderId;
      }
      await ingestOrder(pool, job.tenant_id, 'shopify', order, stats, config);
    }

    if (orders.length < 50) {
      keepGoing = false;
    }
  }

  await setCursor(pool, job.tenant_id, job.provider, 'orders', 'since_id', String(sinceId));
};

const syncWooOrders = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  const baseUrl = readString(config, 'base_url');
  const consumerKey = readString(config, 'consumer_key');
  const consumerSecret = readString(config, 'consumer_secret');
  if (!baseUrl || !consumerKey || !consumerSecret) {
    throw new Error('woocommerce config missing base_url/consumer_key/consumer_secret');
  }

  const cursor = job.mode === 'full' ? null : await getCursor(pool, job.tenant_id, job.provider, 'orders');
  let page = 1;
  let latestTs = cursor ?? '';

  let hasMore = true;
  while (hasMore) {
    const url = new URL('/wp-json/wc/v3/orders', baseUrl);
    url.searchParams.set('consumer_key', consumerKey);
    url.searchParams.set('consumer_secret', consumerSecret);
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));
    if (cursor) {
      url.searchParams.set('after', cursor);
    }

    const response = await requestWithRetry(url.toString(), { headers: { Accept: 'application/json' } });
    const orders = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(orders) || orders.length === 0) {
      hasMore = false;
      break;
    }

    for (const order of orders) {
      stats.fetched += 1;
      const ts = stringPath(order, 'date_created_gmt') ?? stringPath(order, 'date_created');
      if (ts && ts > latestTs) {
        latestTs = ts;
      }
      await ingestOrder(pool, job.tenant_id, 'woocommerce', order, stats, config);
    }

    if (orders.length < 50) {
      hasMore = false;
      break;
    }
    page += 1;
  }

  if (latestTs) {
    await setCursor(pool, job.tenant_id, job.provider, 'orders', 'since_ts', latestTs);
  }
};

const syncGenericOrders = async (
  pool: Pool,
  job: ProviderSyncJob,
  config: Record<string, unknown>,
  stats: SyncStats,
): Promise<void> => {
  const endpoints = readRecord(config, 'endpoints');
  const mappings = readRecord(config, 'mappings');
  const endpoint = endpoints ? readRecord(endpoints, 'orders') : null;
  const mapping = mappings ? readRecord(mappings, 'orders') : null;
  if (!endpoint || !mapping) {
    throw new Error('generic_rest orders endpoint/mapping missing');
  }

  const items = await fetchGenericItems(endpoint);
  let latestTs = job.mode === 'full' ? '' : (await getCursor(pool, job.tenant_id, 'generic_rest', 'orders')) ?? '';
  for (const item of items) {
    stats.fetched += 1;
    const ts = stringPath(item, readString(mapping, 'date') ?? 'created_at') ?? '';
    if (latestTs && ts && ts <= latestTs && job.mode === 'incremental') {
      stats.skipped += 1;
      continue;
    }
    if (ts > latestTs) {
      latestTs = ts;
    }
    await ingestOrder(pool, job.tenant_id, 'generic_rest', item, stats, config);
  }
  if (latestTs) {
    await setCursor(pool, job.tenant_id, 'generic_rest', 'orders', 'since_ts', latestTs);
  }
};

const ingestOrder = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
  order: Record<string, unknown>,
  stats: SyncStats,
  config: Record<string, unknown>,
): Promise<void> => {
  const orderId = stringPath(order, 'id') ?? stringPath(order, 'order_id') ?? String(Date.now());
  const orderNumber = stringPath(order, 'name') ?? stringPath(order, 'number') ?? orderId;
  const orderDateRaw =
    stringPath(order, 'created_at') ??
    stringPath(order, 'date_created') ??
    stringPath(order, 'date_created_gmt') ??
    new Date().toISOString();
  const saleDate = orderDateRaw.slice(0, 10);

  const dealerName = resolveDealerName(provider, order, config);
  const dealerId = await getOrCreateDealer(pool, tenantId, dealerName);

  const linesRaw = readPath(order, 'line_items');
  const lines = Array.isArray(linesRaw)
    ? linesRaw.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    : [order];

  let index = 0;
  for (const line of lines) {
    index += 1;
    const lineId = stringPath(line, 'id') ?? String(index);
    const extId = `${orderId}:${lineId}`;
    const exists = await hasExternalId(pool, tenantId, provider, 'order_line', extId);
    if (exists) {
      stats.skipped += 1;
      continue;
    }

    const skuCode = stringPath(line, 'sku') ?? stringPath(line, 'sku_code');
    if (!skuCode) {
      stats.errors += 1;
      continue;
    }
    const skuId = await findSkuId(pool, tenantId, skuCode);
    if (!skuId) {
      stats.errors += 1;
      continue;
    }

    const qty = Math.trunc(numberPath(line, 'quantity') ?? numberPath(line, 'qty') ?? 0);
    const price =
      numberPath(line, 'price') ??
      numberPath(line, 'price_set.shop_money.amount') ??
      numberPath(line, 'total') ??
      0;

    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0 || price <= 0) {
      stats.errors += 1;
      continue;
    }

    const sale = await pool.query<{ id: string }>(
      `
      INSERT INTO dealer_sales (tenant_id, dealer_id, sku_id, sale_price, qty, sale_date, source, ref_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
      `,
      [tenantId, dealerId, skuId, price, qty, saleDate, provider, orderNumber],
    );
    const saleId = sale.rows[0]?.id;
    if (!saleId) {
      stats.errors += 1;
      continue;
    }
    await upsertExternalId(pool, tenantId, provider, 'order_line', extId, saleId);
    stats.inserted += 1;
  }
};

const resolveDealerName = (
  provider: Provider,
  order: Record<string, unknown>,
  config: Record<string, unknown>,
): string => {
  if (provider !== 'shopify') {
    return (
      stringPath(order, 'billing.company') ??
      stringPath(order, 'shipping.company') ??
      stringPath(order, 'customer_name') ??
      provider.toUpperCase()
    );
  }

  const strategy = readString(config, 'dealer_name_strategy') ?? 'billing_company';
  if (strategy === 'static') {
    return readString(config, 'static_dealer_name') ?? 'Shopify D2C';
  }
  if (strategy === 'shipping_company') {
    return stringPath(order, 'shipping_address.company') ?? 'Shopify';
  }
  if (strategy === 'email_domain') {
    const email = stringPath(order, 'email');
    if (email && email.includes('@')) {
      return email.split('@')[1] ?? 'Shopify';
    }
    return 'Shopify';
  }

  return (
    stringPath(order, 'billing_address.company') ??
    stringPath(order, 'shipping_address.company') ??
    'Shopify'
  );
};

const requestWithRetry = async (
  input: string,
  init: RequestInit,
  maxAttempts = 5,
): Promise<Response> => {
  let attempt = 0;
  let waitMs = 500;

  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await fetch(input, init);
    if (response.status !== 429 && response.status < 500) {
      return response;
    }

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : 0;
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
    await sleep(delayMs);
    waitMs = Math.min(waitMs * 2, 10_000);
  }

  throw new Error(`request failed after retries: ${input}`);
};

const fetchGenericItems = async (endpoint: Record<string, unknown>): Promise<Record<string, unknown>[]> => {
  const url = readString(endpoint, 'url');
  if (!url) {
    return [];
  }
  const method = (readString(endpoint, 'method') ?? 'GET').toUpperCase();
  const headersObj = readRecord(endpoint, 'headers') ?? {};
  const headers = Object.fromEntries(
    Object.entries(headersObj).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;

  const response = await requestWithRetry(url, { method, headers: { Accept: 'application/json', ...headers } });
  const json = (await response.json()) as unknown;

  if (Array.isArray(json)) {
    return json.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
  }
  if (json && typeof json === 'object') {
    const data = (json as Record<string, unknown>).items;
    if (Array.isArray(data)) {
      return data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
    }
  }
  return [];
};

const getAccount = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
): Promise<IntegrationAccountRow | null> => {
  const result = await pool.query<IntegrationAccountRow>(
    `
    SELECT config_json
    FROM integration_accounts
    WHERE tenant_id = $1 AND provider = $2 AND status = 'active'
    LIMIT 1
    `,
    [tenantId, provider],
  );
  return result.rows[0] ?? null;
};

const hasExternalId = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
  resource: string,
  externalId: string,
): Promise<boolean> => {
  const result = await pool.query<{ external_id: string }>(
    `
    SELECT external_id
    FROM external_id_map
    WHERE tenant_id = $1 AND provider = $2 AND resource = $3 AND external_id = $4
    LIMIT 1
    `,
    [tenantId, provider, resource, externalId],
  );
  return Boolean(result.rows[0]);
};

const upsertExternalId = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
  resource: string,
  externalId: string,
  internalId: string,
): Promise<void> => {
  await pool.query(
    `
    INSERT INTO external_id_map (tenant_id, provider, resource, external_id, internal_id)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (tenant_id, provider, resource, external_id)
    DO UPDATE SET internal_id = EXCLUDED.internal_id
    `,
    [tenantId, provider, resource, externalId, internalId],
  );
};

const getCursor = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
  resource: Resource,
): Promise<string | null> => {
  const result = await pool.query<{ cursor_value: string }>(
    `
    SELECT cursor_value
    FROM sync_state
    WHERE tenant_id = $1 AND provider = $2 AND resource = $3
    LIMIT 1
    `,
    [tenantId, provider, resource],
  );
  return result.rows[0]?.cursor_value ?? null;
};

const setCursor = async (
  pool: Pool,
  tenantId: string,
  provider: Provider,
  resource: Resource,
  cursorType: 'since_id' | 'since_ts' | 'page' | 'cursor',
  cursorValue: string,
): Promise<void> => {
  await pool.query(
    `
    INSERT INTO sync_state (tenant_id, provider, resource, cursor_type, cursor_value, updated_at)
    VALUES ($1,$2,$3,$4,$5,now())
    ON CONFLICT (tenant_id, provider, resource)
    DO UPDATE SET cursor_type = EXCLUDED.cursor_type, cursor_value = EXCLUDED.cursor_value, updated_at = now()
    `,
    [tenantId, provider, resource, cursorType, cursorValue],
  );
};

const startRun = async (pool: Pool, job: ProviderSyncJob): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO sync_runs (tenant_id, provider, resource, status)
    VALUES ($1,$2,$3,'running')
    RETURNING id
    `,
    [job.tenant_id, job.provider, job.resource],
  );
  const runId = result.rows[0]?.id;
  if (!runId) {
    throw new Error('failed to create sync run');
  }
  return runId;
};

const finishRun = async (
  pool: Pool,
  runId: string,
  status: 'success' | 'partial' | 'failed',
  stats: SyncStats,
  errorText: string | null,
): Promise<void> => {
  await pool.query(
    `
    UPDATE sync_runs
    SET status = $2, completed_at = now(), stats_json = $3::jsonb, error_text = $4
    WHERE id = $1
    `,
    [runId, status, JSON.stringify(stats), errorText],
  );
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
    throw new Error('failed to upsert dealer');
  }
  return id;
};

const getOrCreateWarehouse = async (pool: Pool, tenantId: string, name: string): Promise<string> => {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM warehouses WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tenantId, name],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }
  const created = await pool.query<{ id: string }>(
    `INSERT INTO warehouses (tenant_id, name, status) VALUES ($1,$2,'active') RETURNING id`,
    [tenantId, name],
  );
  const id = created.rows[0]?.id;
  if (!id) {
    throw new Error('failed to upsert warehouse');
  }
  return id;
};

const getOrCreateCompetitor = async (pool: Pool, tenantId: string, name: string): Promise<string> => {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM competitors WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tenantId, name],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }
  const created = await pool.query<{ id: string }>(
    `INSERT INTO competitors (tenant_id, name, status) VALUES ($1,$2,'active') RETURNING id`,
    [tenantId, name],
  );
  const id = created.rows[0]?.id;
  if (!id) {
    throw new Error('failed to upsert competitor');
  }
  return id;
};

const getOrCreateCompetitorItem = async (
  pool: Pool,
  tenantId: string,
  competitorId: string,
  skuId: string,
  productUrl: string,
): Promise<string> => {
  const existing = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM competitor_items
    WHERE tenant_id = $1 AND competitor_id = $2 AND sku_id = $3
    LIMIT 1
    `,
    [tenantId, competitorId, skuId],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }
  const created = await pool.query<{ id: string }>(
    `
    INSERT INTO competitor_items (tenant_id, competitor_id, sku_id, product_url, selector_json, status)
    VALUES ($1,$2,$3,$4,'{}'::jsonb,'active')
    RETURNING id
    `,
    [tenantId, competitorId, skuId, productUrl],
  );
  const id = created.rows[0]?.id;
  if (!id) {
    throw new Error('failed to create competitor item');
  }
  return id;
};

const findSkuId = async (pool: Pool, tenantId: string, code: string): Promise<string | null> => {
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM skus
    WHERE tenant_id = $1 AND code = $2
    LIMIT 1
    `,
    [tenantId, code],
  );
  return result.rows[0]?.id ?? null;
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
    INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, payload_json)
    VALUES ($1, null, $2, $3, $4, $5::jsonb)
    `,
    [tenantId, action, entityType, entityId, JSON.stringify(payload)],
  );
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

const stringPath = (obj: Record<string, unknown>, path: string): string | null => {
  const value = readPath(obj, path);
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const numberPath = (obj: Record<string, unknown>, path: string): number | null => {
  const value = readPath(obj, path);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readString = (obj: Record<string, unknown>, key: string): string | null => {
  const value = obj[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const readRecord = (obj: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const value = obj[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const __testUtils = {
  ingestOrder,
  setCursor,
  getCursor,
  findSkuId,
  hasExternalId,
  upsertExternalId,
  startRun,
  finishRun,
  requestWithRetry,
};
