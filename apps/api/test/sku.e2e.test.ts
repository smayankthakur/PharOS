import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('SKU core', () => {
  let app: INestApplication;
  let ownerToken = '';
  let salesToken = '';
  let opsToken = '';

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
    salesToken = await login('sales@shakti.test');
    opsToken = await login('ops@shakti.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('create SKU success (Owner)', async () => {
    const response = await request(app.getHttpServer())
      .post('/skus')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'SKU-999',
        name: 'Test Charger 20W',
        description: 'Phase2 creation test',
        pricing: {
          cost: 120,
          map: 160,
          mrp: 199,
          active_price: 169,
          currency_code: 'INR',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe('SKU-999');
    expect(response.body.pricing.map).toBe(160);
  });

  it('pricing validation fails when cost > map', async () => {
    const response = await request(app.getHttpServer())
      .post('/skus')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'SKU-998',
        name: 'Invalid Pricing SKU',
        pricing: {
          cost: 200,
          map: 100,
          mrp: 210,
          active_price: 205,
          currency_code: 'INR',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('Sales role cannot create SKU', async () => {
    const response = await request(app.getHttpServer())
      .post('/skus')
      .set('authorization', `Bearer ${salesToken}`)
      .send({
        code: 'SKU-997',
        name: 'Forbidden SKU',
        pricing: {
          cost: 10,
          map: 20,
          mrp: 30,
          active_price: 25,
          currency_code: 'INR',
        },
      });

    expect(response.status).toBe(403);
  });

  it('Ops can update pricing but cannot create SKU', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/skus')
      .set('authorization', `Bearer ${opsToken}`);

    expect(listResponse.status).toBe(200);
    const firstSkuId = (listResponse.body.items as Array<{ id: string }>)[0]?.id;
    expect(typeof firstSkuId).toBe('string');

    const updateResponse = await request(app.getHttpServer())
      .patch(`/skus/${firstSkuId}/pricing`)
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        cost: 65,
        map: 90,
        mrp: 110,
        active_price: 95,
        currency_code: 'INR',
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.pricing.cost).toBe(65);

    const createResponse = await request(app.getHttpServer())
      .post('/skus')
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        code: 'SKU-996',
        name: 'Ops Create Blocked',
        pricing: {
          cost: 10,
          map: 20,
          mrp: 30,
          active_price: 25,
          currency_code: 'INR',
        },
      });

    expect(createResponse.status).toBe(403);
  });
});
