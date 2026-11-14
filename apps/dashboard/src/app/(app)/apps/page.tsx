'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Application } from '@/lib/types';
import { Arrow, Badge, Button, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

const TRIGGER: Record<string, string> = { webhook: 'Webhook', schedule: 'Schedule', event: 'Event', manual: 'Manual' };

export default function AppsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'anthropic' | 'groq'>('anthropic');
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApps((await api<Application[]>('/apps')).data);
    } catch (err) {
      setError(describeError(err));
      setApps([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const install = async (id: string) => {
    setInstalling(id);
    setError(null);
    try {
      await api(`/apps/${id}/install`, { body: { provider } });
      router.push(`/apps/${id}`);
    } catch (err) {
      setError(describeError(err));
      setInstalling(null);
    }
  };

  if (!apps) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Applications on the Athena runtime"
        description="Each application is an agent template, its tools, and its workflows. Installing one creates the agent and its workflows on your account."
        actions={
          <label className="flex items-center gap-3">
            <span className="text-[14px] text-muted">Model provider</span>
            <select className="input w-40" value={provider} onChange={(e) => setProvider(e.target.value as 'anthropic' | 'groq')}>
              <option value="anthropic">Anthropic Claude</option>
              <option value="groq">Groq</option>
            </select>
          </label>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        {apps.map((app) => (
          <article key={app.id} className="card flex flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="flex items-start gap-3">
                <span className={clsx('mt-1 h-10 w-1.5 rounded-full', app.id === 'moneyguard' ? 'bg-action' : 'bg-ink')} aria-hidden />
                <div>
                  <h2 className="text-[22px] leading-tight">{app.name}</h2>
                  <p className="mt-0.5 text-[15px] text-muted">{app.tagline}</p>
                </div>
              </div>
              {app.installed ? (
                <Button variant="secondary" onClick={() => router.push(`/apps/${app.id}`)}>
                  Open {app.name} <Arrow />
                </Button>
              ) : (
                <Button loading={installing === app.id} onClick={() => void install(app.id)}>
                  Install {app.name}
                </Button>
              )}
            </header>

            <div className="flex-1 space-y-6 p-5">
              <p className="text-[16px] leading-relaxed text-ink-soft">{app.description}</p>

              <div>
                <div className="label">{app.tools.length} tools</div>
                <div className="flex flex-wrap gap-1.5">
                  {app.tools.map((t) => (
                    <Badge key={t} tone={t === 'send_notification' ? 'action' : 'neutral'} className="mono font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="label">Workflows</div>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {app.workflows.map((w) => (
                    <li key={w.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="text-[15px] text-ink">{w.name}</span>
                      <span className="mono shrink-0 text-[12px] text-muted">
                        {w.trigger.config.event ?? (w.trigger.config.intervalMinutes ? `every ${w.trigger.config.intervalMinutes} min` : TRIGGER[w.trigger.type])}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="label">Server settings</div>
                <ul className="space-y-2">
                  {app.env.map((e) => (
                    <li key={e.name} className="flex items-start gap-2.5 text-[14px]">
                      <span
                        className={clsx(
                          'mt-[5px] h-2 w-2 shrink-0 rounded-full border',
                          e.configured ? 'border-ok bg-ok' : e.optional ? 'border-line-strong bg-transparent' : 'border-warn bg-warn'
                        )}
                        aria-label={e.configured ? 'Set' : e.optional ? 'Optional, not set' : 'Required, not set'}
                      />
                      <span className="text-ink-soft">
                        <span className="mono text-[13px] text-ink">{e.name}</span>
                        {e.optional && <span className="text-muted"> optional</span>} · {e.description}
                      </span>
                    </li>
                  ))}
                </ul>
                {!app.ready && (
                  <p className="mt-3 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[14px] text-warn">
                    A required setting is missing on the API server. The agent installs, and the tools that need it report a clear error until it is set.
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 text-[14px] text-muted">
        The highlighted <span className="mono">send_notification</span> tool is one implementation that both applications share.
      </p>
    </div>
  );
}
