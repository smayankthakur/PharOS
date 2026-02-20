# PharOS Monorepo (Phase 1)

This repository currently includes infrastructure, authentication baseline, tenant schema setup, tenant isolation, audit events, security hardening, SKU/pricing core, and warehouse/inventory movement basics.
Dealer sales, competitor engine, alerts, tasks, rules, and dashboard business logic are not implemented in this phase.

## Structure

- `apps/api` NestJS API (`/health`, `/auth/login`, `/me`, `/tenants/*`, `/audit/current`, `/skus`, `/warehouses`, `/inventory/*`)
- `apps/web` Next.js UI shell with Tailwind
- `apps/worker` BullMQ worker bootstrap
- `packages/config` Shared environment config loader
- `packages/db` SQL migrations, migrate runner, seed/reset scripts
- `packages/types` Shared TypeScript types

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop

## 1) Start dependencies

```bash
docker compose up -d
```

## 2) Install dependencies

```bash
npm install
```

## 3) Configure environment

```bash
cp .env.example .env
```

## 4) Run database setup

```bash
npm run migrate
npm run seed
```

Reset database in development:

```bash
npm run db:reset
```

## 5) Run services

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

## API Endpoints

- `GET /health`
- `POST /auth/login`
- `GET /me` (Bearer token required)
- `GET /tenants/current` (Bearer token required)
- `GET /tenants/current/settings` (Bearer token required)
- `PATCH /tenants/current/settings` (Owner only)
- `GET /audit/current` (Owner only, tenant-isolated)
- `POST /warehouses` (Owner only)
- `GET /warehouses` (Viewer+)
- `GET /inventory/balances` (Viewer+)
- `POST /inventory/movements` (Owner + Ops)

## Inventory movement rule

- `in`: `qty` must be `> 0`, increases `on_hand`.
- `out`: `qty` must be `> 0`, decreases `on_hand` and rejects if it would go negative.
- `adjust`: `qty` is signed and applied directly to `on_hand` (positive or negative, non-zero).

## Seeded owner credentials

- Email: `owner@shakti.test`
- Password: `Admin@12345`
- Email: `owner@vikram.test`
- Password: `Admin@12345`

## Windows hosts file mapping (local subdomain routing)

Edit `C:\Windows\System32\drivers\etc\hosts` and add:

```text
127.0.0.1 pharos.local
127.0.0.1 shakti.pharos.local
127.0.0.1 vikram.pharos.local
```

Then run the web app and open `http://shakti.pharos.local:3000`.

## CORS policy notes

- `ALLOWED_ORIGINS` is comma-separated and supports wildcard host patterns (for example `http://*.pharos.local:3000`) in development.
- Production should use exact domain origins only (no wildcards) where possible.

## CSP notes

- Next.js security headers are configured in `apps/web/next.config.mjs`.
- Development mode allows looser CSP (`unsafe-inline` styles and dev script relaxations) to avoid breaking local Next tooling.
- Production should keep CSP strict and avoid adding new unsafe directives unless required.
