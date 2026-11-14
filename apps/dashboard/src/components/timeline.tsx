'use client';

import clsx from 'clsx';
import { useState } from 'react';
import type { TimelineEvent } from '@/lib/types';
import { formatTime } from '@/lib/format';
import { Badge, JsonBlock } from './ui';

const KIND: Record<TimelineEvent['type'], string> = {
  agent_reasoning: 'agent',
  tool_call: 'tool call',
  tool_result: 'result',
  approval_request: 'approval',
  approval_decision: 'decision',
  error: 'error',
  status_change: 'status',
};

function markerClass(event: TimelineEvent): string {
  if (event.status === 'failure' || event.type === 'error') return 'border-bad bg-bad';
  if (event.type === 'approval_request') return 'border-warn bg-warn';
  if (event.type === 'approval_decision') return event.status === 'success' ? 'border-ok bg-ok' : 'border-bad bg-bad';
  if (event.type === 'tool_result') return 'border-ok bg-ok';
  if (event.type === 'tool_call') return 'border-action bg-card';
  if (event.type === 'agent_reasoning') return 'border-ink bg-ink';
  return 'border-line-strong bg-card';
}

function Disclosure({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-label font-medium text-muted hover:bg-hover hover:text-ink"
      >
        <svg viewBox="0 0 12 12" className={clsx('h-3 w-3 transition-transform', open && 'rotate-90')} aria-hidden>
          <path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      {open && <JsonBlock value={value} className="mt-1.5" />}
    </div>
  );
}

function Body({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case 'agent_reasoning':
      return (
        <div className="space-y-2">
          {event.output?.reasoning && (
            <p className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 text-[14px] leading-relaxed text-muted">
              {event.output.reasoning}
            </p>
          )}
          {event.output?.text && <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-ink">{event.output.text}</p>}
        </div>
      );
    case 'tool_call':
      return (
        <div>
          <span className="mono text-[14px] font-medium text-action">{event.tool}</span>
          <Disclosure label="Input" value={event.input} />
        </div>
      );
    case 'tool_result':
      return (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[14px] text-ink-soft">{event.tool}</span>
            {event.status === 'failure' ? <Badge tone="bad">Failed</Badge> : <Badge tone="ok">Returned</Badge>}
            {event.metadata?.executionTime !== undefined && (
              <span className="mono text-[12px] text-muted">{event.metadata.executionTime} ms</span>
            )}
          </div>
          {event.status === 'failure' ? (
            <p className="mt-1.5 text-[15px] text-bad">{String(event.output?.error ?? '')}</p>
          ) : (
            <Disclosure label="Output" value={event.output?.data ?? event.output} />
          )}
        </div>
      );
    case 'approval_request':
      return (
        <div className="text-[15px]">
          <span className="text-ink">Paused for a person to approve </span>
          <span className="mono font-medium text-warn">{event.tool}</span>
          <Disclosure label="Requested input" value={event.input} />
        </div>
      );
    case 'approval_decision':
      return (
        <div className="flex flex-wrap items-center gap-2 text-[15px]">
          <Badge tone={event.status === 'success' ? 'ok' : 'bad'}>{String(event.output?.status ?? '')}</Badge>
          <span className="mono text-ink-soft">{event.tool}</span>
          {event.output?.comment && <span className="text-ink-soft">“{event.output.comment}”</span>}
        </div>
      );
    case 'error':
      return <p className="text-[15px] text-bad">{event.output?.message ?? 'Error'}</p>;
    case 'status_change':
      if (event.output?.step) {
        return (
          <p className="text-[15px] text-ink-soft">
            Step <span className="mono text-ink">{event.output.step}</span>{' '}
            <span className="text-muted">({String(event.output.stepType).replace('_', ' ')})</span>
          </p>
        );
      }
      return (
        <p className="text-[15px] text-ink-soft">
          Run {String(event.output?.status ?? '').replace('_', ' ')}
          {event.output?.error && <span className="text-bad">: {event.output.error}</span>}
        </p>
      );
    default:
      return <JsonBlock value={event} />;
  }
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-[15px] text-muted">Nothing has happened yet.</p>;
  }
  return (
    <ol className="relative">
      {events.map((event, i) => (
        <li key={event.id} className="grid grid-cols-[64px_20px_minmax(0,1fr)] sm:grid-cols-[76px_20px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
          <div className="pt-0.5 text-right">
            <div className="mono text-[12px] text-muted">{formatTime(event.timestamp)}</div>
            <div className="text-label text-muted">{KIND[event.type]}</div>
          </div>
          <div className="relative flex justify-center">
            {i < events.length - 1 && <span className="absolute top-3 h-[calc(100%+20px)] w-px bg-line" aria-hidden />}
            <span className={clsx('relative mt-1.5 h-2.5 w-2.5 rounded-full border-2', markerClass(event))} aria-hidden />
          </div>
          <div className="min-w-0">
            <Body event={event} />
          </div>
        </li>
      ))}
    </ol>
  );
}
