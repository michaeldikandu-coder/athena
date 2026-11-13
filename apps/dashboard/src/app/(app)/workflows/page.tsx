'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent, Workflow } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { AppBadge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Workflow[]>('/workflows'), api<Agent[]>('/agents')])
      .then(([w, a]) => {
        setWorkflows(w.data);
        setAgents(new Map(a.data.map((x) => [x.id, x])));
      })
      .catch((err) => setError(describeError(err)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Multi-step automations triggered by webhooks, events, schedules, or by hand. Steps can call tools directly, branch on conditions, pause for approval, or hand a task to the agent."
        actions={
          <Link href="/workflows/new">
            <Button>New workflow</Button>
          </Link>
        }
      />
      <ErrorBanner message={error} />
      <Card>
        {!workflows ? (
          <LoadingBlock />
        ) : workflows.length === 0 ? (
          <EmptyState title="No workflows">Installing an application adds its workflows here.</EmptyState>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Workflow</th>
                <th className="table-head">Agent</th>
                <th className="table-head">Trigger</th>
                <th className="table-head">Steps</th>
                <th className="table-head">Status</th>
                <th className="table-head">Last run</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="hover:bg-ink-850">
                  <td className="table-cell">
                    <Link href={`/workflows/${w.id}`} className="text-ink-100 hover:text-accent-400">{w.name}</Link>
                    <div className="line-clamp-1 text-xs text-ink-400">{w.description}</div>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    {agents.get(w.agentId)?.name ?? '—'} <AppBadge application={w.application} />
                  </td>
                  <td className="table-cell whitespace-nowrap text-ink-300">
                    {w.trigger.type}
                    {w.trigger.config.event && <span className="ml-1 font-mono text-xs text-ink-400">{w.trigger.config.event}</span>}
                    {w.trigger.config.intervalMinutes && <span className="ml-1 text-xs text-ink-400">every {w.trigger.config.intervalMinutes}m</span>}
                  </td>
                  <td className="table-cell text-xs text-ink-400">{w.steps.map((s) => s.type).join(' → ')}</td>
                  <td className="table-cell"><StatusBadge status={w.status} /></td>
                  <td className="table-cell whitespace-nowrap text-xs text-ink-400">{timeAgo(w.lastRunAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
