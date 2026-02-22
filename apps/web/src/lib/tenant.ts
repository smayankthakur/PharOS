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
  const hostSuffix = (
    process.env.TENANT_HOST_SUFFIX ??
    process.env.NEXT_PUBLIC_TENANT_HOST_SUFFIX ??
    'pharos.local'
  )
    .trim()
    .toLowerCase();

  if (!host || host === 'localhost' || host === '127.0.0.1' || host === hostSuffix) {
    return null;
  }

  if (!host.endsWith(`.${hostSuffix}`)) {
    return null;
  }

  const slug = host.slice(0, -(`.${hostSuffix}`).length).trim();
  if (!slug || slug === 'pharos') {
    return null;
  }

  return slug;
};

export const apiBaseUrl = (): string => {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
};
