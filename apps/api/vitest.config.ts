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
      JWT_SECRET: process.env.JWT_SECRET ?? 'change_me',
    },
  },
});
