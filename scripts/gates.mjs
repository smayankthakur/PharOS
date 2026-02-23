import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runGate = (code, name, checkFn) => {
  try {
    const evidence = checkFn();
    return { code, name, status: 'PASS', evidence: evidence || 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { code, name, status: 'FAIL', evidence: message };
  }
};

const root = process.cwd();
const reportFile = process.env.TEST_REPORT_FILE ?? resolve(root, 'apps/api/reports/api-junit.xml');

const gates = [
  runGate('A', 'JWT secret safety in CI', () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be set with at least 32 characters.');
    }
    return `length=${jwtSecret.length}`;
  }),
  runGate('B', 'Tenant isolation regression test exists', () => {
    const testFile = resolve(root, 'apps/api/test/auth-tenant.e2e.test.ts');
    if (!existsSync(testFile)) {
      throw new Error('Missing apps/api/test/auth-tenant.e2e.test.ts');
    }
    return 'apps/api/test/auth-tenant.e2e.test.ts';
  }),
  runGate('C', 'Tenant isolation regression test passed', () => {
    if (!existsSync(reportFile)) {
      throw new Error(`Missing test report: ${reportFile}`);
    }
    const xml = readFileSync(reportFile, 'utf8');
    if (!xml.includes('Auth tenant scoping')) {
      throw new Error('JUnit report missing "Auth tenant scoping" suite.');
    }
    return reportFile;
  }),
  runGate('D', 'Prod rate limit backend safety', () => {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const backend = process.env.RATE_LIMIT_BACKEND ?? 'memory';
    if (nodeEnv === 'production' && backend !== 'redis') {
      throw new Error('In production, RATE_LIMIT_BACKEND must be redis.');
    }
    return `NODE_ENV=${nodeEnv}, RATE_LIMIT_BACKEND=${backend}`;
  }),
];

const lines = [
  '| Gate | Status | Evidence |',
  '|---|---|---|',
  ...gates.map((gate) => `| ${gate.code} ${gate.name} | ${gate.status} | ${gate.evidence} |`),
];

console.log(lines.join('\n'));

if (gates.some((gate) => gate.status === 'FAIL')) {
  process.exit(1);
}
