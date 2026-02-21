'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api-client';

type AlertDetailResponse = {
  alert: {
    id: string;
    ruleCode: string;
    severity: 'medium' | 'high' | 'critical';
    status: string;
    impactValue: number;
    impactType: string;
    message: string;
    detectedAt: string;
  };
  evidence: Array<{
    id: string;
    evidenceType: string;
    evidenceId: string;
    evidenceJson: Record<string, unknown>;
    createdAt: string;
  }>;
  narrative_text: string;
  timeline_json: Array<{
    at: string;
    type: string;
    text: string;
    meta: Record<string, unknown>;
  }>;
  suggestions_json: string[];
  math_json: Record<string, unknown>;
};

type TaskListResponse = {
  items: Array<{ id: string; title: string; status: string }>;
};

type PageProps = {
  params: Promise<{ id: string }>;
};

const AlertDetailPage = ({ params }: PageProps): React.JSX.Element => {
  const [alertId, setAlertId] = useState<string>('');
  const [data, setData] = useState<AlertDetailResponse | null>(null);
  const [linkedTask, setLinkedTask] = useState<{ id: string; title: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        if (!mounted) {
          return;
        }
        setAlertId(resolvedParams.id);

        const alert = await apiGet<AlertDetailResponse>(`/api/alerts/${resolvedParams.id}/explain`);
        if (!mounted) {
          return;
        }
        setData(alert);

        const tasks = await apiGet<TaskListResponse>(
          `/api/tasks?alert_id=${encodeURIComponent(resolvedParams.id)}&limit=1&offset=0`,
        );
        if (!mounted) {
          return;
        }
        setLinkedTask(tasks.items[0] ?? null);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load alert');
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
  }, [params]);

  if (loading) {
    return <p className="text-sm text-slate-600">Loading...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-rose-700">{error ?? 'Alert not found'}</p>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Alert {alertId}</h2>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
          <p><span className="text-slate-500">Rule:</span> {data.alert.ruleCode}</p>
          <p><span className="text-slate-500">Severity:</span> {data.alert.severity}</p>
          <p><span className="text-slate-500">Status:</span> {data.alert.status}</p>
          <p><span className="text-slate-500">Impact:</span> INR {data.alert.impactValue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">WHY</h3>
        <p className="mt-2 text-sm text-slate-800">{data.narrative_text}</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Timeline</p>
            <div className="mt-2 space-y-2">
              {data.timeline_json.map((event, index) => (
                <div key={`${event.at}-${event.type}-${index}`} className="rounded border border-slate-200 p-2 text-sm">
                  <p className="font-medium">{event.text}</p>
                  <p className="text-xs text-slate-500">{new Date(event.at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Suggested Actions</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
              {data.suggestions_json.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Math Breakdown</h3>
        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(data.math_json, null, 2)}
        </pre>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Evidence</h3>
        <div className="mt-2 space-y-2">
          {data.evidence.map((item) => (
            <div key={item.id} className="rounded border border-slate-200 p-3 text-sm">
              <p>
                <span className="text-slate-500">Type:</span> {item.evidenceType}
              </p>
              <p>
                <span className="text-slate-500">ID:</span> {item.evidenceId}
              </p>
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-2 text-xs">
                {JSON.stringify(item.evidenceJson, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Linked Task</h3>
        {linkedTask ? (
          <div className="mt-2 text-sm">
            <p>{linkedTask.title}</p>
            <p className="text-slate-500">Status: {linkedTask.status}</p>
            <Link href={`/tasks/${linkedTask.id}`} className="mt-2 inline-block text-sm underline">
              Open Task
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No linked task yet.</p>
        )}
      </div>
    </section>
  );
};

export default AlertDetailPage;


