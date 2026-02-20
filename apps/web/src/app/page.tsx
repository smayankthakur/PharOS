import { headers } from 'next/headers';
import { extractTenantSlugFromHost } from '../lib/tenant';

const HomePage = async (): Promise<JSX.Element> => {
  const host = (await headers()).get('host');
  const tenantSlug = extractTenantSlugFromHost(host);

  if (tenantSlug) {
    return (
      <section>
        <p className="text-base font-medium">Tenant detected: {tenantSlug}</p>
        <p className="mt-2 text-sm text-slate-600">Use /login to continue.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">PharOS Local Tenant Routing</h2>
      <p className="mt-3 text-sm text-slate-600">
        Open this app using a tenant subdomain like <code>shakti.pharos.local:3000</code>.
      </p>
    </section>
  );
};

export default HomePage;
