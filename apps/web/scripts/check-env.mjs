import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VAR = 'NEXT_PUBLIC_API_URL';
const FALLBACK_API_URL = 'http://localhost:4000';

export const getConfiguredApiUrl = () => process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? '';

const getVercelEnv = () => (process.env.VERCEL_ENV ?? '').trim().toLowerCase();

export const isStrictProductionValidation = () => getVercelEnv() === 'production';

const parseAbsoluteApiUrl = (rawValue) => {
  if (!rawValue || rawValue.trim().length === 0) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  return parsed.toString();
};

export const validateApiUrl = (rawValue = getConfiguredApiUrl()) => {
  const parsed = parseAbsoluteApiUrl(rawValue);
  if (!parsed) {
    throw new Error(
      'Missing/invalid NEXT_PUBLIC_API_URL. Set it in Vercel env vars to https://<api-domain>',
    );
  }
  return parsed;
};

export const resolveApiUrlForBuild = (rawValue = getConfiguredApiUrl()) => {
  const parsed = parseAbsoluteApiUrl(rawValue);
  if (parsed) {
    return parsed;
  }

  if (isStrictProductionValidation()) {
    throw new Error(
      'Missing/invalid NEXT_PUBLIC_API_URL. Set it in Vercel env vars to https://<api-domain>',
    );
  }

  console.warn(
    `Missing/invalid NEXT_PUBLIC_API_URL (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}). Falling back to ${FALLBACK_API_URL}.`,
  );
  return FALLBACK_API_URL;
};

const run = () => {
  try {
    resolveApiUrlForBuild();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(detail);
    console.error(
      `Current ${REQUIRED_VAR}: ${process.env.NEXT_PUBLIC_API_URL ? '[set]' : '[missing]'}`,
    );
    process.exit(1);
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  run();
}
