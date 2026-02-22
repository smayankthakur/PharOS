import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
const apiConnectSources = [
  process.env.API_URL,
  process.env.NEXT_PUBLIC_API_URL,
  'http://localhost:4000',
  'http://pharos.local:4000',
  'http://*.pharos.local:4000',
].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  `connect-src 'self' ${apiConnectSources.join(' ')}`,
].join('; ');

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
