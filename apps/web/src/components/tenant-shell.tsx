'use client';

import type { ReactNode } from 'react';
import { useTenant } from '../providers/tenant-provider';
import { DarkModeToggle } from './dark-mode-toggle';

type TenantShellProps = {
  children: ReactNode;
};

export const TenantShell = ({ children }: TenantShellProps): React.JSX.Element => {
  const { tenant, branding } = useTenant();

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Tenant logo" className="h-8 w-8 rounded object-cover" />
          ) : null}
          <h1 className="text-lg font-semibold" style={{ color: 'var(--primary)' }}>
            {tenant?.name ?? 'PharOS Margin Defense'}
          </h1>
        </div>
        <DarkModeToggle />
      </header>
      <main className="px-6 py-8">{children}</main>
    </>
  );
};
