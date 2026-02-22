import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';

type ImportJobResponse = {
  job: {
    id: string;
    type: string;
    status: 'success' | 'partial' | 'failed';
    successRows: number;
    errorRows: number;
  };
  rows: Array<{
    rowNumber: number;
    status: 'success' | 'error';
    errorText: string | null;
  }>;
};

describe('Phase 6 Step 1 - Integrations V1', () => {
  let app: INestApplication;
  let ownerToken = '';
  let pool: Pool;
  let tenantId = '';
  let sku118Id = '';
  let sku777Id = '';
  let whDelhiId = '';

  const inferTenantSlug = (email: string): string =>
    email.endsWith('@vikram.test') ? 'vikram' : 'shakti';

  const login = async (email: string, tenantSlug = inferTenantSlug(email)): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login')
      .set('x-tenant', tenantSlug)
      .send({
      email,
      password: 'Admin@12345',
    });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for integrations-imports tests');
    }
    pool = new Pool({ connectionString: databaseUrl });

    app = await NestFactory.create(AppModule);
    await app.init();
    ownerToken = await login('owner@shakti.test');

    const tenantRes = await pool.query<{ id: string }>(
      "select id from tenants where slug = 'shakti' limit 1",
    );
    tenantId = tenantRes.rows[0]?.id ?? '';
    expect(tenantId.length).toBeGreaterThan(0);

    const skuRes = await pool.query<{ id: string; code: string }>(
      `select id, code
       from skus
       where tenant_id = $1 and code in ('SKU-118', 'SKU-777')`,
      [tenantId],
    );
    sku118Id = skuRes.rows.find((row) => row.code === 'SKU-118')?.id ?? '';
    sku777Id = skuRes.rows.find((row) => row.code === 'SKU-777')?.id ?? '';
    expect(sku118Id.length).toBeGreaterThan(0);
    expect(sku777Id.length).toBeGreaterThan(0);

    const warehouseRes = await pool.query<{ id: string }>(
      `select id from warehouses where tenant_id = $1 and name = 'Delhi WH-01' limit 1`,
      [tenantId],
    );
    whDelhiId = warehouseRes.rows[0]?.id ?? '';
    expect(whDelhiId.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('CSV dealer_sales import inserts rows and creates dealer if missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/imports/start')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'dealer_sales',
        idempotency_key: 'csv-dealer-sales-001',
        file_name: 'dealer_sales.csv',
        csv_text:
          'sku_code,dealer_name,sale_price,qty,sale_date,ref_no\nSKU-118,Dealer CSV One,72,5,2026-02-20,CSV-001',
      });

    expect(response.status).toBe(201);
    const importJobId = response.body.import_job_id as string;
    expect(importJobId.length).toBeGreaterThan(0);

    const jobRes = await request(app.getHttpServer())
      .get(`/imports/${importJobId}`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect(jobRes.status).toBe(200);
    const job = jobRes.body as ImportJobResponse;
    expect(job.job.status).toBe('success');
    expect(job.job.successRows).toBe(1);
    expect(job.job.errorRows).toBe(0);

    const dealerRes = await pool.query<{ id: string }>(
      `select id from dealers where tenant_id = $1 and name = 'Dealer CSV One' limit 1`,
      [tenantId],
    );
    expect(dealerRes.rows[0]?.id).toBeTruthy();

    const salesRes = await pool.query<{ ref_no: string | null; source: string }>(
      `
      select ref_no, source
      from dealer_sales
      where tenant_id = $1 and sku_id = $2 and sale_date = $3
      `,
      [tenantId, sku118Id, '2026-02-20'],
    );
    expect(salesRes.rows.some((sale) => sale.ref_no === 'CSV-001' && sale.source === 'csv')).toBe(
      true,
    );
  });

  it('Inventory movements CSV updates balances and prevents negative stock', async () => {
    const beforeBalanceRes = await pool.query<{ on_hand: number }>(
      `select on_hand
       from inventory_balances
       where tenant_id = $1 and warehouse_id = $2 and sku_id = $3`,
      [tenantId, whDelhiId, sku777Id],
    );
    const beforeOnHand = beforeBalanceRes.rows[0]?.on_hand ?? 0;

    const response = await request(app.getHttpServer())
      .post('/imports/start')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'inventory_movements',
        idempotency_key: 'csv-inventory-001',
        file_name: 'inventory.csv',
        csv_text:
          'sku_code,warehouse_name,type,qty,ref_type,ref_id,note,occurred_at\nSKU-777,Delhi WH-01,out,5,,,valid out,2026-02-21T00:00:00.000Z\nSKU-777,Delhi WH-01,out,1000,,,invalid out,2026-02-21T00:10:00.000Z',
      });

    expect(response.status).toBe(201);
    const importJobId = response.body.import_job_id as string;

    const jobRes = await request(app.getHttpServer())
      .get(`/imports/${importJobId}`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect(jobRes.status).toBe(200);
    const job = jobRes.body as ImportJobResponse;
    expect(job.job.status).toBe('partial');
    expect(job.job.successRows).toBe(1);
    expect(job.job.errorRows).toBe(1);
    expect(job.rows.some((row) => row.status === 'error' && row.errorText !== null)).toBe(true);

    const balanceRes = await pool.query<{ on_hand: number }>(
      `select on_hand
       from inventory_balances
       where tenant_id = $1 and warehouse_id = $2 and sku_id = $3`,
      [tenantId, whDelhiId, sku777Id],
    );
    expect(balanceRes.rows[0]?.on_hand).toBe(beforeOnHand - 5);
  });

  it('Competitor snapshots CSV creates competitor_item if missing', async () => {
    const importRes = await request(app.getHttpServer())
      .post('/imports/start')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'competitor_snapshots',
        idempotency_key: 'csv-snapshots-001',
        file_name: 'snapshots.csv',
        csv_text:
          'sku_code,competitor_name,price,product_url,captured_at,currency\nSKU-118,CSV Comp One,61,https://csvcomp.example/sku-118,2026-02-21T01:00:00.000Z,INR',
      });
    expect(importRes.status).toBe(201);

    const itemRes = await pool.query<{ id: string }>(
      `
      select ci.id
      from competitor_items ci
      inner join competitors c
        on c.id = ci.competitor_id
       and c.tenant_id = ci.tenant_id
      where ci.tenant_id = $1
        and ci.sku_id = $2
        and c.name = 'CSV Comp One'
      limit 1
      `,
      [tenantId, sku118Id],
    );
    expect(itemRes.rows[0]?.id).toBeTruthy();
  });

  it('Idempotency: same key does not double-import dealer sales', async () => {
    const secondAttempt = await request(app.getHttpServer())
      .post('/imports/start')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'dealer_sales',
        idempotency_key: 'csv-dealer-sales-001',
        file_name: 'dealer_sales.csv',
        csv_text:
          'sku_code,dealer_name,sale_price,qty,sale_date,ref_no\nSKU-118,Dealer CSV One,72,5,2026-02-20,CSV-001',
      });
    expect(secondAttempt.status).toBe(201);

    const salesRes = await pool.query<{ ref_no: string | null }>(
      `
      select ref_no
      from dealer_sales
      where tenant_id = $1 and sku_id = $2 and sale_date = $3
      `,
      [tenantId, sku118Id, '2026-02-20'],
    );
    const importCount = salesRes.rows.filter((sale) => sale.ref_no === 'CSV-001').length;
    expect(importCount).toBe(1);
  });
});

