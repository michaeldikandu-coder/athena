'use client';

import clsx from 'clsx';
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
 * Shown until every connection the app depends on is in place.
 */
function SetupChecklist({ app }: { app: AppDetail }) {
  const missing = app.connections.filter((c) => !c.connected);
  if (missing.every((c) => c.optional)) return null;
  return (
    <section className="card mb-8 p-5" aria-labelledby="setup-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="setup-title" className="text-[17px] font-medium tracking-[-0.01em]">Finish setting up {app.name}</h2>
          <p className="mt-1 text-[15px] text-ink-soft">Connect your own accounts. Keys are encrypted and only used for your runs.</p>
        </div>
        <ButtonLink href={`/settings/connections#${missing.find((c) => !c.optional)?.provider ?? ''}`}>Open connections</ButtonLink>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {app.connections.map((c) => (
          <li key={c.provider} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5 text-[14px]">
            <span
              className={clsx(
                'mt-[5px] h-2 w-2 shrink-0 rounded-full border',
                c.connected ? 'border-ok bg-ok' : c.optional ? 'border-line-strong' : 'border-warn bg-warn'
              )}
              aria-hidden
            />
            <span className="text-ink-soft">
              <Link href={`/settings/connections#${c.provider}`} className="font-medium text-ink hover:underline">
                {c.label}
              </Link>
              {c.connected ? ' · connected' : c.optional ? ' · optional' : ' · required'}
              <span className="block text-muted">{c.description}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
      <SetupChecklist app={app} />
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
