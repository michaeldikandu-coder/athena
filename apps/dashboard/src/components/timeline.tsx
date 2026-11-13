'use client';

import clsx from 'clsx';
import { useState } from 'react';
import type { TimelineEvent } from '@/lib/types';
import { formatTime } from '@/lib/format';
import { Badge, JsonBlock } from './ui';

const TYPE_LABEL: Record<TimelineEvent['type'], string> = {
  agent_reasoning: 'Agent',
  tool_call: 'Tool call',
  tool_result: 'Result',
  approval_request: 'Approval requested',
  approval_decision: 'Approval decision',
  error: 'Error',
  status_change: 'Status',
};

function dotClass(event: TimelineEvent): string {
  if (event.status === 'failure' || event.type === 'error') return 'bg-red-400';
  if (event.type === 'approval_request') return 'bg-amber-400';
  if (event.type === 'approval_decision') return event.status === 'success' ? 'bg-emerald-400' : 'bg-red-400';
  if (event.type === 'tool_call') return 'bg-sky-400';
  if (event.type === 'tool_result') return 'bg-emerald-400';
  if (event.type === 'agent_reasoning') return 'bg-accent-400';
  return 'bg-ink-600';
}

function Collapsible({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(!open)} className="text-xs text-ink-400 hover:text-ink-100">
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <JsonBlock value={value} className="mt-1" />}
    </div>
  );
}

function EventBody({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case 'agent_reasoning':
      return (
        <div>
          {event.output?.reasoning && (
            <p className="mb-1.5 whitespace-pre-wrap border-l-2 border-ink-700 pl-2 text-xs italic text-ink-400">
              {event.output.reasoning}
            </p>
          )}
          {event.output?.text && <p className="whitespace-pre-wrap text-sm text-ink-100">{event.output.text}</p>}
        </div>
      );
    case 'tool_call':
      return (
        <div>
          <span className="font-mono text-sm text-sky-300">{event.tool}</span>
          <Collapsible label="input" value={event.input} />
        </div>
      );
    case 'tool_result':
      return (
        <div>
          <span className="font-mono text-sm text-ink-300">{event.tool}</span>{' '}
          {event.status === 'failure' ? (
            <span className="text-sm text-red-300">failed: {String(event.output?.error ?? '')}</span>
          ) : (
            <span className="text-sm text-emerald-300">ok</span>
          )}
          {event.metadata?.executionTime !== undefined && (
            <span className="ml-2 text-xs text-ink-400">{event.metadata.executionTime}ms</span>
          )}
          {event.status !== 'failure' && <Collapsible label="output" value={event.output?.data ?? event.output} />}
        </div>
      );
    case 'approval_request':
      return (
        <div className="text-sm">
          <span className="text-amber-300">Waiting for a human to approve </span>
          <span className="font-mono text-amber-200">{event.tool}</span>
          <Collapsible label="requested input" value={event.input} />
        </div>
      );
    case 'approval_decision':
      return (
        <div className="text-sm">
          <span className={event.status === 'success' ? 'text-emerald-300' : 'text-red-300'}>
            {String(event.output?.status ?? '')}
          </span>{' '}
          <span className="font-mono text-ink-300">{event.tool}</span>
          {event.output?.comment && <span className="text-ink-400"> — “{event.output.comment}”</span>}
        </div>
      );
    case 'error':
      return <p className="text-sm text-red-300">{event.output?.message ?? 'Error'}</p>;
    case 'status_change':
      if (event.output?.step) {
        return (
          <p className="text-sm text-ink-300">
            Workflow step <span className="font-mono">{event.output.step}</span>{' '}
            <Badge>{event.output.stepType}</Badge>
          </p>
        );
      }
      return (
        <p className="text-sm text-ink-300">
          Execution {String(event.output?.status ?? '').replace('_', ' ')}
          {event.output?.error && <span className="text-red-300">: {event.output.error}</span>}
        </p>
      );
    default:
      return <JsonBlock value={event} />;
  }
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-400">No events yet.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-ink-800 pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className={clsx('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-ink-900', dotClass(event))}
          />
          <div className="mb-0.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-400">
            <span>{TYPE_LABEL[event.type]}</span>
            <span className="font-mono normal-case">{formatTime(event.timestamp)}</span>
          </div>
          <EventBody event={event} />
        </li>
      ))}
    </ol>
  );
}
