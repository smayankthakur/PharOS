# PharOS Deployment Baseline

This runbook standardizes one production topology across Vercel, Render, Railway, Fly.io, and VPS Docker.

## Architecture

```text
Browser
  -> web (Next.js, tenant subdomain aware)
      -> api (NestJS, JWT + RBAC + tenant isolation)
          -> Postgres (managed: Neon/Supabase/Railway)
          -> Redis (managed: Upstash/Render/Railway, optional for API in dev only)
  -> worker (BullMQ consumer, same DB + Redis as api)
```

## Service Matrix

| Service | Path | Build Command | Start Command | Port | Health | Required Env |
|---|---|---|---|---|---|---|
| Web | `apps/web` | `npm run build:web` | `npm run start:web` | `3000` | `GET /` | `API_URL`, `NEXT_PUBLIC_API_URL`, `TENANT_HOST_SUFFIX` |
| API | `apps/api` | `npm run build:api` | `npm run start:api` | `4000` (or `3001` in containers) | `GET /health` | `DATABASE_URL`, `JWT_SECRET`, `SYSTEM_OWNER_KEY`, `SYSTEM_ADMIN_EMAILS`, `ALLOWED_ORIGINS` |
| Worker | `apps/worker` | `npm run build:worker` | `npm run start:worker` | n/a | queue heartbeat/logs | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SYSTEM_OWNER_KEY` |
| DB migrations | `packages/db` | n/a | `npm run migrate:deploy` | n/a | migration logs | `DATABASE_URL` |

## Environment Variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://...` | Required in all environments |
| `REDIS_URL` | Worker: Yes, API: Recommended | `rediss://...` | API falls back to in-memory in local/dev only |
| `JWT_SECRET` | Yes | `32+ chars` | Rejected if weak/default |
| `JWT_ISSUER` | Optional | `pharos-api` | Enforced if set |
| `JWT_AUDIENCE` | Optional | `pharos-app` | Enforced if set |
| `SYSTEM_OWNER_KEY` | Yes | `32+ chars` | Used for system-owner endpoints |
| `SYSTEM_ADMIN_EMAILS` | Yes in prod | `owner@company.com` | Comma-separated |
| `ALLOWED_ORIGINS` | Yes | `https://app.example.com,https://*.app.example.com` | CORS allowlist |
| `PORT` | Optional | `4000` | API listen port |
| `RATE_LIMIT_WINDOW_MS` | Optional | `60000` | API limiter window |
| `RATE_LIMIT_MAX` | Optional | `120` | API limiter base |
| `RATE_LIMIT_LOGIN_MAX` | Optional | `10` | Stricter for login |
| `RATE_LIMIT_SYSTEM_MAX` | Optional | `30` | Stricter for system-owner tenant ops |
| `API_URL` | Web required | `https://api.example.com` | Server-side web API base |
| `NEXT_PUBLIC_API_URL` | Web required | `https://api.example.com` | Client-side web API base |
| `TENANT_HOST_SUFFIX` | Web required | `app.example.com` | Host suffix used for tenant slug extraction |
| `NEXT_PUBLIC_TENANT_HOST_SUFFIX` | Recommended | `app.example.com` | Mirror for client/runtime consistency |
| `BASE_DOMAIN` | Optional | `example.com` | Docs/ops convenience |

## Deterministic Migrations

- Production migration command: `npm run migrate:deploy`
- Current implementation uses SQL migrations in `packages/db/migrations`.
- Run migrations before deploying a new API or worker release.
- Do not run seed in production except explicit demo/staging environments.

## Secrets Handling

- Store secrets in platform secret manager only.
- Never commit `.env.production`.
- Rotate `JWT_SECRET` and `SYSTEM_OWNER_KEY` on initial production rollout.

## Tenant Wildcard DNS + SSL

### Desired domains
- Web root: `app.example.com`
- Tenant wildcard: `*.app.example.com`
- API: `api.example.com`

### DNS records
- `app.example.com` -> provider target (Vercel)
- `*.app.example.com` -> same Vercel target (wildcard)
- `api.example.com` -> API provider target (Render/Railway/Fly)

### SSL
- Use managed SSL on hosting providers for root + wildcard.
- Ensure wildcard certificate covers `*.app.example.com`.

## Platform Runbooks

### 1) Vercel (Web)

1. Create project from this repo.
2. Set `Root Directory` to `apps/web`.
3. Set `Node.js Version` to `20.x`.
4. Build command: `npm run build`.
5. Install command: `npm install --include=dev`.
   - If you keep a workspace-local lockfile, commit `apps/web/package-lock.json` so Vercel installs identical dependencies.
6. Add env vars:
   - Required for **production**: `NEXT_PUBLIC_API_URL=https://<railway-api>`
   - Recommended for preview: `NEXT_PUBLIC_API_URL=https://<preview-or-staging-api>`
   - Behavior: builds are strict only when `VERCEL_ENV=production`; preview/development fall back to `http://localhost:4000` with a warning.
   - Optional server-side mirror: `API_URL=https://api.example.com`
   - `TENANT_HOST_SUFFIX=app.example.com`
   - `NEXT_PUBLIC_TENANT_HOST_SUFFIX=app.example.com`
   - Optional (lockfile compatibility fallback): `NEXT_IGNORE_INCORRECT_LOCKFILE=1`
