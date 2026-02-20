import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../lib/tenant';
import { authHeaderFromCookie } from '../../../lib/server/auth';

export const GET = async (): Promise<NextResponse> => {
  const headers = await authHeaderFromCookie();

  const response = await fetch(`${apiBaseUrl()}/me`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};
