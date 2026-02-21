import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const run = (command: string, cwd: string): void => {
  execSync(command, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
};

export default async (): Promise<void> => {
  const repoRoot = resolve(__dirname, '../../..');
  run('npx ts-node packages/db/reset.ts', repoRoot);
  run('npx ts-node packages/db/migrate.ts', repoRoot);
  run('npx ts-node packages/db/seed.ts', repoRoot);
};
