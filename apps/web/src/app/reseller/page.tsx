'use client';

import { useEffect, useState } from 'react';

type TenantItem = {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
};

const ResellerPage = (): React.JSX.Element => {
  const [items, setItems] = useState<TenantItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ tenant_slug: string; owner_email: string } | null>(null);
  const [form, setForm] = useState({
    tenant_name: '',
    tenant_slug: '',
    owner_name: '',
    owner_email: '',
    owner_password: 'Admin@12345',
  });

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reseller/tenants', { cache: 'no-store' });
      const payload = (await response.json()) as { items?: TenantItem[]; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load reseller tenants');
      }
      setItems(payload.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load reseller tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createTenant = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch('/api/reseller/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        tenant_slug?: string;
        owner_email?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to provision tenant');
      }
      setCreated({
        tenant_slug: payload.tenant_slug ?? '',
        owner_email: payload.owner_email ?? '',
      });
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to provision tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Reseller Console</h2>
      <div className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Tenant name"
          value={form.tenant_name}
          onChange={(event) => setForm({ ...form, tenant_name: event.target.value })}
        />
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Tenant slug"
          value={form.tenant_slug}
          onChange={(event) => setForm({ ...form, tenant_slug: event.target.value })}
        />
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Owner name"
          value={form.owner_name}
          onChange={(event) => setForm({ ...form, owner_name: event.target.value })}
        />
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Owner email"
          value={form.owner_email}
          onChange={(event) => setForm({ ...form, owner_email: event.target.value })}
        />
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          placeholder="Owner password"
          value={form.owner_password}
          onChange={(event) => setForm({ ...form, owner_password: event.target.value })}
        />
        <button
          type="button"
          onClick={createTenant}
          disabled={saving}
          className="rounded px-4 py-2 text-white disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Creating...' : 'Create Tenant'}
        </button>
      </div>

      {created ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Tenant created: {created.tenant_slug} (owner: {created.owner_email})
        </p>
      ) : null}

      {loading ? <p className="text-sm">Loading tenants...</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading ? (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.tenantId} className="border-t border-slate-200">
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2">{item.slug}</td>
                  <td className="px-3 py-2">{item.plan}</td>
                  <td className="px-3 py-2">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
};

export default ResellerPage;
