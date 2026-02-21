'use client';

import { useEffect, useState } from 'react';

type MeResponse = {
  id: string;
  tenantId: string | null;
  roles: string[];
};

type FlagsResponse = {
  tenant_id: string;
  flags_json: Record<string, boolean>;
};

type DomainItem = {
  id: string;
  tenantId: string;
  domain: string;
  status: string;
  createdAt: string;
};

const FlagsPage = (): React.JSX.Element => {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      const meResponse = await fetch('/api/me', { cache: 'no-store' });
      const me = (await meResponse.json()) as MeResponse;
      if (!meResponse.ok || !me.tenantId || !me.roles.includes('Owner')) {
        throw new Error('Owner access required');
      }
      setTenantId(me.tenantId);

      const [flagsResponse, domainsResponse] = await Promise.all([
        fetch(`/api/tenant/${me.tenantId}/flags`, { cache: 'no-store' }),
        fetch(`/api/tenant/${me.tenantId}/domains`, { cache: 'no-store' }),
      ]);

      const flagsPayload = (await flagsResponse.json()) as FlagsResponse;
      const domainsPayload = (await domainsResponse.json()) as { items?: DomainItem[] };

      if (!flagsResponse.ok || !domainsResponse.ok) {
        throw new Error('Failed to load flags/domains');
      }

      setFlags(flagsPayload.flags_json);
      setDomains(domainsPayload.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load settings');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleFlag = async (name: string): Promise<void> => {
    if (!tenantId) {
      return;
    }
    const nextFlags = { ...flags, [name]: !flags[name] };
    setFlags(nextFlags);
    await fetch(`/api/tenant/${tenantId}/flags`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flags_json: nextFlags }),
    });
  };

  const addDomain = async (): Promise<void> => {
    if (!tenantId || !domainInput.trim()) {
      return;
    }
    await fetch(`/api/tenant/${tenantId}/domains`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: domainInput.trim() }),
    });
    setDomainInput('');
    await load();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Feature Flags</h2>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="rounded border border-slate-200 bg-white p-4">
        {Object.entries(flags).map(([name, enabled]) => (
          <label key={name} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span>{name}</span>
            <input type="checkbox" checked={enabled} onChange={() => void toggleFlag(name)} />
          </label>
        ))}
      </div>

      <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <p className="font-medium">Domains (store-only)</p>
        <div className="flex gap-2">
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder="client.example.com"
          />
          <button
            type="button"
            onClick={addDomain}
            className="rounded px-4 py-2 text-white"
            style={{ background: 'var(--primary)' }}
          >
            Add
          </button>
        </div>
        <ul className="space-y-1 text-sm">
          {domains.map((domain) => (
            <li key={domain.id}>
              {domain.domain} ({domain.status})
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default FlagsPage;
