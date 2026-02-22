import fs from 'node:fs';
import path from 'node:path';

const lockPath = path.resolve(process.cwd(), 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.error('package-lock.json not found');
  process.exit(1);
}

const raw = fs.readFileSync(lockPath, 'utf8');
const lock = JSON.parse(raw);
const packages = lock.packages ?? {};
const swcViolations = [];

for (const [pkgPath, entry] of Object.entries(packages)) {
  if (!pkgPath.includes('@next/swc-win32-')) {
    continue;
  }

  const typedEntry = entry ?? {};
  if (typedEntry.optional !== true) {
    swcViolations.push(`${pkgPath} must be optional=true`);
  }
}

const rootPackages = [
  lock.packages?.['']?.dependencies ?? {},
  lock.packages?.['']?.devDependencies ?? {},
];

for (const dependencyMap of rootPackages) {
  for (const dependency of Object.keys(dependencyMap)) {
    if (dependency.startsWith('@next/swc-')) {
      swcViolations.push(`Root lockfile declares forbidden direct dependency: ${dependency}`);
    }
  }
}

if (swcViolations.length > 0) {
  console.error('Lockfile platform guard failed:');
  for (const violation of swcViolations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Lockfile platform guard passed.');
