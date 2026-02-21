import 'dotenv/config';
import { createServer, type Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { processProviderSync, type ProviderSyncJob } from '../src/connectors/sync';

describe('provider.sync', () => {
  let pool: Pool;
  let tenantId = '';
  let server: Server;
  let baseUrl = '';
  let payloadRef: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const tenantRes = await pool.query<{ id: string }>(
      "select id from tenants where slug = 'shakti' limit 1",
    );
    tenantId = tenantRes.rows[0]?.id ?? '';
    expect(tenantId).toBeTruthy();

    server = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payloadRef));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to start test http server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('delete from dealer_sales where tenant_id = $1 and source = $2', [tenantId, 'generic_rest']);
    await pool.query('delete from external_id_map where tenant_id = $1 and provider = $2', [tenantId, 'generic_rest']);
    await pool.query('delete from sync_state where tenant_id = $1 and provider = $2', [tenantId, 'generic_rest']);
    await pool.query('delete from sync_runs where tenant_id = $1 and provider = $2', [tenantId, 'generic_rest']);
    await pool.query(
      `
      insert into integration_accounts (tenant_id, provider, status, config_json)
      values ($1, 'generic_rest', 'active', $2::jsonb)
      on conflict (tenant_id, provider)
      do update set status = 'active', config_json = excluded.config_json, updated_at = now()
      `,
      [
        tenantId,
        JSON.stringify({
          endpoints: {
            orders: { url: `${baseUrl}/orders`, method: 'GET' },
          },
          mappings: {
            orders: {
              external_id: 'id',
              date: 'created_at',
            },
          },
        }),
      ],
    );
  });

  const runOrdersSync = async (mode: 'full' | 'incremental'): Promise<void> => {
    const job: ProviderSyncJob = {
      tenant_id: tenantId,
      provider: 'generic_rest',
      resource: 'orders',
      mode,
    };
    await processProviderSync(pool, job);
  };

  it('sync orders twice does not duplicate dealer_sales', async () => {
    payloadRef = [
      {
        id: 'O-100',
        created_at: '2026-02-20T10:00:00.000Z',
        customer_name: 'Sync Dealer',
        line_items: [{ id: 'L-1', sku: 'SKU-118', quantity: 2, price: 70 }],
      },
    ];

    await runOrdersSync('full');
    await runOrdersSync('incremental');

    const res = await pool.query<{ count: string }>(
      `
      select count(*)::text as count
      from dealer_sales
      where tenant_id = $1 and source = 'generic_rest' and ref_no = 'O-100'
      `,
      [tenantId],
    );
    expect(Number(res.rows[0]?.count ?? '0')).toBe(1);
  });

  it('stores and uses cursor for incremental mode', async () => {
    payloadRef = [
      {
        id: 'O-200',
        created_at: '2026-02-19T10:00:00.000Z',
        customer_name: 'Cursor Dealer',
        line_items: [{ id: 'L-1', sku: 'SKU-118', quantity: 1, price: 68 }],
      },
    ];
    await runOrdersSync('full');

    const cursorAfterFirst = await pool.query<{ cursor_value: string }>(
      `
      select cursor_value
      from sync_state
      where tenant_id = $1 and provider = 'generic_rest' and resource = 'orders'
      `,
      [tenantId],
    );
    expect(cursorAfterFirst.rows[0]?.cursor_value).toBe('2026-02-19T10:00:00.000Z');

    await runOrdersSync('incremental');

    const res = await pool.query<{ count: string }>(
      `
      select count(*)::text as count
      from dealer_sales
      where tenant_id = $1 and source = 'generic_rest' and ref_no = 'O-200'
      `,
      [tenantId],
    );
    expect(Number(res.rows[0]?.count ?? '0')).toBe(1);
  });

  it('records failed sync run with error_text', async () => {
    await pool.query(
      `
      update integration_accounts
      set config_json = $2::jsonb
      where tenant_id = $1 and provider = 'generic_rest'
      `,
      [tenantId, JSON.stringify({ endpoints: {}, mappings: {} })],
    );

    await expect(runOrdersSync('incremental')).rejects.toThrow();

    const run = await pool.query<{ status: string; error_text: string | null }>(
      `
      select status, error_text
      from sync_runs
      where tenant_id = $1 and provider = 'generic_rest' and resource = 'orders'
      order by started_at desc
      limit 1
      `,
      [tenantId],
    );
    expect(run.rows[0]?.status).toBe('failed');
    expect(run.rows[0]?.error_text).toBeTruthy();
  });

  it('increments errors when sku_code is missing in internal system', async () => {
    payloadRef = [
      {
        id: 'O-404',
        created_at: '2026-02-21T10:00:00.000Z',
        customer_name: 'Missing SKU Dealer',
        line_items: [{ id: 'L-1', sku: 'SKU-NOT-FOUND', quantity: 1, price: 99 }],
      },
    ];

    await runOrdersSync('full');

    const run = await pool.query<{ stats_json: Record<string, unknown> }>(
      `
      select stats_json
      from sync_runs
      where tenant_id = $1 and provider = 'generic_rest' and resource = 'orders'
      order by started_at desc
      limit 1
      `,
      [tenantId],
    );
    const stats = run.rows[0]?.stats_json ?? {};
    expect(Number(stats.errors ?? 0)).toBeGreaterThan(0);
  });
});
