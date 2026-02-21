import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../../../lib/tenant';
import { authHeaderFromCookie } from '../../../../../lib/server/auth';

export const GET = async (): Promise<NextResponse> => {
  const headers = await authHeaderFromCookie();

  const response = await fetch(`${apiBaseUrl()}/tenants/current/branding`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};

export const PATCH = async (request: Request): Promise<NextResponse> => {
  const headers = {
    ...(await authHeaderFromCookie()),
    'content-type': 'application/json',
  };

  const body = (await request.json()) as Record<string, unknown>;

  const response = await fetch(`${apiBaseUrl()}/tenants/current/branding`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};
