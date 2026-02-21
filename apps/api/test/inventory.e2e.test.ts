import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type WarehouseItem = {
  id: string;
  name: string;
};

type InventoryBalanceItem = {
  skuId: string;
  skuCode: string;
  warehouseId: string;
  onHand: number;
};

describe('Inventory + Warehouse', () => {
  let app: INestApplication;
  let ownerToken = '';
  let opsToken = '';
  let salesToken = '';
  let viewerToken = '';

  const login = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: 'Admin@12345',
    });

    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.init();

    ownerToken = await login('owner@shakti.test');
    opsToken = await login('ops@shakti.test');
    salesToken = await login('sales@shakti.test');
    viewerToken = await login('viewer@shakti.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Owner can create warehouse', async () => {
    const response = await request(app.getHttpServer())
      .post('/warehouses')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Mumbai WH-02',
        location: 'Mumbai',
      });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Mumbai WH-02');
  });

  it('Sales and Viewer cannot post inventory movement', async () => {
    const warehousesResponse = await request(app.getHttpServer())
      .get('/warehouses')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(warehousesResponse.status).toBe(200);

    const warehouses = warehousesResponse.body.items as WarehouseItem[];
    const targetWarehouse = warehouses.find((item) => item.name === 'Delhi WH-01');
    expect(targetWarehouse?.id).toBeTruthy();

    const balancesResponse = await request(app.getHttpServer())
      .get(`/inventory/balances?warehouse_id=${targetWarehouse?.id}`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect(balancesResponse.status).toBe(200);

    const balances = balancesResponse.body.items as InventoryBalanceItem[];
    const sku = balances.find((item) => item.skuCode === 'SKU-342');
    expect(sku?.skuId).toBeTruthy();

    const salesResponse = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('authorization', `Bearer ${salesToken}`)
      .send({
        warehouse_id: targetWarehouse?.id,
        sku_id: sku?.skuId,
        type: 'in',
        qty: 10,
        ref_type: 'test',
      });
    expect(salesResponse.status).toBe(403);

    const viewerResponse = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('authorization', `Bearer ${viewerToken}`)
      .send({
        warehouse_id: targetWarehouse?.id,
        sku_id: sku?.skuId,
        type: 'in',
        qty: 10,
        ref_type: 'test',
      });
    expect(viewerResponse.status).toBe(403);
  });

  it('Ops can post movement and out movement cannot make stock negative', async () => {
    const balancesResponse = await request(app.getHttpServer())
      .get('/inventory/balances')
      .set('authorization', `Bearer ${opsToken}`);
    expect(balancesResponse.status).toBe(200);

    const balances = balancesResponse.body.items as InventoryBalanceItem[];
    const seeded = balances.find((item) => item.skuCode === 'SKU-777');
    expect(seeded).toBeTruthy();
    const initialOnHand = seeded?.onHand ?? 0;

    const increaseResponse = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        warehouse_id: seeded?.warehouseId,
        sku_id: seeded?.skuId,
        type: 'in',
        qty: 5,
        ref_type: 'test',
        ref_id: 'ops-in-1',
      });

    expect(increaseResponse.status).toBe(201);
    expect(increaseResponse.body.balance.onHand).toBe(initialOnHand + 5);

    const negativeAttempt = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        warehouse_id: seeded?.warehouseId,
        sku_id: seeded?.skuId,
        type: 'out',
        qty: 9999,
        ref_type: 'test',
        ref_id: 'ops-out-negative',
      });

    expect(negativeAttempt.status).toBe(400);
    expect(negativeAttempt.body.error.code).toBe('bad_request');
  });
});
