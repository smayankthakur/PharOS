# Security Policy

## Supported Scope
- PharOS API (`apps/api`)
- PharOS Web (`apps/web`)
- Worker and connector ingestion (`apps/worker`)

## Secrets and Configuration
- Required: `DATABASE_URL`, `JWT_SECRET`, `SYSTEM_OWNER_KEY`.
- In production:
  - `JWT_SECRET` must be 32+ chars and cannot be `change_me`.
  - `SYSTEM_OWNER_KEY` must be 32+ chars and cannot be the dev default.
  - `SYSTEM_ADMIN_EMAILS` must be set.
- Keep secrets in platform secret managers (Vercel/Render/Fly/Upstash/Neon), not in Git.

## Multi-Tenant Isolation Model
- Authenticated requests derive `tenantId` from JWT claims.
- Tenant-scoped DB access uses `TenantDb` to force `tenant_id` filters on reads/writes.
- Public tenant lookup is restricted to slug + branding-safe fields.
- Reseller flows can only manage tenants provisioned by their reseller mapping.

## Auth and Session Notes
- JWT signing/verification uses `HS256` with 12h expiry.
- Optional issuer/audience enforcement via `JWT_ISSUER` and `JWT_AUDIENCE`.
- Web auth token is stored in `httpOnly` cookie (`secure=true` in production).
- API uses Bearer auth; CSRF risk is reduced because privileged API calls do not rely on browser cookie auth.

## Runtime Protections
- CORS uses explicit allowlist patterns from `ALLOWED_ORIGINS`.
- In production, requests without `Origin` are denied by default.
- Rate limiting:
  - Redis-backed counters when `REDIS_URL` is configured.
  - Memory fallback for local/dev.
  - Stricter buckets for `/auth/login` and system-owner tenant endpoints.
- CSP + security headers are set in web `next.config.mjs`.

## Operational Checklist
1. Rotate `JWT_SECRET` and `SYSTEM_OWNER_KEY` before production.
2. Restrict `SYSTEM_ADMIN_EMAILS` to dedicated admin accounts.
3. Set exact production `ALLOWED_ORIGINS`.
4. Verify `connect-src` includes only required API domains.
5. Monitor audit log events for auth failures, rate limiting, and privileged operations.

## Vulnerability Reporting
- Email: `security@pharos.local` (replace with your real security contact before production).
- Include reproduction steps, affected route/module, and impact estimate.
