'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Application } from '@/lib/types';
import { ButtonLink, ErrorBanner, LoadingBlock, PageHeader, StatusBadge, TextLink } from './ui';

export interface AppDetail extends Application {
  installedWorkflows: Array<{ id: string; name: string; status: string; trigger: { type: string; config: Record<string, any> } }>;
}

const TRIGGER: Record<string, string> = { webhook: 'Webhook', schedule: 'Schedule', event: 'Event', manual: 'Manual' };

/**
 * Loads an application and renders its header. Children render only once installed.
 */
export function AppPage({ appId, children }: { appId: string; children: (app: AppDetail) => React.ReactNode }) {
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
        <PageHeader eyebrow={app.tagline} title={app.name} description={app.description} />
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-[16px] text-ink-soft">{app.name} is not installed on your account yet.</p>
          <ButtonLink href="/apps">Install {app.name}</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={app.tagline}
        title={app.name}
        description={app.description}
        actions={
          <div className="flex items-center gap-5">
            <TextLink href={`/agents/${app.agentId}`}>Agent settings</TextLink>
            <TextLink href={`/executions?application=${app.id}`}>All runs</TextLink>
          </div>
        }
      />
      <div className="mb-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {app.installedWorkflows.map((w) => (
          <Link key={w.id} href={`/workflows/${w.id}`} className="card-link flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label font-medium text-muted">{TRIGGER[w.trigger.type] ?? w.trigger.type}</span>
              <StatusBadge status={w.status} />
            </div>
            <span className="text-[15px] font-medium leading-snug text-ink">{w.name}</span>
            {w.trigger.config.event && <span className="mono truncate text-[12px] text-muted">{w.trigger.config.event}</span>}
          </Link>
        ))}
      </div>
      {children(app)}
    </div>
  );
}
