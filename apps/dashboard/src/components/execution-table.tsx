'use client';

import Link from 'next/link';
import type { Execution } from '@/lib/types';
import { formatDuration, timeAgo } from '@/lib/format';
import { AppBadge, EmptyState, StatusBadge } from './ui';

const SOURCE: Record<string, string> = {
  bachs: 'Bachs webhook',
  github: 'GitHub webhook',
  webhook: 'Signed webhook',
  scheduler: 'Schedule',
  dashboard: 'Console',
  moneyguard: 'MoneyGuard page',
  opsguard: 'OpsGuard page',
  api: 'API event',
};

export function ExecutionTable({ executions, emptyText }: { executions: Execution[]; emptyText?: string }) {
  if (executions.length === 0) {
    return <div className="p-5"><EmptyState title={emptyText ?? 'No runs yet'} /></div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr>
            <th className="table-head pl-5">Status</th>
            <th className="table-head">Task</th>
            <th className="table-head">Agent</th>
            <th className="table-head">Started by</th>
            <th className="table-head text-right">Tools</th>
            <th className="table-head text-right">Time</th>
            <th className="table-head pr-5 text-right">Started</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr key={e.id} className="group transition-colors hover:bg-hover">
              <td className="table-cell pl-5"><StatusBadge status={e.status} /></td>
              <td className="table-cell max-w-[420px]">
                <Link href={`/executions/${e.id}`} className="line-clamp-2 font-medium text-ink group-hover:text-action">
                  {e.task ?? 'Untitled run'}
                </Link>
                {e.error && <p className="mt-0.5 line-clamp-1 text-[13px] text-bad">{e.error}</p>}
              </td>
              <td className="table-cell whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-ink-soft">{e.agentName ?? '—'}</span>
                  <AppBadge application={e.application} />
                </div>
              </td>
              <td className="table-cell whitespace-nowrap text-ink-soft">{SOURCE[e.trigger.source] ?? e.trigger.source}</td>
              <td className="table-cell tabular text-right text-ink-soft">{e.toolCallCount}</td>
              <td className="table-cell tabular whitespace-nowrap text-right text-ink-soft">{formatDuration(e.durationMs)}</td>
              <td className="table-cell whitespace-nowrap pr-5 text-right text-muted">{timeAgo(e.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
