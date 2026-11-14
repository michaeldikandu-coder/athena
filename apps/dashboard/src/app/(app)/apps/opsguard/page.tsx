'use client';

/* eslint-disable @next/next/no-img-element */
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AppPage } from '@/components/app-header';
import { Badge, Button, ButtonLink, EmptyState, ErrorBanner, LoadingBlock, Mono } from '@/components/ui';

interface HealthResult {
  name: string;
  url: string;
  healthy: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
  checkedAt: string;
}

interface Overview {
  services: HealthResult[];
  github: {
    configured: boolean;
    repo: string | null;
    failedRuns: Array<{ id: number; name: string; branch: string; createdAt: string; url: string }>;
    error: string | null;
  };
}

function OpsGuardContent() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [service, setService] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setOverview((await api<Overview>('/apps/opsguard/overview')).data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const investigate = async (text: string, svc?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ executionId: string }>('/apps/opsguard/investigate', {
        body: { description: text, service: svc || undefined },
      });
      router.push(`/executions/${data.executionId}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  const down = overview?.services.filter((s) => !s.healthy) ?? [];

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      <section className="card p-5">
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">Report an incident</h2>
        <p className="mt-1 text-[15px] text-ink-soft">Describe what people are seeing. OpsGuard checks services, logs, and recent deploys, then opens a ticket if something is broken.</p>
        <form
          className="mt-4 flex flex-col gap-2 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (description.trim().length >= 5) void investigate(description.trim(), service);
          }}
        >
          <label className="sr-only" htmlFor="incident">What is happening</label>
          <input
            id="incident"
            className="input flex-1"
            placeholder="Checkout times out for customers since 14:00"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="sr-only" htmlFor="incident-service">Service</label>
          <select id="incident-service" className="input md:w-52" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Any service</option>
            {overview?.services.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          <Button type="submit" loading={busy} disabled={description.trim().length < 5}>
            Start investigation
          </Button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[22px] leading-tight">Service health</h2>
            <p className="mt-1 text-[15px] text-muted">
              {overview
                ? overview.services.length === 0
                  ? 'No services configured.'
                  : down.length === 0
                    ? `All ${overview.services.length} services answered.`
                    : `${down.length} of ${overview.services.length} services ${down.length === 1 ? 'is' : 'are'} failing.`
                : 'Checking services'}
            </p>
          </div>
          <Button size="sm" variant="secondary" loading={refreshing} onClick={() => void load()}>
            Check again
          </Button>
        </div>
        {!overview ? (
          <LoadingBlock label="Checking services" />
        ) : overview.services.length === 0 ? (
          <EmptyState title="Add the services OpsGuard should watch" action={<ButtonLink href="/settings/connections#services">Add services</ButtonLink>}>
            Give each service a name and a health-check URL. OpsGuard only checks the URLs you list.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.services.map((s) => (
              <article key={s.name} className={clsx('card p-4', !s.healthy && 'border-bad-line')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx('h-2.5 w-2.5 rounded-full', s.healthy ? 'bg-ok' : 'live-dot bg-bad')} aria-hidden />
                      <h3 className="truncate text-[16px] font-medium">{s.name}</h3>
                    </div>
                    <Mono className="mt-1 block truncate text-[12px] text-muted">{s.url}</Mono>
                  </div>
                  <Badge tone={s.healthy ? 'ok' : 'bad'}>{s.healthy ? 'Up' : 'Down'}</Badge>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="flex gap-5">
                    <div>
                      <div className="text-label text-muted">Response</div>
                      <div className="mono text-[14px] text-ink">{s.status ?? s.error}</div>
                    </div>
                    <div>
                      <div className="text-label text-muted">Latency</div>
                      <div className="mono tabular text-[14px] text-ink">{s.latencyMs} ms</div>
                    </div>
                  </div>
                  {!s.healthy && (
                    <Button size="sm" disabled={busy} onClick={() => void investigate(`Service "${s.name}" is failing health checks (${s.status ?? s.error}).`, s.name)}>
                      Investigate
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/icons/github.svg" alt="" width={18} height={18} />
            <h2 className="text-[17px] font-medium tracking-[-0.01em]">Failed CI/CD runs</h2>
            {overview?.github.configured && overview.github.repo && <Mono>{overview.github.repo}</Mono>}
          </div>
        </header>
        {!overview ? (
          <div className="px-5"><LoadingBlock /></div>
        ) : !overview.github.configured ? (
          <div className="p-5">
            <EmptyState title="Connect GitHub to watch deploys" action={<ButtonLink href="/settings/connections#github">Connect GitHub</ButtonLink>}>
              Add a token and a repository. OpsGuard reads Actions runs and opens incident issues there.
            </EmptyState>
          </div>
        ) : overview.github.error ? (
          <div className="p-5"><ErrorBanner message={overview.github.error} /></div>
        ) : overview.github.failedRuns.length === 0 ? (
          <div className="p-5"><EmptyState title="No failed runs" /></div>
        ) : (
          <ul className="divide-y divide-line">
            {overview.github.failedRuns.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <a href={run.url} target="_blank" rel="noreferrer" className="link text-[15px] font-medium">{run.name}</a>
                  <div className="mt-0.5 text-[13px] text-muted">
                    <span className="mono">{run.branch}</span> · {timeAgo(run.createdAt)}
                  </div>
                </div>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void investigate(`GitHub Actions run ${run.id} ("${run.name}" on ${run.branch}) failed. Find out why and respond.`)}>
                  Investigate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function OpsGuardPage() {
  return <AppPage appId="opsguard">{() => <OpsGuardContent />}</AppPage>;
}
