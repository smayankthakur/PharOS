'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTenant } from '../../providers/tenant-provider';
import { apiGet, apiPatch } from '../../lib/api-client';

type DashboardSummaryResponse = {
  kpis: {
    revenue_leak: number;
    active_map_violations: number;
    active_mrp_violations: number;
    competitor_undercut_alerts: number;
    dead_stock_value: number;
  };
  trend: Array<{ date: string; breaches: number }>;
  top_breaches: Array<{
    id: string;
    rule_code: 'R1' | 'R2' | 'R3' | 'R4';
    severity: 'medium' | 'high' | 'critical';
    status: 'open' | 'resolved' | 'closed';
    impact_value: number;
    impact_type: 'loss' | 'risk' | 'dead_value';
    message: string;
    detected_at: string;
    sku_code: string | null;
    dealer_name: string | null;
    competitor_name: string | null;
  }>;
  my_tasks: Array<{
    id: string;
    title: string;
    severity: 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
    assigned_role: 'Sales' | 'Ops';
    assignee_user_id: string | null;
    due_at: string;
    sla_state: 'on_time' | 'due_soon' | 'breached';
  }>;
};

const formatCurrency = (value: number): string => {
  return `INR ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const severityTone = (severity: 'medium' | 'high' | 'critical'): string => {
  if (severity === 'critical') {
    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
  if (severity === 'high') {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const slaTone = (state: 'on_time' | 'due_soon' | 'breached'): string => {
  if (state === 'breached') {
    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
  if (state === 'due_soon') {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
};

const DashboardPage = (): JSX.Element => {
  const { tenant, branding } = useTenant();
  const [range, setRange] = useState<'7d' | '30d'>('30d');
  const [severity, setSeverity] = useState<'all' | 'medium' | 'high' | 'critical'>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);

  const trendPoints = useMemo<string>(() => {
    if (!summary || summary.trend.length === 0) {
      return '';
    }

    const max = Math.max(...summary.trend.map((item) => item.breaches), 1);
    return summary.trend
      .map((item, index) => {
        const x = (index / Math.max(summary.trend.length - 1, 1)) * 100;
        const y = 100 - (item.breaches / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [summary]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('range', range);
      params.set('severity', severity);
      if (q.trim().length > 0) {
        params.set('q', q.trim());
      }

      const data = await apiGet<DashboardSummaryResponse>(`/api/dashboard/summary?${params.toString()}`);
      setSummary(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [range, severity]);

  const onSearchSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await load();
  };

  const onStartTask = async (taskId: string): Promise<void> => {
    try {
      await apiPatch(`/api/tasks/${taskId}/status`, { status: 'in_progress' });
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Failed to update task');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Tenant logo" className="h-8 w-8 rounded object-cover" />
          ) : null}
          <div>
            <h2 className="text-lg font-semibold">PharOS Margin Defense</h2>
            <p className="text-xs text-slate-600">{tenant?.name ?? 'Unknown tenant'}</p>
          </div>
        </div>

        <form className="flex flex-wrap items-center gap-2" onSubmit={onSearchSubmit}>
          <div className="inline-flex rounded border border-slate-300">
            <button
              type="button"
              className={`px-3 py-1 text-sm ${range === '7d' ? 'bg-slate-900 text-white' : 'bg-white'}`}
              onClick={() => setRange('7d')}
            >
              7D
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-sm ${range === '30d' ? 'bg-slate-900 text-white' : 'bg-white'}`}
              onClick={() => setRange('30d')}
            >
              30D
            </button>
          </div>

          <select
            className="rounded border border-slate-300 px-3 py-1 text-sm"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as 'all' | 'medium' | 'high' | 'critical')}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>

          <input
            className="w-56 rounded border border-slate-300 px-3 py-1 text-sm"
            placeholder="Search SKU / dealer / competitor"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
            Search
          </button>
        </form>
      </div>

      {error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading || !summary ? <p className="text-sm text-slate-600">Loading...</p> : null}

      {!loading && summary ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Revenue Leak ({range.toUpperCase()})</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.kpis.revenue_leak)}</p>
            </article>
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Active MAP Violations</p>
              <p className="mt-2 text-2xl font-semibold">{summary.kpis.active_map_violations}</p>
            </article>
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Active MRP Violations</p>
              <p className="mt-2 text-2xl font-semibold">{summary.kpis.active_mrp_violations}</p>
            </article>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Competitor Undercut Alerts</p>
              <p className="mt-2 text-2xl font-semibold">{summary.kpis.competitor_undercut_alerts}</p>
            </article>
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Dead Stock Value (90+ Days)</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.kpis.dead_stock_value)}</p>
            </article>
            <article className="rounded border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Breach Trend</p>
              <div className="mt-2 h-28 w-full">
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <polyline
                    points={trendPoints}
                    fill="none"
                    stroke="var(--primary, #0f172a)"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </article>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <article className="rounded border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">Top Breaches</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3">SKU</th>
                      <th className="pb-2 pr-3">Dealer / Competitor</th>
                      <th className="pb-2 pr-3">Severity</th>
                      <th className="pb-2 pr-3">Impact</th>
                      <th className="pb-2 pr-3">Detected</th>
                      <th className="pb-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.top_breaches.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3">
                          <Link href={`/alerts/${row.id}`} className="font-medium text-slate-900 hover:underline">
                            {row.sku_code ?? '-'}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{row.dealer_name ?? row.competitor_name ?? '-'}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded border px-2 py-0.5 text-xs ${severityTone(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{formatCurrency(row.impact_value)}</td>
                        <td className="py-2 pr-3">{new Date(row.detected_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-3">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">My Tasks</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3">Task</th>
                      <th className="pb-2 pr-3">SLA</th>
                      <th className="pb-2 pr-3">Role</th>
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.my_tasks.map((task) => (
                      <tr key={task.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3">
                          <Link href={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:underline">
                            {task.title}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`rounded border px-2 py-0.5 text-xs ${slaTone(task.sla_state)}`}>
                            {task.sla_state}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{task.assigned_role}</td>
                        <td className="py-2 pr-3">{task.status}</td>
                        <td className="py-2 pr-3">
                          {task.status === 'open' ? (
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                              onClick={() => void onStartTask(task.id)}
                            >
                              Start
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default DashboardPage;

