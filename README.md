# PharOS Margin Defense (Phases 0-6)

PharOS is a multi-tenant B2B margin defense system for distributors.

Locked V1 scope:

- Rules: `R1` Dealer `< MRP`, `R2` Dealer `< MAP`, `R3` Competitor `< MAP`, `R4` Dead stock `>=90 days && on_hand > 10`
- Impact: `loss` (R1/R2), `risk` (R3), `dead_value` (R4)
- Roles: `Owner`, `Sales`, `Ops`, `Viewer`

## Monorepo

- `apps/api` NestJS API
- `apps/web` Next.js app
- `apps/worker` BullMQ worker
- `packages/db` SQL migrations + migrate/seed/reset scripts
- `packages/config` env loader
- `packages/types` shared constants + types
- `scripts/gates.mjs` executable CI gates

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop

## Local setup

1. Start infra:

```bash
docker compose up -d postgres redis
```

2. Install deps:

```bash
npm install
```

3. Env:

```bash
cp .env.example .env
```

4. DB reset + migrate + seed:

```bash
set SEED_USER_PASSWORD=your_dev_password
npm run db:reset
```

5. Run services (3 terminals):

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

Or run all in one terminal:

```bash
npm run dev
```

## Hosts mapping (Windows)

Edit `C:\Windows\System32\drivers\etc\hosts`:

```text
127.0.0.1 pharos.local
127.0.0.1 shakti.pharos.local
127.0.0.1 vikram.pharos.local
```

Open: `http://shakti.pharos.local:3000`

## Demo credentials

Seeded user password comes from `SEED_USER_PASSWORD` at seed time.
If `SEED_USER_PASSWORD` is not set, `packages/db/seed.ts` generates a dev-only password.
For safety, the generated value is not printed in CI logs.

- Shakti tenant:
  - `owner@shakti.test`
  - `sales@shakti.test`
  - `ops@shakti.test`
  - `viewer@shakti.test`
- Vikram tenant:
  - `owner@vikram.test`
  - `sales@vikram.test`
  - `ops@vikram.test`
  - `viewer@vikram.test`

System owner key for tenant provisioning:

- Header: `x-system-owner-key`
- Value: use a strong random value from `.env` (`SYSTEM_OWNER_KEY`).

System admin emails (for reseller layer):

- Env: `SYSTEM_ADMIN_EMAILS=owner@shakti.test`
- Any logged-in user whose email is in this list can manage `/resellers` and provision tenants globally.

## Key API surface

- Auth:
  - `POST /auth/login`
  - `POST /auth/users` (Owner)
  - `GET /me`
- Tenants:
  - `GET /tenants` (system owner key)
  - `POST /tenants` (system owner key)
  - `GET /tenants/current`
  - `GET /tenants/by-slug/:slug`
  - `GET /tenants/current/settings`
  - `PATCH /tenants/current/settings` (Owner)
  - `GET /tenants/current/branding`
  - `PATCH /tenants/current/branding` (Owner)
- Reseller:
  - `POST /resellers` (System Admin)
  - `GET /resellers` (System Admin)
  - `POST /resellers/:id/users` (System Admin or reseller_admin for same reseller)
  - `POST /reseller/tenants` (reseller_admin or System Admin)
  - `GET /reseller/tenants`
  - `GET /tenants/:tenantId/flags`
  - `PATCH /tenants/:tenantId/flags`
  - `GET /tenants/:tenantId/domains`
  - `POST /tenants/:tenantId/domains`
  - `PATCH /tenants/:tenantId/domains/:domainId`
- Core:
  - `/skus`, `/warehouses`, `/inventory/*`, `/dealers`, `/dealer-sales`
- Competitor:
  - `/competitors`, `/competitor-items`, `/competitor-snapshots`, `/competitor-capture/enqueue`
- Rules/Alerts:
  - `POST /rules/run`, `GET /alerts`, `GET /alerts/:id`
- Tasks:
  - `/tasks/*`
- Explainability:
  - `GET /alerts/:id/explain`
  - `GET /analytics/explain/margin-loss`
- Dashboard:
  - `GET /dashboard/summary`
- Imports/Integrations:
  - `/imports/*`, `/webhooks/*`, `/connectors/*`

## Quality gates

