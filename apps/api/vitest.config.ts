import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://pharos:pharos@localhost:5432/pharos',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET:
        process.env.JWT_SECRET ?? 'test_jwt_secret_for_vitest_32_chars_min',
      SYSTEM_OWNER_KEY:
        process.env.SYSTEM_OWNER_KEY ?? 'test_system_owner_key_for_vitest_32_chars',
      SYSTEM_ADMIN_EMAILS: process.env.SYSTEM_ADMIN_EMAILS ?? 'owner@shakti.test',
    },
  },
});
