import { NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../../../lib/tenant';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export const GET = async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const { slug } = await context.params;

  const response = await fetch(`${apiBaseUrl()}/tenants/by-slug/${encodeURIComponent(slug)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (response.status === 404) {
    return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
};
