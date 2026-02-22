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
  fingerprint: string;
  impactType: string;
  status: string;
};

describe('Rules Engine v1', () => {
  let app: INestApplication;
  let ownerToken = '';
  let opsToken = '';
  let salesToken = '';
  let viewerToken = '';

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

  const listAlerts = async (token: string): Promise<AlertItem[]> => {
    const response = await request(app.getHttpServer())
      .get('/alerts?limit=500&offset=0')
      .set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return response.body.items as AlertItem[];
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

  it('RBAC: Sales cannot run rules', async () => {
    const response = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${salesToken}`);

    expect(response.status).toBe(403);
  });

  it('Running /rules/run produces expected R2 and R3 alerts for seeded data', async () => {
    const runResponse = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${opsToken}`);

    expect(runResponse.status).toBe(201);
    expect(runResponse.body.status).toBe('success');

    const alerts = await listAlerts(ownerToken);

    const r2 = alerts.find((alert) => alert.ruleCode === 'R2' && alert.skuCode === 'SKU-342');
    expect(r2).toBeTruthy();
    expect(r2?.impactType).toBe('loss');

    const r3 = alerts.find((alert) => alert.ruleCode === 'R3' && alert.skuCode === 'SKU-342');
    expect(r3).toBeTruthy();
    expect(r3?.impactType).toBe('risk');
  });

  it("Dedupe: second run doesn't create duplicate alerts", async () => {
    const before = await listAlerts(ownerToken);
    const beforeFingerprints = new Set(before.map((alert) => alert.fingerprint));

    const runResponse = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(runResponse.status).toBe(201);
    expect(runResponse.body.status).toBe('success');

    const after = await listAlerts(ownerToken);
    const afterFingerprints = new Set(after.map((alert) => alert.fingerprint));

    expect(after.length).toBe(before.length);
    expect(afterFingerprints.size).toBe(beforeFingerprints.size);
  });

  it('Viewer can list alerts', async () => {
    const response = await request(app.getHttpServer())
      .get('/alerts?limit=20&offset=0')
      .set('authorization', `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
  });
});

