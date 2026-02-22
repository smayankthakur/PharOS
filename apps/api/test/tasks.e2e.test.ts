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

type TaskItem = {
  id: string;
  alertId: string;
  assignedRole: 'Sales' | 'Ops';
  severity: 'medium' | 'high' | 'critical';
  slaHours: number;
  dueAt: string;
  status: string;
  created?: boolean;
};

describe('Tasks + SLA', () => {
  let app: INestApplication;
  let ownerToken = '';
  let opsToken = '';
  let salesToken = '';
  let viewerToken = '';
  let r2AlertId = '';
  let taskId = '';

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
    opsToken = await login('ops@shakti.test');
    salesToken = await login('sales@shakti.test');
    viewerToken = await login('viewer@shakti.test');

    const runResponse = await request(app.getHttpServer())
      .post('/rules/run')
      .set('authorization', `Bearer ${opsToken}`);
    expect(runResponse.status).toBe(201);

    const alertsResponse = await request(app.getHttpServer())
      .get('/alerts?limit=500&offset=0')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(alertsResponse.status).toBe(200);

    const alerts = alertsResponse.body.items as AlertItem[];
    const r2 = alerts.find((alert) => alert.ruleCode === 'R2' && alert.skuCode === 'SKU-342');
    expect(r2?.id).toBeTruthy();
    r2AlertId = r2?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('Create task from seeded R2 alert -> assigned_role Sales, due_at in ~4h', async () => {
    const start = Date.now();
    const response = await request(app.getHttpServer())
      .post(`/tasks/from-alert/${r2AlertId}`)
      .set('authorization', `Bearer ${salesToken}`);

    expect(response.status).toBe(201);
    const task = response.body as TaskItem;
    taskId = task.id;
    expect(task.assignedRole).toBe('Sales');
    expect(task.severity).toBe('critical');
    expect(task.slaHours).toBe(4);

    const dueMs = new Date(task.dueAt).getTime();
    const min = start + 3.9 * 60 * 60 * 1000;
    const max = start + 4.1 * 60 * 60 * 1000;
    expect(dueMs).toBeGreaterThan(min);
    expect(dueMs).toBeLessThan(max);
  });

  it('Dedupe: calling create again returns existing task', async () => {
    const response = await request(app.getHttpServer())
      .post(`/tasks/from-alert/${r2AlertId}`)
      .set('authorization', `Bearer ${salesToken}`);

    expect(response.status).toBe(201);
    const task = response.body as TaskItem;
    expect(task.id).toBe(taskId);
    expect(task.created).toBe(false);
  });

  it('Workflow: cannot close without resolved', async () => {
    const closeFirst = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ status: 'closed' });
    expect(closeFirst.status).toBe(400);

    const resolve = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        status: 'resolved',
        resolution_code: 'dealer_warned',
        resolution_note: 'Dealer warned and sale corrected',
      });
    expect(resolve.status).toBe(200);

    const closeAfter = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ status: 'closed' });
    expect(closeAfter.status).toBe(200);
    expect((closeAfter.body as TaskItem).status).toBe('closed');
  });

  it('Viewer cannot change status', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('authorization', `Bearer ${viewerToken}`)
      .send({ status: 'open' });

    expect(response.status).toBe(403);
  });
});


