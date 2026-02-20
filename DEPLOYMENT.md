# Deployment Checklist

## Target services
- Web: Vercel
- API: Render or Fly.io
- PostgreSQL: Neon or Supabase
- Redis: Upstash

## Required environment variables

### Web
- `API_URL`
- `NEXT_PUBLIC_API_URL` (optional fallback)
- `NODE_ENV`

### API
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `PORT`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `ALLOWED_ORIGINS`

### Worker
- `REDIS_URL`

## DNS and tenant subdomains
- App base domain should support wildcard tenant subdomains.
- Example:
  - `pharos.app` for landing/root
  - `*.pharos.app` for tenant routing
- Keep API domain separate if needed (e.g., `api.pharos.app`) and include it in allowed origins.

## Pre-deploy checklist
1. Run migrations: `npm run migrate`
2. Seed demo tenant (if needed): `npm run seed`
3. Verify CI green (lint + typecheck + test)
4. Verify CORS origins are exact for production domains
5. Verify JWT secret is rotated and strong
6. Verify rate-limit defaults are production-safe

## Smoke tests after deploy
1. `GET /health` returns connected db + redis
2. Login with seeded user works
3. Tenant branding loads on tenant subdomain
4. Demo mode toggle works via settings page (`/settings`)
