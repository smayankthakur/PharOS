import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';
import { extractTenantSlugFromHost } from '../lib/tenant';
import { TenantProvider } from '../providers/tenant-provider';
import { TenantShell } from '../components/tenant-shell';

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = async ({ children }: RootLayoutProps): Promise<JSX.Element> => {
  const host = (await headers()).get('host');
  const tenantSlug = extractTenantSlugFromHost(host);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <TenantProvider tenantSlug={tenantSlug}>
          <TenantShell>{children}</TenantShell>
        </TenantProvider>
      </body>
    </html>
  );
};

export default RootLayout;
