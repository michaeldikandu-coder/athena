'use client';

import Link from 'next/link';
import type { Execution } from '@/lib/types';
import { formatDuration, timeAgo } from '@/lib/format';
import { AppBadge, EmptyState, StatusBadge } from './ui';

export function ExecutionTable({ executions, emptyText }: { executions: Execution[]; emptyText?: string }) {
  if (executions.length === 0) {
    return <EmptyState title={emptyText ?? 'No executions yet'} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-head">Status</th>
            <th className="table-head">Agent</th>
            <th className="table-head">Task</th>
            <th className="table-head">Trigger</th>
            <th className="table-head">Tools</th>
            <th className="table-head">Duration</th>
            <th className="table-head">Started</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr key={e.id} className="hover:bg-ink-850">
              <td className="table-cell">
                <StatusBadge status={e.status} />
              </td>
              <td className="table-cell whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {e.agentName ?? '—'} <AppBadge application={e.application} />
                </div>
              </td>
              <td className="table-cell max-w-md">
                <Link href={`/executions/${e.id}`} className="line-clamp-2 text-ink-100 hover:text-accent-400">
                  {e.task ?? '(no task)'}
                </Link>
              </td>
              <td className="table-cell whitespace-nowrap text-ink-400">
                {e.trigger.type} · {e.trigger.source}
              </td>
              <td className="table-cell text-ink-300">{e.toolCallCount}</td>
              <td className="table-cell whitespace-nowrap text-ink-300">{formatDuration(e.durationMs)}</td>
              <td className="table-cell whitespace-nowrap text-ink-400">{timeAgo(e.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
