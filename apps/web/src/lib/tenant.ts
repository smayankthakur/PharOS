export type TenantBranding = {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  emailFrom: string | null;
  domainCustom: string | null;
};

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type TenantPayload = {
  tenant: TenantInfo;
  branding: TenantBranding;
};

export const extractTenantSlugFromHost = (hostHeader: string | null): string | null => {
  if (!hostHeader) {
    return null;
  }

  const host = hostHeader.split(':')[0]?.toLowerCase() ?? '';

  if (!host || host === 'localhost' || host === '127.0.0.1' || host === 'pharos.local') {
    return null;
  }

  if (!host.endsWith('.pharos.local')) {
    return null;
  }

  const slug = host.replace('.pharos.local', '').trim();
  if (!slug || slug === 'pharos') {
    return null;
  }

  return slug;
};

export const apiBaseUrl = (): string => {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
};
