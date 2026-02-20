import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../../../lib/tenant';
import { authHeaderFromCookie } from '../../../../../lib/server/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const PATCH = async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const response = await fetch(`${apiBaseUrl()}/tasks/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: {
      ...(await authHeaderFromCookie()),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};