- Full checks:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run check:lock-platform
```

- CI-equivalent local run (with Postgres + Redis running):

```bash
set DATABASE_URL=postgresql://pharos:pharos@localhost:5432/pharos
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=replace_with_min_32_chars_secret
set SYSTEM_OWNER_KEY=replace_with_min_32_chars_secret
set SYSTEM_ADMIN_EMAILS=owner@shakti.test
set RATE_LIMIT_BACKEND=redis
set RATE_LIMIT_WINDOW_SEC=60
npm run db:migrate
npm run db:seed:test
npm run test:api:ci
npm run build --workspace @pharos/web
npm run gates
```

- End-to-end gate table:

```bash
npm run gates
```

- Smoke alias:

```bash
npm run smoke
```

## Production entrypoints

```bash
npm run build:web
npm run start:web
npm run build:api
npm run start:api
npm run build:worker
npm run start:worker
npm run migrate:deploy
npm run healthcheck
```

## Runtime notes

- `DATABASE_URL` is required. API/DB scripts fail fast with a clear error when missing.
- `JWT_SECRET` and `SYSTEM_OWNER_KEY` must be 32+ chars.
- In `production`, weak defaults are rejected at startup (`change_me`, short secrets, empty `SYSTEM_ADMIN_EMAILS`).
- In `production`, `RATE_LIMIT_BACKEND` must be `redis` and `REDIS_URL` must be configured.
- `REDIS_URL` is optional for API-only local development:
  - API falls back to `in_memory` mode for Redis-dependent health checks.
  - Queue-backed endpoints return `503` until `REDIS_URL` is configured.
  - Worker still requires `REDIS_URL`.

## Production env template

- Use `.env.production.example` for production deployment variable baseline.

## Vercel hosting (Web)

Create a Vercel project for the web app only:

1. Import repo and set **Root Directory** to `apps/web`.
2. Use default Next.js framework detection.
3. Set Node runtime to `20.x` and install command to `npm ci`.
4. Set env vars in Vercel project:
   - `API_URL=https://<your-api-domain>`
   - `NEXT_PUBLIC_API_URL=https://<your-api-domain>`
   - `TENANT_HOST_SUFFIX=<your-web-domain>` (example: `app.example.com`)
   - `NEXT_PUBLIC_TENANT_HOST_SUFFIX=<your-web-domain>`
5. Deploy.

Notes:

- API and worker are separate services; host them outside Vercel (Render/Fly/Railway).
- Never add platform-specific SWC packages (e.g. `@next/swc-win32-*`) as direct dependencies.
- Lockfile safety is enforced by `scripts/check-lock-platform.mjs` in CI.
- Cookie auth is `httpOnly` and `sameSite=lax`; privileged API routes rely on Bearer token auth.

## Branch protection

Configure branch protection on `main` and require these checks:

- `quality`
- `test_api`
- `test_web`
- `security`
- `codeql`
- `build`
- `gates`

Do not allow merging if any required check is failing.

## Secret rotation checklist

- Rotate `JWT_SECRET` and `SYSTEM_OWNER_KEY` every environment bootstrap.
- Never commit `.env` files or runtime logs.
- Update GitHub/Render/Vercel secrets before deploying.
- Invalidate old tokens after key rotation.
- If a real secret is ever committed, rotate immediately and rewrite Git history
  (for example with `git filter-repo`) before continuing deployments.

## Docker

- Build API image:

```bash
docker build -f Dockerfile.api -t pharos-api .
```

- Build web image:

```bash
docker build -f Dockerfile.web -t pharos-web .
```

- Build worker image:

```bash
docker build -f Dockerfile.worker -t pharos-worker .
```

- Run full stack in containers:

```bash
docker compose up -d --build
```

- Run full stack with local Postgres/Redis:

```bash
docker compose up -d --build
```

## 5-minute demo script

1. Login as `owner@shakti.test` on `shakti.pharos.local`.
2. Open Dashboard and set range 30D.
3. Show revenue leak + active MAP/MRP + undercut + dead stock cards.
4. Open top breach alert (`R2`) and show WHY panel + math + evidence.
5. Create/open linked task, move status to `in_progress`, then `resolved` with code/note.
6. Go to Settings and toggle demo mode + update branding colors/logo.
7. Trigger `POST /rules/run` and refresh Alerts to show deterministic detection.

## Known limitations (still inside V1 boundaries)

- Connector layer is read/ingest focused and intentionally minimal (no repricing/writeback).
- Scheduled competitor polling remains limited and is not a full scraper automation system.
- Domain mapping is store-only in V1 (`tenant_domains`); DNS verification/activation flow is deferred.
