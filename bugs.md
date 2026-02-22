# PharOS Codebase Bug Audit

Date: 2026-02-22
Scope: Full repo verification using `npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test`, `node scripts/gates.mjs`, and Vercel/Linux deployment-readiness checks.

## Fixed Bugs

| ID | Severity | Symptom | Root Cause | Fix | Status |
|---|---|---|---|---|---|
| BUG-001 | Critical | Authenticated API routes intermittently threw `Cannot read properties of undefined` in controllers/services | Nest dependency injection resolution was implicit in multiple constructors; runtime metadata path was brittle in this setup | Added explicit `@Inject(...)` constructor injections across affected modules/controllers/services | Fixed |
| BUG-002 | High | `GET /health` and other endpoints failed under service resolution edge cases | Same DI issue affected core services (`DatabaseService`, `RedisService`, tenant/audit services) | Explicit injection wiring in health/tenant/audit-related controllers/services | Fixed |
| BUG-003 | High | API build/type mismatch in CORS bootstrap typing | Overly strict/incorrect `CorsOptionsDelegate` generic usage in `main.ts` | Replaced with explicit inline-typed callback CORS config | Fixed |
| BUG-004 | Medium | Rate limiter middleware failed compatibility on Nest v10 | Used `TooManyRequestsException` (Nest 11 API) | Replaced with `HttpException(..., 429)` for version-compatible behavior | Fixed |
| BUG-005 | Medium | Worker strict-mode/type errors around nullable inventory values | Nullable numeric values were used before null guard | Added proper null checks before numeric operations (`Math.trunc`) | Fixed |
| BUG-006 | Medium | Worker lint issue due to infinite-loop pattern | `while (true)` pattern violated lint constraints | Reworked to condition-based loop with explicit exit criteria | Fixed |
| BUG-007 | Medium | Web typecheck failed with `JSX` namespace errors | `JSX.Element` usage mismatched strict TS/React typing context | Replaced with `React.JSX.Element` and corrected accidental double-namespace replacements | Fixed |
| BUG-008 | Medium | API test suite was flaky due to DB state coupling/order dependence | Tests depended on mutable state without deterministic reset flow | Added `global-setup.ts` and configured Vitest to run DB reset+migrate+seed once per run with single-worker deterministic settings | Fixed |
| BUG-009 | Medium | Integration import test had brittle hardcoded balance expectation | Assertion assumed a specific pre-state (`35`) | Updated test to compute expected value from observed initial balance (`beforeOnHand - 5`) | Fixed |
| BUG-010 | Low | Lint noise from empty catch blocks in queue shutdown paths | Empty catch blocks violate lint rules and obscure intent | Added explicit no-op comments and clean handling in shutdown paths | Fixed |
| BUG-011 | Low | Unused type aliases in integrations service | Dead code degraded lint/type quality | Removed unused aliases/imports | Fixed |
| BUG-012 | Critical | Root `npm run dev` failed (`Missing script: dev`) | No top-level orchestrator script defined | Added root `dev` script using `concurrently` for API/Web/Worker | Fixed |
| BUG-013 | Critical | Root `npm run build` failed in web with lockfile patch (`ENOWORKSPACES`) | Next.js lockfile patch flow in workspace context attempted unsupported npm workspace command | Updated web build script to `cross-env NEXT_IGNORE_INCORRECT_LOCKFILE=1 next build` | Fixed |
| BUG-014 | High | API hard-failed when `REDIS_URL` missing | Config treated Redis as mandatory and core Redis service always tried to connect | Made `REDIS_URL` optional in config and added API Redis in-memory fallback mode | Fixed |
| BUG-015 | High | Queue endpoints crashed when Redis unavailable | BullMQ queue services assumed Redis connection always exists | Added queue guards with explicit `503 ServiceUnavailable` messaging when Redis is not configured | Fixed |
| BUG-016 | Medium | Worker startup failed with unclear behavior when Redis missing | Worker boot path had implicit Redis requirement | Added explicit startup guard: `REDIS_URL is required for worker runtime` | Fixed |
| BUG-017 | Medium | No production env template for deploy targets | Missing `.env.production.example` | Added complete `.env.production.example` for API/Web/Worker | Fixed |
| BUG-018 | Medium | Root runtime scripts incomplete for deployment smoke | No root `start` script and no API/Worker start scripts | Added root `start`, API `start`, Worker `start` scripts | Fixed |
| BUG-019 | Medium | Missing container build artifact at repo root | No root `Dockerfile` for workspace services | Added multi-workspace Dockerfile using `WORKSPACE` build arg | Fixed |
| BUG-020 | Blocking | Worker typecheck failed with `Type 'Redis' is not assignable to type 'ConnectionOptions'` | Two different `ioredis` type versions (root vs bullmq nested) caused strict TS incompatibility when passing a `Redis` instance directly to BullMQ Worker | Switched worker to pass plain BullMQ `connection` options object (`{ url, maxRetriesPerRequest }`) and removed direct Redis instance dependency in worker bootstrap | Fixed |
| BUG-021 | Blocking | Vercel Linux build could fail with `Unsupported platform for @next/swc-win32-x64-msvc` | Direct platform-specific SWC package entry under web workspace | Removed direct `@next/swc-win32-x64-msvc` from `apps/web/package.json` and regenerated lockfile | Fixed |

## Verification After Fixes

- `npm run typecheck` -> PASS
- `npm run lint` -> PASS
- `npm run test` -> PASS
- `npm run build` -> PASS
- `node scripts/gates.mjs` -> PASS (A-L)
- `npm start` -> Booted (verified listener on port 3000 during smoke startup window)
- Vercel/Linux compatibility check -> PASS (no direct `@next/swc-*` entries in workspace manifests)

## Open Bugs

No reproducible runtime failures remain under current local build/lint/typecheck/test/gates coverage.

## Residual Risks

1. Dependency security: `npm install` reports high-severity advisories in transitive dependencies; these require a planned upgrade pass (`npm audit` triage) to fully close.
2. Next lint deprecation warning: using direct ESLint for web lint removed operational noise, but a future Next 16 migration should move fully to flat ESLint config.
3. Migration numbering: both `0012_connectors.sql` and `0012_reseller_layer.sql` exist. Current lexicographic runner handles both, but adopting unique monotonically increasing migration IDs is recommended before scale.
