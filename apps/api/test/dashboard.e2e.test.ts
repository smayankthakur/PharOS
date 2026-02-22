import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type SummaryResponse = {
  kpis: Record<string, number>;
  trend: Array<{ date: string; breaches: number }>;
};

describe('Dashboard summary', () => {
  let app: INestApplication;
  let ownerToken = '';
  let viewerToken = '';
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

    ownerToken = await login('owner@shakti.test');
    viewerToken = await login('viewer@shakti.test');

    const runResponse = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(runResponse.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/dashboard/summary returns KPI keys', async () => {
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary?range=30d')
      .set('authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    const payload = response.body as SummaryResponse;
    expect(payload.kpis).toHaveProperty('revenue_leak');
    expect(payload.kpis).toHaveProperty('active_map_violations');
    expect(payload.kpis).toHaveProperty('active_mrp_violations');
    expect(payload.kpis).toHaveProperty('competitor_undercut_alerts');
    expect(payload.kpis).toHaveProperty('dead_stock_value');
  });

  it('trend length equals requested range days', async () => {
    const response7d = await request(app.getHttpServer())
      .get('/dashboard/summary?range=7d')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(response7d.status).toBe(200);
    expect((response7d.body as SummaryResponse).trend).toHaveLength(7);

    const response30d = await request(app.getHttpServer())
      .get('/dashboard/summary?range=30d')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(response30d.status).toBe(200);
    expect((response30d.body as SummaryResponse).trend).toHaveLength(30);
  });

  it('RBAC: Viewer can access, unauth is rejected', async () => {
    const viewerResponse = await request(app.getHttpServer())
      .get('/dashboard/summary?range=30d')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(viewerResponse.status).toBe(200);

    const unauthResponse = await request(app.getHttpServer()).get('/dashboard/summary?range=30d');
    expect(unauthResponse.status).toBe(401);
  });
});
