'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AppPage } from '@/components/app-header';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock } from '@/components/ui';

interface HealthResult {
  name: string;
  url: string;
  healthy: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
  checkedAt: string;
}

interface Overview {
  services: HealthResult[];
  github: {
    configured: boolean;
    repo: string | null;
    failedRuns: Array<{ id: number; name: string; branch: string; createdAt: string; url: string }>;
    error: string | null;
  };
}

function OpsGuardContent() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [service, setService] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setOverview((await api<Overview>('/apps/opsguard/overview')).data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const investigate = async (text: string, svc?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ executionId: string }>('/apps/opsguard/investigate', {
        body: { description: text, service: svc || undefined },
      });
      router.push(`/executions/${data.executionId}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <Card title="Report an incident">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (description.trim().length >= 5) void investigate(description.trim(), service);
          }}
        >
          <input
            className="input min-w-[18rem] flex-1"
            placeholder="e.g. Customers report checkout is timing out since 14:00"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select className="input w-48" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Any service</option>
            {overview?.services.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          <Button type="submit" loading={busy} disabled={description.trim().length < 5}>
            Investigate
          </Button>
        </form>
      </Card>

      <Card
        title="Service health (live HTTP checks)"
        actions={
          <Button size="sm" variant="secondary" loading={refreshing} onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        {!overview ? (
          <LoadingBlock />
        ) : overview.services.length === 0 ? (
          <EmptyState title="No services configured">
            Set <span className="font-mono">OPSGUARD_SERVICES</span> on the API server, for example{' '}
            <span className="font-mono">[{'{'}&quot;name&quot;:&quot;api&quot;,&quot;url&quot;:&quot;https://api.example.com/health&quot;{'}'}]</span>
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.services.map((s) => (
              <div key={s.name} className="rounded-md border border-ink-800 bg-ink-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2 w-2 rounded-full ${s.healthy ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {s.name}
                  </span>
                  <Badge tone={s.healthy ? 'success' : 'high'}>{s.healthy ? 'healthy' : 'unhealthy'}</Badge>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-ink-400">{s.url}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-300">
                  <span>{s.status ?? s.error} · {s.latencyMs}ms</span>
                  {!s.healthy && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void investigate(`Service "${s.name}" is failing health checks (${s.status ?? s.error}).`, s.name)}>
                      Investigate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Failed CI/CD runs${overview?.github.repo ? ` · ${overview.github.repo}` : ''}`}>
        {!overview ? (
          <LoadingBlock />
        ) : !overview.github.configured ? (
          <EmptyState title="GitHub is not configured">
            Set <span className="font-mono">GITHUB_TOKEN</span> and <span className="font-mono">GITHUB_REPO</span> on the API server.
          </EmptyState>
        ) : overview.github.error ? (
          <ErrorBanner message={overview.github.error} />
        ) : overview.github.failedRuns.length === 0 ? (
          <EmptyState title="No failed runs" />
        ) : (
          <ul className="divide-y divide-ink-800">
            {overview.github.failedRuns.map((run) => (
              <li key={run.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <a href={run.url} target="_blank" rel="noreferrer" className="text-ink-100 hover:text-accent-400">{run.name}</a>
                  <span className="ml-2 text-xs text-ink-400">{run.branch} · {timeAgo(run.createdAt)}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void investigate(`GitHub Actions run ${run.id} ("${run.name}" on ${run.branch}) failed. Find out why and respond.`)}>
                  Investigate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function OpsGuardPage() {
  return <AppPage appId="opsguard">{() => <OpsGuardContent />}</AppPage>;
}
