import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

type RuleDefinitionItem = {
  id: string;
  code: 'R1' | 'R2' | 'R3' | 'R4';
  enabled: boolean;
};

describe('Rule definitions store', () => {
  let app: INestApplication;
  let ownerToken = '';
  let opsToken = '';
  let salesToken = '';
  let viewerToken = '';
  let vikramOwnerToken = '';
  let shaktiRuleId = '';

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
    vikramOwnerToken = await login('owner@vikram.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Viewer can list seeded R1-R4 rule definitions', async () => {
    const response = await request(app.getHttpServer())
      .get('/rule-definitions')
      .set('authorization', `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
    const items = response.body.items as RuleDefinitionItem[];
    expect(items.length).toBeGreaterThanOrEqual(4);

    const codes = new Set(items.map((item) => item.code));
    expect(codes.has('R1')).toBe(true);
    expect(codes.has('R2')).toBe(true);
    expect(codes.has('R3')).toBe(true);
    expect(codes.has('R4')).toBe(true);

    shaktiRuleId = items[0]?.id ?? '';
    expect(shaktiRuleId).not.toBe('');
  });

  it('Sales cannot create rule definition', async () => {
    const response = await request(app.getHttpServer())
      .post('/rule-definitions')
      .set('authorization', `Bearer ${salesToken}`)
      .send({
        code: 'R1',
        name: 'Should Fail',
        severity: 'high',
        enabled: true,
        config_json: {},
      });

    expect(response.status).toBe(403);
  });

  it('Ops can update an existing rule definition', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/rule-definitions')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(listResponse.status).toBe(200);

    const items = listResponse.body.items as RuleDefinitionItem[];
    const target = items.find((item) => item.code === 'R4');
    expect(target?.id).toBeTruthy();

    const patchResponse = await request(app.getHttpServer())
      .patch(`/rule-definitions/${target?.id}`)
      .set('authorization', `Bearer ${opsToken}`)
      .send({
        enabled: false,
        severity: 'medium',
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.enabled).toBe(false);
    expect(patchResponse.body.code).toBe('R4');
  });

  it('Tenant isolation: tenant2 cannot read tenant1 rule by id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/rule-definitions/${shaktiRuleId}`)
      .set('authorization', `Bearer ${vikramOwnerToken}`);

    expect(response.status).toBe(404);
  });
});
