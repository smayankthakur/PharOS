import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '../../../../lib/tenant';

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const body = (await request.json()) as { email?: string; password?: string };

  const response = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = (await response.json()) as { accessToken?: string; message?: string };

  if (!response.ok || !payload.accessToken) {
    return NextResponse.json(
      { message: payload.message ?? 'Login failed' },
      { status: response.status || 500 },
    );
  }

  const nextResponse = NextResponse.json({ ok: true });
  nextResponse.cookies.set('pharos_token', payload.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return nextResponse;
};
