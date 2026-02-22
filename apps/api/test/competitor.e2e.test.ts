import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type CompetitorItem = {
  id: string;
  competitorId: string;
  skuId: string;
};

type SkuItem = {
  id: string;
  code: string;
};

describe('Competitor core', () => {
  let app: INestApplication;
  let opsToken = '';
  let salesToken = '';
  let ownerToken = '';
  let vikramOwnerToken = '';

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
    app = await NestFactory.create(AppModule);
    await app.init();

    opsToken = await login('ops@shakti.test');
    salesToken = await login('sales@shakti.test');
    ownerToken = await login('owner@shakti.test');
    vikramOwnerToken = await login('owner@vikram.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Ops can create competitor and snapshot', async () => {
    const createCompetitor = await request(app.getHttpServer())
      .post('/competitors')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Ops Competitor',
        website: 'https://ops-competitor.example.test',
      });

    expect(createCompetitor.status).toBe(201);
    const competitorId = createCompetitor.body.id as string;
    expect(competitorId).toBeTruthy();

    const skusResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${opsToken}`);
    expect(skusResponse.status).toBe(200);
    const sku = (skusResponse.body.items as SkuItem[]).find((row) => row.code === 'SKU-342');
    expect(sku?.id).toBeTruthy();

    const mapResponse = await request(app.getHttpServer())
      .post('/competitor-items')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        competitor_id: competitorId,
        sku_id: sku?.id,
        product_url: 'https://ops-competitor.example.test/products/sku-342',
        external_sku: 'OPS-342',
      });

    expect(mapResponse.status).toBe(201);
    const competitorItemId = mapResponse.body.id as string;
    expect(competitorItemId).toBeTruthy();

    const snapshotResponse = await request(app.getHttpServer())
      .post('/competitor-snapshots')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        competitor_item_id: competitorItemId,
        price: 93,
        currency: 'INR',
        method: 'manual',
        evidence_json: { url: 'https://ops-competitor.example.test/products/sku-342' },
      });

    expect(snapshotResponse.status).toBe(201);
    expect(snapshotResponse.body.price).toBe(93);
  });

  it('Sales cannot create competitor', async () => {
    const response = await request(app.getHttpServer())
      .post('/competitors')
      .set('authorization', `Bearer ${salesToken}`)
      .send({
        name: 'Sales Should Fail',
        website: 'https://fail.example.test',
      });

    expect(response.status).toBe(403);
  });

  it('Tenant isolation: tenant2 cannot read tenant1 competitor items', async () => {
    const shaktiItemsResponse = await request(app.getHttpServer())
      .get('/competitor-items')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(shaktiItemsResponse.status).toBe(200);
    const shaktiItems = shaktiItemsResponse.body.items as CompetitorItem[];
    expect(shaktiItems.length).toBeGreaterThan(0);
    const shaktiFirstId = shaktiItems[0]?.id;

    const vikramItemsResponse = await request(app.getHttpServer())
      .get('/competitor-items')
      .set('authorization', `Bearer ${vikramOwnerToken}`);
    expect(vikramItemsResponse.status).toBe(200);

    const vikramItems = vikramItemsResponse.body.items as CompetitorItem[];
    expect(vikramItems.find((row) => row.id === shaktiFirstId)).toBeUndefined();
  });

  it('Snapshot list by sku_id works', async () => {
    const skusResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(skusResponse.status).toBe(200);
    const sku = (skusResponse.body.items as SkuItem[]).find((row) => row.code === 'SKU-342');
    expect(sku?.id).toBeTruthy();

    const snapshotsResponse = await request(app.getHttpServer())
      .get(`/competitor-snapshots?sku_id=${sku?.id}&limit=20&offset=0`)
      .set('authorization', `Bearer ${ownerToken}`);

    expect(snapshotsResponse.status).toBe(200);
    const items = snapshotsResponse.body.items as Array<{ skuId?: string; price: number }>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.skuId).toBe(sku?.id);
    }
  });
});

