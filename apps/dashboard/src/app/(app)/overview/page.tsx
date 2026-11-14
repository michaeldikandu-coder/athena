'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Application, Approval, Execution, Stats } from '@/lib/types';
import { useRealtime } from '@/lib/realtime';
import { ApprovalCard } from '@/components/approval-card';
import { ExecutionTable } from '@/components/execution-table';
import { RuntimeDiagram } from '@/components/runtime-diagram';
import { Arrow, ButtonLink, Card, ErrorBanner, LoadingBlock, PageHeader, TextLink } from '@/components/ui';

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' | 'ok' }) {
  const colour = tone === 'warn' && value > 0 ? 'text-warn' : tone === 'bad' && value > 0 ? 'text-bad' : 'text-ink';
  return (
    <div className="px-5 py-4">
      <div className="text-label font-medium text-muted">{label}</div>
      <div className={`tabular mt-1 text-[30px] font-medium leading-none tracking-[-0.03em] ${colour}`}>{value}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Execution[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e, a, p] = await Promise.all([
        api<Stats>('/executions/stats'),
        api<Execution[]>('/executions?limit=8'),
        api<Application[]>('/apps'),
        api<Approval[]>('/approvals?status=pending&limit=3'),
      ]);
      setStats(s.data);
      setRecent(e.data);
      setApps(a.data);
      setApprovals(p.data);
      setError(null);
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
  const usage = (id: string) => stats?.byApplication.find((b) => b.application === id)?.executions ?? 0;
  const installed = (id: string) => apps.find((a) => a.id === id)?.installed ?? false;
  const nothingInstalled = apps.length > 0 && !apps.some((a) => a.installed);

  return (
    <div>
      <PageHeader
        title="Agent operations for payments and incidents"
        description={
          stats
            ? `${total} runs in the last 7 days across MoneyGuard and OpsGuard. ${stats.pendingApprovals === 0 ? 'Nothing is waiting on you.' : `${stats.pendingApprovals} ${stats.pendingApprovals === 1 ? 'action is' : 'actions are'} waiting for your approval.`}`
            : undefined
        }
        actions={
          nothingInstalled ? (
            <ButtonLink href="/apps">Install the agents <Arrow /></ButtonLink>
          ) : (
            <ButtonLink href="/approvals" variant={stats?.pendingApprovals ? 'primary' : 'secondary'}>
              Review approvals <Arrow />
            </ButtonLink>
          )
        }
      />
      <ErrorBanner message={error} />

      {stats && (
        <div className="card mb-8 grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-5 md:divide-y-0">
          <Figure label="Runs, 7 days" value={total} />
          <Figure label="Running now" value={stats.activeExecutions} />
          <Figure label="Waiting for you" value={stats.pendingApprovals} tone="warn" />
          <Figure label="Completed" value={stats.byStatus.completed ?? 0} />
          <div className="col-span-2 md:col-span-1"><Figure label="Failed" value={stats.byStatus.failed ?? 0} tone="bad" /></div>
        </div>
      )}

      <section className="mb-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-[22px] leading-tight">One runtime, two agents</h2>
          <span className="hidden sm:inline"><TextLink href="/tools">See the tool registry</TextLink></span>
        </div>
        <div className="card p-5 md:p-8">
          <RuntimeDiagram
            money={{ runs: usage('moneyguard'), installed: installed('moneyguard') }}
            ops={{ runs: usage('opsguard'), installed: installed('opsguard') }}
            pending={stats?.pendingApprovals ?? 0}
          />
        </div>
      </section>

      {approvals.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="text-[22px] leading-tight">Actions waiting for approval</h2>
            <span className="hidden sm:inline"><TextLink href="/approvals">See all approvals</TextLink></span>
          </div>
          <div className="space-y-4">
            {approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} onDecided={() => void load()} />
            ))}
          </div>
        </section>
      )}

      <Card title="Latest runs" actions={<TextLink href="/executions">See all runs</TextLink>} flush>
        <ExecutionTable executions={recent} emptyText="No runs yet. Install an agent and start an investigation." />
      </Card>
    </div>
  );
}
