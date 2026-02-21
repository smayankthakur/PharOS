import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../../../lib/tenant';
import { authHeaderFromCookie } from '../../../../../lib/server/auth';

type RouteContext = {
  params: Promise<{ tenantId: string }>;
};

export const GET = async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const { tenantId } = await context.params;
  const headers = await authHeaderFromCookie();
  const response = await fetch(`${apiBaseUrl()}/tenants/${tenantId}/flags`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};

export const PATCH = async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const { tenantId } = await context.params;
  const headers = {
    ...(await authHeaderFromCookie()),
    'content-type': 'application/json',
  };
  const body = (await request.json()) as Record<string, unknown>;
  const response = await fetch(`${apiBaseUrl()}/tenants/${tenantId}/flags`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};
