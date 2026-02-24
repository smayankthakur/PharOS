import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfiguredApiUrl, resolveApiUrlForBuild } from './scripts/check-env.mjs';

/** @type {import('next').NextConfig} */
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

try {
  new URL(resolveApiUrlForBuild(getConfiguredApiUrl()));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `${message} (validated from NEXT_PUBLIC_API_URL/API_URL in apps/web/next.config.mjs)`,
  );
}

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
