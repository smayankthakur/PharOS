import { execSync } from 'node:child_process';

execSync('node scripts/gates.mjs', {
  stdio: 'inherit',
});
