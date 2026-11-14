'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent } from '@/lib/types';
import { AppBadge, ButtonLink, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

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
        eyebrow="Build"
        title="Agents on the shared runtime"
        description="An agent is a prompt, a model, a set of tools, and the permissions to use them. Installed and custom agents run the same way."
        actions={
          <ButtonLink href="/agents/new">Create an agent</ButtonLink>
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
            <Link key={a.id} href={`/agents/${a.id}`} className="card-link block p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[17px] font-medium tracking-[-0.01em]">{a.name}</span>
                <AppBadge application={a.application} />
                <span className="ml-auto"><StatusBadge status={a.status} /></span>
              </div>
              <p className="mb-4 line-clamp-2 text-[15px] leading-relaxed text-ink-soft">{a.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-label text-muted">
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
