import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractTenantSlugFromHost } from './src/lib/tenant';

const parseOrigin = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const wsOriginFromHttp = (origin: string): string => {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
};

const buildCsp = (request: NextRequest, nonce: string): string => {
  const apiOrigin =
    parseOrigin(process.env.NEXT_PUBLIC_API_URL) ?? parseOrigin(process.env.API_URL);
  const wsOrigin =
    parseOrigin(process.env.NEXT_PUBLIC_WS_URL) ??
    (apiOrigin ? wsOriginFromHttp(apiOrigin) : null);

  const connectSources = new Set<string>([
    "'self'",
    request.nextUrl.origin,
    'https://pharos-g1ts.onrender.com',
    'wss://pharos-g1ts.onrender.com',
  ]);

  if (apiOrigin) {
    connectSources.add(apiOrigin);
  }

  if (wsOrigin) {
    connectSources.add(wsOrigin);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: http:`,
    `style-src 'self' 'nonce-${nonce}' https: 'unsafe-hashes'`,
    "img-src 'self' data: https:",
    `connect-src ${Array.from(connectSources).join(' ')}`,
  ].join('; ');
};

const applySecurityHeaders = (
  response: NextResponse,
  request: NextRequest,
  nonce: string,
): NextResponse => {
  response.headers.set('Content-Security-Policy', buildCsp(request, nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('x-nonce', nonce);
  return response;
};

const isProtectedPath = (pathname: string): boolean => {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/alerts') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/reseller')
  );
};

export function middleware(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const host = request.headers.get('host');
  const tenantSlug = extractTenantSlugFromHost(host);
  const token = request.cookies.get('pharos_token')?.value;
  const { pathname } = request.nextUrl;

  if (!tenantSlug) {
    const isAllowedRootPath = pathname === '/' || pathname === '/login' || pathname.startsWith('/reseller');
    if (!isAllowedRootPath && !pathname.startsWith('/api')) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      redirectUrl.search = '';
      return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
    }

    if (pathname.startsWith('/reseller') && !token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
    }

    if (pathname === '/login' && token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/reseller';
      redirectUrl.search = '';
      return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    return applySecurityHeaders(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      request,
      nonce,
    );
  }

  if (pathname === '/') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = token ? '/dashboard' : '/login';
    redirectUrl.search = '';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
  }

  if (isProtectedPath(pathname) && !token) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
  }

  if (pathname === '/login' && token) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request, nonce);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  return applySecurityHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    request,
    nonce,
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
