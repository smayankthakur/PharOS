import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Reseller layer', () => {
  let app: INestApplication;
  let systemAdminToken = '';
  let resellerAToken = '';
  let resellerBToken = '';
  let tenantAOwnerToken = '';
  let tenantAId = '';
  let tenantBId = '';
  const inferTenantSlug = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (domain.startsWith('reseller-')) {
      return 'system';
    }
    if (domain.endsWith('.test')) {
      return domain.replace('.test', '');
    }
    return 'shakti';
  };

  const login = async (
    email: string,
    password = 'Admin@12345',
    tenantSlug = inferTenantSlug(email),
  ): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant', tenantSlug)
      .send({ email, password });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.init();
    systemAdminToken = await login('owner@shakti.test');
  });

  afterAll(async () => {
    await app.close();
  });

  it('System Admin can create reseller', async () => {
    const response = await request(app.getHttpServer())
      .post('/resellers')
      .set('authorization', `Bearer ${systemAdminToken}`)
      .send({ name: 'Alpha Reseller', slug: 'alpha-reseller' });

    expect(response.status).toBe(201);
    expect(response.body.reseller_id).toBeTruthy();
  });

  it('Reseller admin can provision tenant and only list own tenants', async () => {
    const resellerA = await request(app.getHttpServer())
      .post('/resellers')
      .set('authorization', `Bearer ${systemAdminToken}`)
      .send({ name: 'Reseller A', slug: 'reseller-a' });
    const resellerB = await request(app.getHttpServer())
      .post('/resellers')
      .set('authorization', `Bearer ${systemAdminToken}`)
      .send({ name: 'Reseller B', slug: 'reseller-b' });
    expect(resellerA.status).toBe(201);
    expect(resellerB.status).toBe(201);

    const resellerAId = resellerA.body.reseller_id as string;
    const resellerBId = resellerB.body.reseller_id as string;

    const addUserA = await request(app.getHttpServer())
      .post(`/resellers/${resellerAId}/users`)
      .set('authorization', `Bearer ${systemAdminToken}`)
      .send({
        email: 'admin@reseller-a.test',
        name: 'Reseller A Admin',
        password: 'Admin@12345',
        reseller_role: 'reseller_admin',
      });
    const addUserB = await request(app.getHttpServer())
      .post(`/resellers/${resellerBId}/users`)
      .set('authorization', `Bearer ${systemAdminToken}`)
      .send({
        email: 'admin@reseller-b.test',
        name: 'Reseller B Admin',
        password: 'Admin@12345',
        reseller_role: 'reseller_admin',
      });

    expect(addUserA.status).toBe(201);
    expect(addUserB.status).toBe(201);

    resellerAToken = await login('admin@reseller-a.test', 'Admin@12345', 'system');
    resellerBToken = await login('admin@reseller-b.test', 'Admin@12345', 'system');

    const provisionA = await request(app.getHttpServer())
      .post('/reseller/tenants')
      .set('authorization', `Bearer ${resellerAToken}`)
      .send({
        tenant_name: 'Tenant A One',
        tenant_slug: 'tenant-a-one',
        owner_name: 'Tenant A Owner',
        owner_email: 'owner@tenant-a-one.test',
        owner_password: 'Admin@12345',
        branding: {
          primary_color: '#0F766E',
          secondary_color: '#1E293B',
        },
      });
    const provisionB = await request(app.getHttpServer())
      .post('/reseller/tenants')
      .set('authorization', `Bearer ${resellerBToken}`)
      .send({
        tenant_name: 'Tenant B One',
        tenant_slug: 'tenant-b-one',
        owner_name: 'Tenant B Owner',
        owner_email: 'owner@tenant-b-one.test',
        owner_password: 'Admin@12345',
      });

    expect(provisionA.status).toBe(201);
    expect(provisionB.status).toBe(201);
    tenantAId = provisionA.body.tenant_id as string;
    tenantBId = provisionB.body.tenant_id as string;

    const listA = await request(app.getHttpServer())
      .get('/reseller/tenants')
      .set('authorization', `Bearer ${resellerAToken}`);
    expect(listA.status).toBe(200);
    const tenantIdsA = (listA.body.items as Array<{ tenantId: string }>).map((item) => item.tenantId);
    expect(tenantIdsA).toContain(tenantAId);
    expect(tenantIdsA).not.toContain(tenantBId);
  });

  it('Reseller A cannot update flags/domains of Reseller B tenant', async () => {
    const flagsResponse = await request(app.getHttpServer())
      .patch(`/tenants/${tenantBId}/flags`)
      .set('authorization', `Bearer ${resellerAToken}`)
      .send({ flags_json: { connectors: true } });
    expect(flagsResponse.status).toBe(403);

    const domainResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantBId}/domains`)
      .set('authorization', `Bearer ${resellerAToken}`)
      .send({ domain: 'b.example.test' });
    expect(domainResponse.status).toBe(403);
  });

  it('Tenant owner can update own flags/domains; viewer cannot', async () => {
    tenantAOwnerToken = await login('owner@tenant-a-one.test');

    const flagsUpdate = await request(app.getHttpServer())
      .patch(`/tenants/${tenantAId}/flags`)
      .set('authorization', `Bearer ${tenantAOwnerToken}`)
      .send({
        flags_json: {
          competitor_engine: true,
          imports: true,
          connectors: false,
          notifications: false,
        },
      });
    expect(flagsUpdate.status).toBe(200);

    const addDomain = await request(app.getHttpServer())
      .post(`/tenants/${tenantAId}/domains`)
      .set('authorization', `Bearer ${tenantAOwnerToken}`)
      .send({ domain: 'tenant-a-one.example.test' });
    expect(addDomain.status).toBe(201);

    const ownerSettings = await request(app.getHttpServer())
      .patch('/tenants/current/settings')
      .set('authorization', `Bearer ${tenantAOwnerToken}`)
      .send({ demo_mode: true });
    expect(ownerSettings.status).toBe(200);

    const tenantCurrent = await request(app.getHttpServer())
      .get('/tenants/current')
      .set('authorization', `Bearer ${tenantAOwnerToken}`);
    expect(tenantCurrent.status).toBe(200);
    expect(tenantCurrent.body.branding.primaryColor).toBe('#0F766E');

    const getFlags = await request(app.getHttpServer())
      .get(`/tenants/${tenantAId}/flags`)
      .set('authorization', `Bearer ${tenantAOwnerToken}`);
    expect(getFlags.status).toBe(200);
    expect(getFlags.body.flags_json.connectors).toBe(false);

    const viewerToken = await login('viewer@shakti.test');
    const viewerFlags = await request(app.getHttpServer())
      .patch(`/tenants/${tenantAId}/flags`)
      .set('authorization', `Bearer ${viewerToken}`)
      .send({ flags_json: { connectors: true } });
    expect(viewerFlags.status).toBe(403);
  });

  it('Feature gating blocks connectors when connectors=false', async () => {
    const response = await request(app.getHttpServer())
      .post('/connectors/shopify/test')
      .set('authorization', `Bearer ${tenantAOwnerToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('disabled');
  });
});
