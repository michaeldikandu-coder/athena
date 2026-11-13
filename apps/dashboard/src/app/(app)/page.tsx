'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Application, Execution, Stats } from '@/lib/types';
import { useRealtime } from '@/lib/realtime';
import { ExecutionTable } from '@/components/execution-table';
import { Card, ErrorBanner, LoadingBlock, PageHeader, TextLink } from '@/components/ui';

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 hover:border-ink-700">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Execution[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e, a] = await Promise.all([
        api<Stats>('/executions/stats'),
        api<Execution[]>('/executions?limit=8'),
        api<Application[]>('/apps'),
      ]);
      setStats(s.data);
      setRecent(e.data);
      setApps(a.data);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime((m) => {
    if (m.type === 'execution.status' || m.type.startsWith('approval.')) void load();
  });

  if (!stats && !error) return <LoadingBlock />;
  const total = Object.values(stats?.byStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Every agent below runs on the same Athena runtime: one tool registry, one permission system, one approval queue, one execution monitor."
      />
      <ErrorBanner message={error} />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label={`Executions (${stats.windowDays}d)`} value={total} href="/executions" />
          <Stat label="Running now" value={stats.activeExecutions} />
          <Stat label="Awaiting approval" value={stats.pendingApprovals} href="/approvals" />
          <Stat label="Completed" value={stats.byStatus.completed ?? 0} />
          <Stat label="Failed" value={stats.byStatus.failed ?? 0} />
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {apps.map((app) => {
          const usage = stats?.byApplication.find((b) => b.application === app.id);
          return (
            <Card
              key={app.id}
              title={app.name}
              actions={<TextLink href={app.installed ? `/apps/${app.id}` : '/apps'}>{app.installed ? 'Open →' : 'Install →'}</TextLink>}
            >
              <p className="mb-3 text-sm text-ink-400">{app.description}</p>
              <div className="flex gap-6 text-sm">
                <span><span className="text-ink-400">Tools</span> {app.tools.length}</span>
                <span><span className="text-ink-400">Executions (7d)</span> {usage?.executions ?? 0}</span>
                <span><span className="text-ink-400">Tool calls</span> {usage?.toolCalls ?? 0}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Recent executions" actions={<TextLink href="/executions">All executions →</TextLink>}>
        <ExecutionTable executions={recent} emptyText="No executions yet. Install an application and run an investigation." />
      </Card>
    </div>
  );
}
