import { headers } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { extractTenantSlugFromHost } from '../lib/tenant';
import { TenantProvider } from '../providers/tenant-provider';
import { TenantShell } from '../components/tenant-shell';
import ApiHealthCheck from '../components/api-health-check';

type RootLayoutProps = {
  children: ReactNode;
};

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
  },
};

const RootLayout = async ({ children }: RootLayoutProps): Promise<React.JSX.Element> => {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const tenantSlug = extractTenantSlugFromHost(host);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900" nonce={nonce}>
        <ApiHealthCheck />
        <TenantProvider tenantSlug={tenantSlug}>
          <TenantShell>{children}</TenantShell>
        </TenantProvider>
      </body>
    </html>
  );
};

export default RootLayout;
