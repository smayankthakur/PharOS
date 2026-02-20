'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '../../../lib/api-client';

type TaskDetailResponse = {
  task: {
    id: string;
    title: string;
    description: string | null;
    severity: 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
    assignedRole: 'Sales' | 'Ops';
    assigneeUserId: string | null;
    dueAt: string;
    slaState: 'on_time' | 'due_soon' | 'breached';
    resolutionCode: string | null;
    resolutionNote: string | null;
  };
  history: Array<{
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
};

type PageProps = {
  params: Promise<{ id: string }>;
};

const resolutionCodes = [
  'price_adjusted',
  'dealer_warned',
  'promo_launched',
  'stock_transfer',
  'bundle_created',
  'no_action',
] as const;

const TaskDetailPage = ({ params }: PageProps): JSX.Element => {
  const [taskId, setTaskId] = useState('');
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [status, setStatus] = useState<'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed'>('open');
  const [resolutionCode, setResolutionCode] = useState<(typeof resolutionCodes)[number]>('dealer_warned');
  const [resolutionNote, setResolutionNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    if (!taskId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await apiGet<TaskDetailResponse>(`/api/tasks/${taskId}`);
      setData(payload);
      setStatus(payload.task.status);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const init = async (): Promise<void> => {
      const resolved = await params;
      if (!mounted) {
        return;
      }
      setTaskId(resolved.id);
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    void load();
  }, [taskId]);

  const slaLabel = useMemo<string>(() => {
    if (!data) {
      return '-';
    }
    const due = new Date(data.task.dueAt).getTime();
    const diffMs = due - Date.now();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours < 0) {
      return `${Math.abs(diffHours)}h overdue`;
    }
    return `${diffHours}h remaining`;
  }, [data]);

  const applyStatus = async (): Promise<void> => {
    if (!taskId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === 'resolved') {
        if (!resolutionCode || !resolutionNote.trim()) {
          throw new Error('Resolved requires resolution code and note');
        }
        body.resolution_code = resolutionCode;
        body.resolution_note = resolutionNote.trim();
      }
      await apiPatch(`/api/tasks/${taskId}/status`, body);
      setShowResolve(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-rose-700">{error ?? 'Task not found'}</p>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{data.task.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{data.task.description ?? 'No description'}</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
          <p><span className="text-slate-500">Severity:</span> {data.task.severity}</p>
          <p><span className="text-slate-500">Status:</span> {data.task.status}</p>
          <p><span className="text-slate-500">Assigned Role:</span> {data.task.assignedRole}</p>
          <p><span className="text-slate-500">SLA:</span> {slaLabel}</p>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Actions</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-300 px-3 py-1 text-sm"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed')
            }
          >
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
            onClick={() => {
              if (status === 'resolved') {
                setShowResolve(true);
                return;
              }
              void applyStatus();
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Update Status'}
          </button>
        </div>

        {showResolve ? (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
            <h4 className="text-sm font-semibold">Resolve Task</h4>
            <div className="mt-2 grid gap-2">
              <select
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                value={resolutionCode}
                onChange={(event) => setResolutionCode(event.target.value as (typeof resolutionCodes)[number])}
              >
                {resolutionCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <textarea
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Resolution note"
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
                  onClick={() => void applyStatus()}
                  disabled={saving}
                >
                  Confirm Resolve
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => setShowResolve(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">History</h3>
        <div className="mt-2 space-y-2">
          {data.history.map((item) => (
            <div key={item.id} className="rounded border border-slate-200 p-3 text-sm">
              <p>
                <span className="text-slate-500">Action:</span> {item.action}
              </p>
              <p>
                <span className="text-slate-500">From:</span> {item.fromStatus ?? '-'}{' '}
                <span className="text-slate-500">To:</span> {item.toStatus ?? '-'}
              </p>
              <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
};

export default TaskDetailPage;


