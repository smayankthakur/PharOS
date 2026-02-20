import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../../lib/tenant';
import { authHeaderFromCookie } from '../../../../lib/server/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const { id } = await context.params;

  const response = await fetch(`${apiBaseUrl()}/tasks/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: await authHeaderFromCookie(),
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};

