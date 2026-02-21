'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTenant } from '../../providers/tenant-provider';

type MeResponse = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  roles: string[];
};

type SettingsResponse = {
  tenantId: string;
  demo_mode: boolean;
  createdAt: string;
  updatedAt: string;
};

type BrandingResponse = {
  tenantId: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  emailFrom: string | null;
  domainCustom: string | null;
};

const SettingsPage = (): React.JSX.Element => {
  const { tenant } = useTenant();
  const [roles, setRoles] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [brandingSaving, setBrandingSaving] = useState(false);

  const isOwner = useMemo<boolean>(() => roles.includes('Owner'), [roles]);

  useEffect(() => {
    let mounted = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const [meResponse, settingsResponse, brandingResponse] = await Promise.all([
          fetch('/api/me', { method: 'GET', cache: 'no-store' }),
          fetch('/api/tenant/current/settings', { method: 'GET', cache: 'no-store' }),
          fetch('/api/tenant/current/branding', { method: 'GET', cache: 'no-store' }),
        ]);

        if (!meResponse.ok || !settingsResponse.ok || !brandingResponse.ok) {
          throw new Error('Failed to load settings');
        }

        const me = (await meResponse.json()) as MeResponse;
        const settings = (await settingsResponse.json()) as SettingsResponse;
        const brandingPayload = (await brandingResponse.json()) as BrandingResponse;

        if (!mounted) {
          return;
        }

        setRoles(me.roles);
        setDemoMode(settings.demo_mode);
        setBranding(brandingPayload);
      } catch {
        if (mounted) {
          setError('Failed to load tenant settings');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const onToggle = async (): Promise<void> => {
    if (!isOwner) {
      return;
    }

    const nextValue = !demoMode;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/tenant/current/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ demo_mode: nextValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      const payload = (await response.json()) as SettingsResponse;
      setDemoMode(payload.demo_mode);
    } catch {
      setError('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const onBrandingChange = (field: keyof BrandingResponse, value: string): void => {
    if (!branding) {
      return;
    }

    setBranding({
      ...branding,
      [field]: value.trim().length > 0 ? value : null,
    });
  };

  const saveBranding = async (): Promise<void> => {
    if (!isOwner || !branding) {
      return;
    }

    setBrandingSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/tenant/current/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          logo_url: branding.logoUrl,
          primary_color: branding.primaryColor,
          secondary_color: branding.secondaryColor,
          email_from: branding.emailFrom,
          domain_custom: branding.domainCustom,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update branding');
      }

      const payload = (await response.json()) as BrandingResponse;
      setBranding(payload);
    } catch {
      setError('Failed to update branding');
    } finally {
      setBrandingSaving(false);
    }
  };

  return (
    <section className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Tenant Settings</h2>
      <p className="text-sm text-slate-600">Tenant: {tenant?.name ?? 'Unknown'}</p>

      {loading ? <p className="text-sm">Loading...</p> : null}

      {!loading ? (
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Demo Mode</p>
              <p className="text-sm text-slate-600">Stub flag for demo behavior.</p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              disabled={!isOwner || saving}
              className="rounded px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {saving ? 'Saving...' : demoMode ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {!isOwner ? (
            <p className="mt-3 text-sm text-amber-700">
              Only Owner role can update this setting.
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && branding ? (
        <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
          <p className="font-medium">Branding</p>
          <input
            type="text"
            value={branding.logoUrl ?? ''}
            onChange={(event) => onBrandingChange('logoUrl', event.target.value)}
            disabled={!isOwner || brandingSaving}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Logo URL"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={branding.primaryColor ?? ''}
              onChange={(event) => onBrandingChange('primaryColor', event.target.value)}
              disabled={!isOwner || brandingSaving}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Primary color"
            />
            <input
              type="text"
              value={branding.secondaryColor ?? ''}
              onChange={(event) => onBrandingChange('secondaryColor', event.target.value)}
              disabled={!isOwner || brandingSaving}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Secondary color"
            />
          </div>
          <button
            type="button"
            onClick={saveBranding}
            disabled={!isOwner || brandingSaving}
            className="rounded px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {brandingSaving ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </section>
  );
};

export default SettingsPage;