7. Add domains:
   - `app.example.com`
   - `*.app.example.com`
8. Deploy and verify tenant subdomain routing.

### 2) Render (API + Worker)

Create two services from same repo.

API Web Service:
- Root Directory: `pharos`
- Build Command: `npm ci --include=dev && npm run build:api`
- Start Command: `npm run start -w @pharos/api`
- Health Check Path: `/health`
- Port: `3001` (set `PORT=3001`)

Worker Background Service:
- Root Directory: `pharos`
- Build Command: `npm ci --include=dev && npm run build:worker`
- Start Command: `npm run start:worker`

Shared env vars:
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SYSTEM_OWNER_KEY`, `SYSTEM_ADMIN_EMAILS`
- API-only: `ALLOWED_ORIGINS`, `PORT`, rate-limit vars

Known working origin allowlist example:
- `ALLOWED_ORIGINS=https://pharos.sitelytc.com,https://pharos-one.vercel.app`

Troubleshooting:
- If `curl https://<render-service>.onrender.com/health` returns `404` with header `x-render-routing: no-render-subdomain`, the request is not reaching your service. Verify the service URL/subdomain in Render and that the service is live.

Migrations:
- Use API pre-deploy command: `npm ci --include=dev && npm run migrate:deploy`

### 3) Railway (API + Worker + optional Web)

1. Create project.
2. Add services:
   - `api` (from repo)
   - `worker` (from repo)
   - Optional `web` (or keep web on Vercel)
3. Add Postgres plugin.
4. Add Redis plugin (recommended).
5. Service settings:
   - `Root Directory: .`
6. Commands:
   - API build: `npm ci && npm run build:shared && npm run build -w @pharos/api`
   - API start: `npm run start -w @pharos/api`
   - Worker build: `npm ci && npm run build:shared && npm run build -w @pharos/worker`
   - Worker start: `npm run start -w @pharos/worker`
7. Required env (minimum):
   - `NODE_ENV=production`
   - `DATABASE_URL=<valid postgres url>`
   - `JWT_SECRET=<must be >= 32 chars>`
   - `SYSTEM_OWNER_KEY=<must be >= 32 chars>`
   - `ALLOWED_ORIGINS=https://pharos.sitelytc.com`
   - `REDIS_URL=<optional but recommended>`
8. Run migrations once per release:
   - `npm ci && npm run migrate:deploy`
9. Map domain:
   - API -> `api.example.com`
   - Optional web -> `app.example.com` + wildcard

### 4) Fly.io (API + Worker)

Use two Fly apps for simpler scaling.

API:
1. `fly launch --name pharos-api --no-deploy`
2. Build with `Dockerfile.api`.
3. Set secrets:
   - `fly secrets set DATABASE_URL=... REDIS_URL=... JWT_SECRET=... SYSTEM_OWNER_KEY=... SYSTEM_ADMIN_EMAILS=... ALLOWED_ORIGINS=... PORT=3001`
4. Health check path `/health`.

Worker:
1. `fly launch --name pharos-worker --no-deploy`
2. Build with `Dockerfile.worker`.
3. Set same shared secrets.
4. No public port required.

Migrations:
- Run from CI/CD or one-off machine:
  - `fly ssh console -a pharos-api -C "npm run migrate:deploy"`

### 5) VPS Docker Compose (fallback)

1. Copy `.env.production.example` to `.env`.
2. Fill production secrets + external DB/Redis URLs.
3. Build and run:
   - `docker compose up -d --build`
4. Run migrations:
   - `docker compose exec api npm run migrate:deploy`
5. Reverse proxy (Nginx/Caddy):
   - `app.example.com` -> web `:3000`
   - `api.example.com` -> api `:3001`
6. TLS:
   - Caddy recommended for automatic certificates.

### 6) Optional AWS ECS Fargate (skeleton)

- Create 3 task definitions (`web`, `api`, `worker`) from the three Dockerfiles.
- Use one ALB target group for `web`, one for `api`.
- Worker runs as non-LB service.
- Secrets from AWS SSM Parameter Store / Secrets Manager.
- RDS Postgres + ElastiCache Redis.

## CORS / Auth posture for wildcard tenants

- API expects Bearer token; web stores token in httpOnly cookie.
- Configure `ALLOWED_ORIGINS` with exact root and wildcard web origins.
- In production, API denies no-origin requests except health route.

## Production Verification Checklist

1. `npm ci`
2. `npm run build:all`
3. `npm run migrate:deploy`
4. `npm run healthcheck` (with `API_HEALTH_URL`/`WEB_HEALTH_URL` if needed)
5. Confirm:
   - `/health` returns `200`
   - login works
   - dashboard loads
   - tenant subdomain resolves (`tenant.app.example.com`)
   - worker processes a queue job

## Quickstart

1. Provision managed Postgres and Redis.
2. Set env vars (use `.env.production.example`).
3. Deploy API + Worker.
4. Deploy Web.
5. Configure `app.example.com`, `*.app.example.com`, and `api.example.com`.
6. Run smoke checks (`/health`, login, dashboard, tenant subdomain, worker job).
