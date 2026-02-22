import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type DealerItem = {
  id: string;
  name: string;
};

type SkuItem = {
  id: string;
  code: string;
};

describe('Dealer sales', () => {
  let app: INestApplication;
  let shaktiSalesToken = '';
  let shaktiViewerToken = '';
  let shaktiOwnerToken = '';
  let vikramOwnerToken = '';
  const inferTenantSlug = (email: string): string =>
    email.endsWith('@vikram.test') ? 'vikram' : 'shakti';

  const login = async (email: string, tenantSlug = inferTenantSlug(email)): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant', tenantSlug)
      .send({
        email,
        password: 'Admin@12345',
      });

    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.init();

    shaktiSalesToken = await login('sales@shakti.test');
    shaktiViewerToken = await login('viewer@shakti.test');
    shaktiOwnerToken = await login('owner@shakti.test');
    vikramOwnerToken = await login('owner@vikram.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Sales role can POST /dealer-sales', async () => {
    const dealersResponse = await request(app.getHttpServer())
      .get('/dealers')
      .set('authorization', `Bearer ${shaktiSalesToken}`);
    expect(dealersResponse.status).toBe(200);
    const dealers = dealersResponse.body.items as DealerItem[];
    const dealer = dealers.find((row) => row.name === 'Ravi Traders');
    expect(dealer?.id).toBeTruthy();

    const skuResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${shaktiSalesToken}`);
    expect(skuResponse.status).toBe(200);
    const skus = skuResponse.body.items as SkuItem[];
    const sku = skus.find((row) => row.code === 'SKU-118');
    expect(sku?.id).toBeTruthy();

    const createResponse = await request(app.getHttpServer())
      .post('/dealer-sales')
      .set('authorization', `Bearer ${shaktiSalesToken}`)
      .send({
        dealer_id: dealer?.id,
        sku_id: sku?.id,
        sale_price: 51,
        qty: 12,
        sale_date: '2026-02-15',
        source: 'manual',
        ref_no: 'TEST-SALES-CREATE-001',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.qty).toBe(12);
    expect(createResponse.body.salePrice).toBe(51);
  });

  it('Viewer role cannot POST /dealer-sales', async () => {
    const dealersResponse = await request(app.getHttpServer())
      .get('/dealers')
      .set('authorization', `Bearer ${shaktiViewerToken}`);
    expect(dealersResponse.status).toBe(200);
    const dealers = dealersResponse.body.items as DealerItem[];
    const dealer = dealers[0];

    const skuResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${shaktiViewerToken}`);
    expect(skuResponse.status).toBe(200);
    const skus = skuResponse.body.items as SkuItem[];
    const sku = skus[0];

    const createResponse = await request(app.getHttpServer())
      .post('/dealer-sales')
      .set('authorization', `Bearer ${shaktiViewerToken}`)
      .send({
        dealer_id: dealer?.id,
        sku_id: sku?.id,
        sale_price: 49,
        qty: 10,
        sale_date: '2026-02-16',
        source: 'manual',
      });

    expect(createResponse.status).toBe(403);
  });

  it('Tenant isolation: tenant2 cannot read tenant1 dealer sales', async () => {
    const shaktiSalesList = await request(app.getHttpServer())
      .get('/dealer-sales?limit=20&offset=0')
      .set('authorization', `Bearer ${shaktiOwnerToken}`);

    expect(shaktiSalesList.status).toBe(200);
    const shaktiItems = shaktiSalesList.body.items as Array<{ id: string }>;
    expect(shaktiItems.length).toBeGreaterThan(0);

    const vikramList = await request(app.getHttpServer())
      .get('/dealer-sales?limit=20&offset=0')
      .set('authorization', `Bearer ${vikramOwnerToken}`);

    expect(vikramList.status).toBe(200);
    const vikramItems = vikramList.body.items as Array<{ id: string }>;
    expect(vikramItems.find((row) => row.id === shaktiItems[0]?.id)).toBeUndefined();

    const vikramReadShaktiId = await request(app.getHttpServer())
      .get(`/dealer-sales/${shaktiItems[0]?.id}`)
      .set('authorization', `Bearer ${vikramOwnerToken}`);
    expect(vikramReadShaktiId.status).toBe(404);
  });

  it('Validation fails when qty <= 0', async () => {
    const dealersResponse = await request(app.getHttpServer())
      .get('/dealers')
      .set('authorization', `Bearer ${shaktiSalesToken}`);
    expect(dealersResponse.status).toBe(200);
    const dealers = dealersResponse.body.items as DealerItem[];

    const skuResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${shaktiSalesToken}`);
    expect(skuResponse.status).toBe(200);
    const skus = skuResponse.body.items as SkuItem[];

    const createResponse = await request(app.getHttpServer())
      .post('/dealer-sales')
      .set('authorization', `Bearer ${shaktiSalesToken}`)
      .send({
        dealer_id: dealers[0]?.id,
        sku_id: skus[0]?.id,
        sale_price: 50,
        qty: 0,
        sale_date: '2026-02-17',
        source: 'manual',
      });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body.error.code).toBe('bad_request');
  });
});
