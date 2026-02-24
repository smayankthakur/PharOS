import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfiguredApiUrl, validateApiUrl } from './scripts/check-env.mjs';

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

let configuredApiOrigin = null;
if (!isDev) {
  try {
    configuredApiOrigin = new URL(validateApiUrl(getConfiguredApiUrl())).origin;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} (validated from NEXT_PUBLIC_API_URL/API_URL in apps/web/next.config.mjs)`);
  }
}

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
