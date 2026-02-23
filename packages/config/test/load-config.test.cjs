const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig, normalizeDatabaseUrl } = require('../dist/index.js');

const validSecret = 'x'.repeat(32);

const baseEnv = {
  NODE_ENV: 'development',
  JWT_SECRET: validSecret,
  SYSTEM_OWNER_KEY: validSecret,
  SYSTEM_ADMIN_EMAILS: 'owner@shakti.test',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  RATE_LIMIT_BACKEND: 'memory',
};

test('invalid DATABASE_URL throws clear error', () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv,
        DATABASE_URL: 'not-a-postgres-url',
      }),
    /Invalid DATABASE_URL/,
  );
});

test('normalizeDatabaseUrl strips wrapping quotes', () => {
  const normalized = normalizeDatabaseUrl('"postgresql://u:p@localhost:5432/pharos"');
  assert.equal(normalized, 'postgresql://u:p@localhost:5432/pharos');
});

test('builds database url from PG env vars when DATABASE_URL is missing', () => {
  const config = loadConfig({
    ...baseEnv,
    NODE_ENV: 'production',
    RATE_LIMIT_BACKEND: 'redis',
    REDIS_URL: 'redis://localhost:6379',
    PGHOST: 'db.railway.internal',
    PGPORT: '5432',
    PGUSER: 'railway',
    PGPASSWORD: 'secret-password',
    PGDATABASE: 'railway_db',
    PGSSLMODE: 'require',
  });

  assert.equal(config.databaseUrl.startsWith('postgresql://'), true);
  assert.equal(config.databaseUrl.includes('sslmode=require'), true);
  assert.equal(config.databaseUrl.includes('db.railway.internal'), true);
});
