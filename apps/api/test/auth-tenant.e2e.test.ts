import 'dotenv/config';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Auth tenant scoping', () => {
  let app: INestApplication;
  let shaktiOwnerToken = '';
  let vikramOwnerToken = '';
  const sharedEmail = 'shared-user@tenant-auth.test';
  const shaktiPassword = 'SharedShakti@123';
  const vikramPassword = 'SharedVikram@123';

  const login = async (
    email: string,
    password: string,
    tenantSlug: string,
    mode: 'header' | 'body' = 'header',
  ): Promise<request.Response> =>
    mode === 'header'
      ? request(app.getHttpServer())
          .post('/auth/login')
          .set('x-tenant', tenantSlug)
          .send({ email, password })
      : request(app.getHttpServer()).post('/auth/login').send({ email, password, tenantSlug });

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.init();

    const shaktiOwnerLogin = await login('owner@shakti.test', 'Admin@12345', 'shakti');
    expect(shaktiOwnerLogin.status).toBe(201);
    shaktiOwnerToken = shaktiOwnerLogin.body.accessToken as string;

    const vikramOwnerLogin = await login('owner@vikram.test', 'Admin@12345', 'vikram');
    expect(vikramOwnerLogin.status).toBe(201);
    vikramOwnerToken = vikramOwnerLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('authenticates same email per-tenant with tenant header and blocks missing header', async () => {
    const createShaktiUser = await request(app.getHttpServer())
      .post('/auth/users')
      .set('authorization', `Bearer ${shaktiOwnerToken}`)
      .send({
        name: 'Shared Tenant User',
        email: sharedEmail,
        password: shaktiPassword,
        roles: ['Sales'],
      });
    expect(createShaktiUser.status).toBe(201);

    const createVikramUser = await request(app.getHttpServer())
      .post('/auth/users')
      .set('authorization', `Bearer ${vikramOwnerToken}`)
      .send({
        name: 'Shared Tenant User',
        email: sharedEmail,
        password: vikramPassword,
        roles: ['Sales'],
      });
    expect(createVikramUser.status).toBe(201);

    const shaktiLogin = await login(sharedEmail, shaktiPassword, 'shakti', 'body');
    expect(shaktiLogin.status).toBe(201);
    expect(typeof shaktiLogin.body.accessToken).toBe('string');
    const shaktiClaims = jwt.decode(shaktiLogin.body.accessToken) as { tenantId?: string };
    expect(typeof shaktiClaims.tenantId).toBe('string');

    const vikramLogin = await login(sharedEmail, vikramPassword, 'vikram');
    expect(vikramLogin.status).toBe(201);
    expect(typeof vikramLogin.body.accessToken).toBe('string');
    const vikramClaims = jwt.decode(vikramLogin.body.accessToken) as { tenantId?: string };
    expect(typeof vikramClaims.tenantId).toBe('string');
    expect(shaktiClaims.tenantId).not.toBe(vikramClaims.tenantId);

    const wrongTenantPassword = await login(sharedEmail, shaktiPassword, 'vikram');
    expect(wrongTenantPassword.status).toBe(401);

    const missingTenant = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: sharedEmail, password: shaktiPassword });
    expect(missingTenant.status).toBe(400);
  });
});
