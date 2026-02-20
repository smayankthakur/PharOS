import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../lib/tenant';
import { authHeaderFromCookie } from '../../../lib/server/auth';

export const GET = async (request: Request): Promise<NextResponse> => {
  const requestUrl = new URL(request.url);
  const response = await fetch(`${apiBaseUrl()}/tasks?${requestUrl.searchParams.toString()}`, {
    method: 'GET',
    headers: await authHeaderFromCookie(),
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};

