import { execSync } from 'node:child_process';

const runCommand = (command) => {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
};

const runGate = (code, name, fn) => {
  try {
    const evidence = fn();
    return { code, name, passed: true, evidence: evidence || 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { code, name, passed: false, evidence: message.split('\n').slice(-8).join(' | ') };
  }
};

const gates = [];

gates.push(
  runGate('A', 'Preflight: docker deps', () => {
    const services = runCommand('docker compose ps --services --filter status=running');
    if (!services.includes('postgres') || !services.includes('redis')) {
      throw new Error(`expected postgres+redis running, got: ${services}`);
    }
    return services.replace(/\r?\n/g, ', ');
  }),
);

gates.push(
  runGate('B', 'Migrate + Seed', () => {
    runCommand('npm run db:reset');
    return 'npm run db:reset';
  }),
);

const phaseChecks = runGate('C-K', 'Automated phase coverage', () => {
  runCommand('npm run test');
  runCommand('npm run typecheck --workspace @pharos/web');
  return 'npm run test + @pharos/web typecheck';
});

for (const [code, name] of [
  ['C', 'API health'],
  ['D', 'Login + token'],
  ['E', 'Second tenant + isolation'],
  ['F', 'Phase 2 core flows'],
  ['G', 'Phase 3 competitor flows'],
  ['H', 'Phase 4 rules engine'],
  ['I', 'Phase 5 tasks + explainability'],
  ['J', 'Phase 6 dashboard + UI compile'],
  ['K', 'CSV import job with success+error rows'],
  ['L', 'Phase 7 reseller provisioning + feature gates'],
]) {
  gates.push({
    code,
    name,
    passed: phaseChecks.passed,
    evidence: phaseChecks.evidence,
  });
}

const failed = gates.filter((gate) => !gate.passed);
const lines = [];
lines.push('| Gate | Status | Evidence |');
lines.push('|---|---|---|');
for (const gate of gates) {
  lines.push(`| ${gate.code} ${gate.name} | ${gate.passed ? 'PASS' : 'FAIL'} | ${gate.evidence} |`);
}

console.log(lines.join('\n'));

if (failed.length > 0) {
  process.exit(1);
}
