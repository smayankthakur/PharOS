import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

const parseOrigin = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const configuredApiOrigin = parseOrigin(
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? '',
);

if (!isDev && !configuredApiOrigin) {
  throw new Error(
    'NEXT_PUBLIC_API_URL (or API_URL) must be a valid absolute URL in production.',
  );
}

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
