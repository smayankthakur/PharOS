# Deployment Checklist

## Target services
- Web: Vercel
- API: Render or Fly.io
- PostgreSQL: Neon or Supabase
- Redis: Upstash

## Vercel (Web) setup

Use one Vercel project for the web app with:

- Root Directory: `apps/web`
- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `.next` (default)

Important:
- Do not pin platform-specific SWC packages (for example `@next/swc-win32-*`) in `apps/web/package.json`.
- Keep API hosted separately (Render/Fly/Railway) and point web to it via env vars.

## Required environment variables

### Web
- `API_URL`
- `NEXT_PUBLIC_API_URL` (optional fallback)
- `NODE_ENV`

### API
- `DATABASE_URL`
- `REDIS_URL` (optional for API-only mode; required for queue/worker features)
- `JWT_SECRET`
- `PORT`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `ALLOWED_ORIGINS`
- `SYSTEM_OWNER_KEY`
- `SYSTEM_ADMIN_EMAILS`

### Worker
- `REDIS_URL`
- `DATABASE_URL`

## DNS and tenant subdomains
- App base domain should support wildcard tenant subdomains.
- Example:
  - `pharos.app` for landing/root
  - `*.pharos.app` for tenant routing
- Keep API domain separate if needed (e.g., `api.pharos.app`) and include it in allowed origins.

## Pre-deploy checklist
0. Use `.env.production.example` as baseline.
1. Run migrations: `npm run migrate`
2. Seed demo tenant (if needed): `npm run seed`
3. Verify CI green (lint + typecheck + test)
4. Verify CORS origins are exact for production domains
5. Verify JWT secret is rotated and strong
6. Verify rate-limit defaults are production-safe
7. Build images as needed:
   - `docker build -t pharos-api --build-arg WORKSPACE=@pharos/api .`
   - `docker build -t pharos-web --build-arg WORKSPACE=@pharos/web .`
   - `docker build -t pharos-worker --build-arg WORKSPACE=@pharos/worker .`

## Smoke tests after deploy
1. `GET /health` returns connected db + redis
2. Login with seeded user works
3. Tenant branding loads on tenant subdomain
4. Demo mode toggle works via settings page (`/settings`)
5. Dashboard loads on Vercel URL without hydration/runtime errors
