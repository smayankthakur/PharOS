import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VAR = 'NEXT_PUBLIC_API_URL';

export const getConfiguredApiUrl = () => process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? '';

export const validateApiUrl = (rawValue = getConfiguredApiUrl()) => {
  if (!rawValue || rawValue.trim().length === 0) {
    throw new Error(
      'Missing/invalid NEXT_PUBLIC_API_URL. Set it in Vercel env vars to https://<api-domain>',
    );
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(
      'Missing/invalid NEXT_PUBLIC_API_URL. Set it in Vercel env vars to https://<api-domain>',
    );
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      'Missing/invalid NEXT_PUBLIC_API_URL. Set it in Vercel env vars to https://<api-domain>',
    );
  }

  return parsed.toString();
};

const run = () => {
  try {
    validateApiUrl();
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
