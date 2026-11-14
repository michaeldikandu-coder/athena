'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent, Workflow } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { AppBadge, ButtonLink, Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

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
        eyebrow="Build"
        title="Workflows and their triggers"
        description="Webhooks, events, and schedules start these. Steps call tools, branch on conditions, pause for approval, or hand a task to the agent."
        actions={
          <ButtonLink href="/workflows/new">Create a workflow</ButtonLink>
        }
      />
      <ErrorBanner message={error} />
      <Card flush>
        {!workflows ? (
          <LoadingBlock />
        ) : workflows.length === 0 ? (
          <EmptyState title="No workflows">Installing an application adds its workflows here.</EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="table-head pl-5">Workflow</th>
                <th className="table-head">Agent</th>
                <th className="table-head">Trigger</th>
                <th className="table-head">Steps</th>
                <th className="table-head">Status</th>
                <th className="table-head">Last run</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="hover:bg-hover">
                  <td className="table-cell pl-5">
                    <Link href={`/workflows/${w.id}`} className="font-medium text-ink hover:text-action">{w.name}</Link>
                    <div className="line-clamp-1 text-label text-muted">{w.description}</div>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    {agents.get(w.agentId)?.name ?? '—'} <AppBadge application={w.application} />
                  </td>
                  <td className="table-cell whitespace-nowrap text-ink-soft">
                    {w.trigger.type}
                    {w.trigger.config.event && <span className="ml-1 font-mono text-label text-muted">{w.trigger.config.event}</span>}
                    {w.trigger.config.intervalMinutes && <span className="ml-1 text-label text-muted">every {w.trigger.config.intervalMinutes}m</span>}
                  </td>
                  <td className="table-cell text-label text-muted">{w.steps.map((s) => s.type.replace('_', ' ')).join(' → ')}</td>
                  <td className="table-cell"><StatusBadge status={w.status} /></td>
                  <td className="table-cell whitespace-nowrap text-label text-muted">{timeAgo(w.lastRunAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
