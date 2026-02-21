import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractTenantSlugFromHost } from './src/lib/tenant';

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
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname.startsWith('/reseller') && !token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname === '/login' && token) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/reseller';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }

  if (pathname === '/') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = token ? '/dashboard' : '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  if (isProtectedPath(pathname) && !token) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === '/login' && token) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
