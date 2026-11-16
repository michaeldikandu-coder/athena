'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Agent, Application, ConnectionsResponse } from '@/lib/types';

const DISMISS_KEY = 'athena:getting-started-dismissed';

interface Step {
  title: string;
  text: string;
  href: string;
  action: string;
  done: boolean;
}

/**
 * First-run checklist on the overview. Each step has one button and ticks
 * itself off from real data; it disappears once everything is done.
 */
export function GettingStarted({ apps, totalRuns }: { apps: Application[]; totalRuns: number }) {
  const [connected, setConnected] = useState<string[] | null>(null);
  const [customAgents, setCustomAgents] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    void api<ConnectionsResponse>('/connections')
      .then(({ data }) => setConnected(data.connections.filter((c) => c.connected).map((c) => c.provider)))
      .catch(() => setConnected([]));
    void api<Agent[]>('/agents')
      .then(({ data }) => setCustomAgents(data.filter((a) => !a.application).length))
      .catch(() => undefined);
  }, []);

  if (!connected || dismissed) return null;

  const money = apps.find((a) => a.id === 'moneyguard');
  const ops = apps.find((a) => a.id === 'opsguard');
  const anyInstalled = Boolean(money?.installed || ops?.installed);
  const runHref = money?.installed ? '/apps/moneyguard' : ops?.installed ? '/apps/opsguard' : '/apps';

  const steps: Step[] = [
    {
      title: 'Connect an account',
      text: 'Paste a Bachs sandbox key, or add the services you want watched.',
      href: '/settings/connections',
      action: 'Open connections',
      done: connected.length > 0,
    },
    {
      title: 'Install an agent',
      text: 'MoneyGuard for payments, OpsGuard for services and deploys. One click each.',
      href: '/apps',
      action: 'Install',
      done: anyInstalled,
    },
    {
      title: 'Run your first investigation',
      text: money?.installed ? 'Pick a payment and press Investigate. Watch each step live.' : 'Report an incident or investigate a payment.',
      href: runHref,
      action: 'Start',
      done: totalRuns > 0,
    },
    {
      title: 'Make your own agent',
      text: 'Start from a template such as Refund Reviewer or Daily Ops Digest.',
      href: '/agents/new',
      action: 'Browse templates',
      done: customAgents > 0,
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="card mb-8 p-5" aria-labelledby="getting-started">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="text-[19px] font-medium tracking-[-0.01em]">Get started</h2>
          <p className="mt-0.5 text-[15px] text-ink-soft">{steps.length - remaining} of {steps.length} done</p>
        </div>
        <button
          type="button"
          className="text-[13px] text-muted hover:text-ink"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className={clsx('flex flex-col rounded-md border p-4', i === next ? 'border-action-line bg-action-soft' : 'border-line')}>
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
                  step.done ? 'bg-ok text-white' : i === next ? 'bg-action text-white' : 'border border-line-strong text-muted'
                )}
                aria-hidden
              >
                {step.done ? '✓' : i + 1}
              </span>
              <span className={clsx('text-[15px] font-medium', step.done ? 'text-muted line-through' : 'text-ink')}>{step.title}</span>
            </div>
            <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-soft">{step.text}</p>
            {!step.done && (
              <Link href={step.href} className={clsx('btn btn-sm mt-3 self-start', i === next ? 'btn-primary' : 'btn-secondary')}>
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
