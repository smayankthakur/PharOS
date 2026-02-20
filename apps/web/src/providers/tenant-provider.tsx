'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { TenantPayload } from '../lib/tenant';

type TenantContextValue = {
  tenantSlug: string | null;
  tenant: TenantPayload['tenant'] | null;
  branding: TenantPayload['branding'] | null;
  isLoading: boolean;
};

const TenantContext = createContext<TenantContextValue>({
  tenantSlug: null,
  tenant: null,
  branding: null,
  isLoading: false,
});

type TenantProviderProps = {
  tenantSlug: string | null;
  children: ReactNode;
};

export const TenantProvider = ({ tenantSlug, children }: TenantProviderProps): JSX.Element => {
  const [tenant, setTenant] = useState<TenantPayload['tenant'] | null>(null);
  const [branding, setBranding] = useState<TenantPayload['branding'] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(tenantSlug));
  const router = useRouter();

  useEffect(() => {
    if (!tenantSlug) {
      setTenant(null);
      setBranding(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const load = async (): Promise<void> => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/tenant/by-slug/${tenantSlug}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.status === 404) {
          router.replace('/unknown-tenant');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load tenant');
        }

        const payload = (await response.json()) as TenantPayload;
        if (!isMounted) {
          return;
        }

        setTenant(payload.tenant);
        setBranding(payload.branding);
      } catch {
        if (isMounted) {
          router.replace('/unknown-tenant');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [router, tenantSlug]);

  useEffect(() => {
    if (!branding) {
      return;
    }

    if (branding.primaryColor) {
      document.documentElement.style.setProperty('--primary', branding.primaryColor);
    }

    if (branding.secondaryColor) {
      document.documentElement.style.setProperty('--secondary', branding.secondaryColor);
    }
  }, [branding]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenantSlug,
      tenant,
      branding,
      isLoading,
    }),
    [branding, isLoading, tenant, tenantSlug],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = (): TenantContextValue => {
  return useContext(TenantContext);
};
