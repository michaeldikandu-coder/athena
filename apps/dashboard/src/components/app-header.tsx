'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, describeError } from '@/lib/api';
import type { Application } from '@/lib/types';
import { ErrorBanner, LoadingBlock, PageHeader, StatusBadge, TextLink } from './ui';

interface AppDetail extends Application {
  installedWorkflows: Array<{ id: string; name: string; status: string; trigger: { type: string; config: Record<string, any> } }>;
}

/**
 * Loads an application and renders its header. Children render only once installed.
 */
export function AppPage({
  appId,
  children,
}: {
  appId: string;
  children: (app: AppDetail) => React.ReactNode;
}) {
  const [app, setApp] = useState<AppDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApp((await api<AppDetail>(`/apps/${appId}`)).data);
    } catch (err) {
      setError(describeError(err));
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorBanner message={error} />;
  if (!app) return <LoadingBlock />;

  if (!app.installed) {
    return (
      <div>
        <PageHeader title={app.name} description={app.description} />
        <p className="text-sm text-ink-300">
          {app.name} is not installed. <TextLink href="/apps">Install it from Applications →</TextLink>
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <span>
            {app.name} <span className="text-base font-normal text-ink-400">· {app.tagline}</span>
          </span>
        }
        description={app.description}
        actions={
          <div className="flex gap-3 text-sm">
            <TextLink href={`/agents/${app.agentId}`}>Agent config</TextLink>
            <TextLink href={`/executions?application=${app.id}`}>Executions</TextLink>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {app.installedWorkflows.map((w) => (
          <Link
            key={w.id}
            href={`/workflows/${w.id}`}
            className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-xs hover:border-ink-700"
          >
            <StatusBadge status={w.status} />
            <span className="text-ink-100">{w.name}</span>
            <span className="text-ink-400">{w.trigger.type}</span>
          </Link>
        ))}
      </div>
      {children(app)}
    </div>
  );
}
