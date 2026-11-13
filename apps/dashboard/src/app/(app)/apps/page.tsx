'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Application } from '@/lib/types';
import { Badge, Button, Card, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

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
        title="Applications"
        description="Applications are configuration on top of the shared runtime: an agent template, a set of tools, and workflow templates. Installing one creates an agent and its workflows for your account."
        actions={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-400">LLM provider</span>
            <select className="input w-36" value={provider} onChange={(e) => setProvider(e.target.value as 'anthropic' | 'groq')}>
              <option value="anthropic">Claude</option>
              <option value="groq">Groq</option>
            </select>
          </div>
        }
      />
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {apps.map((app) => (
          <Card
            key={app.id}
            title={
              <span className="flex items-center gap-2">
                {app.name} <span className="font-normal text-ink-400">· {app.tagline}</span>
              </span>
            }
            actions={
              app.installed ? (
                <Button variant="secondary" size="sm" onClick={() => router.push(`/apps/${app.id}`)}>
                  Open
                </Button>
              ) : (
                <Button size="sm" loading={installing === app.id} onClick={() => void install(app.id)}>
                  Install
                </Button>
              )
            }
          >
            <p className="mb-4 text-sm text-ink-300">{app.description}</p>

            <div className="label">Tools</div>
            <div className="mb-4 flex flex-wrap gap-1">
              {app.tools.map((t) => (
                <Badge key={t} tone={t === 'send_notification' ? 'accent' : 'neutral'}>
                  {t}
                </Badge>
              ))}
            </div>

            <div className="label">Workflows</div>
            <ul className="mb-4 space-y-1 text-sm">
              {app.workflows.map((w) => (
                <li key={w.key}>
                  <span className="text-ink-100">{w.name}</span>{' '}
                  <span className="text-ink-400">
                    · {w.trigger.type}
                    {w.trigger.config.event ? ` (${w.trigger.config.event})` : ''}
                  </span>
                </li>
              ))}
            </ul>

            <div className="label">Configuration</div>
            <ul className="space-y-1 text-xs">
              {app.env.map((e) => (
                <li key={e.name} className="flex items-start gap-2">
                  <span className={e.configured ? 'text-emerald-400' : e.optional ? 'text-ink-400' : 'text-amber-400'}>
                    {e.configured ? '●' : '○'}
                  </span>
                  <span>
                    <span className="font-mono text-ink-300">{e.name}</span>
                    {e.optional && <span className="text-ink-400"> (optional)</span>}
                    <span className="text-ink-400"> — {e.description}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!app.ready && (
              <p className="mt-3 text-xs text-amber-300">
                Some required server settings are missing. The agent installs, but tools that depend on them will report an error until they are set.
              </p>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-400">
        Tools highlighted in purple are shared: both applications use the same implementation from the integrations package.
      </p>
    </div>
  );
}
