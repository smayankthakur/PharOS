import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type AlertItem = {
  id: string;
  ruleCode: 'R1' | 'R2' | 'R3' | 'R4';
  skuCode: string | null;
};

type ExplainPayload = {
  narrative_text: string;
  math_json: Record<string, unknown>;
  cached: boolean;
  generated_at: string;
};

describe('Explainability Engine', () => {
  let app: INestApplication;
  let ownerToken = '';
  let viewerToken = '';
  let r2AlertId = '';

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

    ownerToken = await login('owner@shakti.test');
    viewerToken = await login('viewer@shakti.test');

    const runResponse = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(runResponse.status).toBe(201);

    const alertsResponse = await request(app.getHttpServer())
      .get('/alerts?limit=500&offset=0')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(alertsResponse.status).toBe(200);

    const alerts = alertsResponse.body.items as AlertItem[];
    const r2 = alerts.find((item) => item.ruleCode === 'R2' && item.skuCode === 'SKU-342');
    expect(r2?.id).toBeTruthy();
    r2AlertId = r2?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('/alerts/:id/explain returns narrative_text and math_json', async () => {
    const response = await request(app.getHttpServer())
      .get(`/alerts/${r2AlertId}/explain`)
      .set('authorization', `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
    const payload = response.body as ExplainPayload;
    expect(typeof payload.narrative_text).toBe('string');
    expect(payload.narrative_text.length).toBeGreaterThan(0);
    expect(payload.math_json).toBeTruthy();
    expect(typeof payload.math_json).toBe('object');
  });

  it('Seeded R2 alert includes again_count >= 1', async () => {
    const response = await request(app.getHttpServer())
      .get(`/alerts/${r2AlertId}/explain`)
      .set('authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    const payload = response.body as ExplainPayload;
    const againCount = Number(payload.math_json.again_count ?? 0);
    expect(againCount).toBeGreaterThanOrEqual(1);
  });

  it('Caching works on second call', async () => {
    const first = await request(app.getHttpServer())
      .get(`/alerts/${r2AlertId}/explain`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .get(`/alerts/${r2AlertId}/explain`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect(second.status).toBe(200);

    const firstPayload = first.body as ExplainPayload;
    const secondPayload = second.body as ExplainPayload;

    expect(secondPayload.cached).toBe(true);
    expect(secondPayload.generated_at).toBe(firstPayload.generated_at);
  });
});


