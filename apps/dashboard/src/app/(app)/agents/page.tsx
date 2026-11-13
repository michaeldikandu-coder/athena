'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent } from '@/lib/types';
import { AppBadge, Button, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Agent[]>('/agents')
      .then(({ data }) => setAgents(data))
      .catch((err) => setError(describeError(err)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Agents are configuration: a prompt, a model, tools, and permissions. Application agents and custom agents run on the same runtime."
        actions={
          <Link href="/agents/new">
            <Button>New agent</Button>
          </Link>
        }
      />
      <ErrorBanner message={error} />
      {!agents ? (
        <LoadingBlock />
      ) : agents.length === 0 ? (
        <EmptyState title="No agents yet">Install an application or create a custom agent.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}`} className="rounded-lg border border-ink-800 bg-ink-900 p-4 hover:border-ink-700">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">{a.name}</span>
                <AppBadge application={a.application} />
                <span className="ml-auto"><StatusBadge status={a.status} /></span>
              </div>
              <p className="mb-3 line-clamp-2 text-sm text-ink-400">{a.description}</p>
              <div className="flex gap-4 text-xs text-ink-400">
                <span>{a.tools.length} tools</span>
                <span>{a.permissions.length} permissions</span>
                <span>{a.modelConfig.provider} · {a.modelConfig.model}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
