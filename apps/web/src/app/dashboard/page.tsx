'use client';

import { useTenant } from '../../providers/tenant-provider';

const DashboardPage = (): JSX.Element => {
  const { tenant } = useTenant();

  return (
    <section>
      <h2 className="text-xl font-semibold">System Ready</h2>
      <p className="mt-2 text-sm text-slate-600">Tenant: {tenant?.name ?? 'Unknown'}</p>
    </section>
  );
};

export default DashboardPage;
