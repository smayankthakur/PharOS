# PharOS Codebase Bug Audit

Date: 2026-02-21
Scope: Full repo verification using `npm run typecheck`, `npm run lint`, `npm run test` and targeted runtime fixes.

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

## Verification After Fixes

- `npm run typecheck` -> PASS
- `npm run lint` -> PASS
- `npm run test` -> PASS

## Open Bugs

No reproducible failing bugs were found after fixes under current local test/lint/typecheck coverage.
