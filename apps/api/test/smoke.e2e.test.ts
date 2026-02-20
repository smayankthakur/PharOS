import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('API smoke', () => {
  let app: INestApplication;
  let shaktiOwnerToken = '';
  let vikramOwnerToken = '';
  let vikramTenantId = '';

  const login = async (email: string, password: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password,
    });

    expect(response.status).toBe(201);
    expect(typeof response.body.accessToken).toBe('string');
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.db).toBe('connected');
    expect(response.body.redis).toBe('connected');
  });

  it('POST /auth/login returns jwt for seeded owner', async () => {
    shaktiOwnerToken = await login('owner@shakti.test', 'Admin@12345');
    expect(shaktiOwnerToken.length).toBeGreaterThan(10);
  });

  it('POST /auth/login returns jwt for second tenant owner', async () => {
    vikramOwnerToken = await login('owner@vikram.test', 'Admin@12345');
    expect(vikramOwnerToken.length).toBeGreaterThan(10);
  });

  it('GET /admin/ping denies non-owner role', async () => {
    const token = await login('sales@shakti.test', 'Admin@12345');

    const response = await request(app.getHttpServer())
      .get('/admin/ping')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('tenant isolation: GET /tenants/current returns own tenant only', async () => {
    const shaktiCurrent = await request(app.getHttpServer())
      .get('/tenants/current')
      .set('authorization', `Bearer ${shaktiOwnerToken}`);

    const vikramCurrent = await request(app.getHttpServer())
      .get('/tenants/current')
      .set('authorization', `Bearer ${vikramOwnerToken}`);

    expect(shaktiCurrent.status).toBe(200);
    expect(vikramCurrent.status).toBe(200);

    expect(shaktiCurrent.body.tenant.slug).toBe('shakti');
    expect(vikramCurrent.body.tenant.slug).toBe('vikram');
    expect(shaktiCurrent.body.tenant.id).not.toBe(vikramCurrent.body.tenant.id);

    vikramTenantId = vikramCurrent.body.tenant.id as string;
  });

  it('tenant isolation: GET /tenants/current/settings returns own settings only', async () => {
    const shaktiSettings = await request(app.getHttpServer())
      .get('/tenants/current/settings')
      .set('authorization', `Bearer ${shaktiOwnerToken}`);

    const vikramSettings = await request(app.getHttpServer())
      .get('/tenants/current/settings')
      .set('authorization', `Bearer ${vikramOwnerToken}`);

    expect(shaktiSettings.status).toBe(200);
    expect(vikramSettings.status).toBe(200);

    expect(shaktiSettings.body.tenantId).not.toBe(vikramSettings.body.tenantId);
    expect(vikramSettings.body.tenantId).toBe(vikramTenantId);
  });

  it('tenant isolation: GET /audit/current returns only current tenant logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/current')
      .set('authorization', `Bearer ${vikramOwnerToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);

    const rows = response.body.items as Array<{ tenantId: string; action: string }>;

    for (const row of rows) {
      expect(row.tenantId).toBe(vikramTenantId);
    }
  });
});
