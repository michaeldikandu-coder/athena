'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { ExecutionDetail, TimelineEvent } from '@/lib/types';
import { formatDuration, timeAgo } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { ApprovalCard } from '@/components/approval-card';
import { Timeline } from '@/components/timeline';
import { AppBadge, Button, Card, Dl, ErrorBanner, JsonBlock, LoadingBlock, Mono, StatusBadge, TextLink } from '@/components/ui';

const ACTIVE = ['pending', 'running', 'waiting_approval'];

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setExecution((await api<ExecutionDetail>(`/executions/${id}`)).data);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Timeline events stream in over the socket, but counters (turns, tool calls, tokens) live on the
  // execution record. Refetch it at most once per second while events arrive.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void load();
    }, 1000);
  }, [load]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );

  useRealtime((message) => {
    if (message.type === 'execution.event' && message.data.executionId === id) {
      const event = message.data as TimelineEvent;
      setExecution((prev) =>
        prev && !prev.timeline.some((e) => e.id === event.id) ? { ...prev, timeline: [...prev.timeline, event] } : prev
      );
      scheduleRefresh();
    }
    if (
      (message.type === 'execution.status' || message.type === 'approval.requested' || message.type === 'approval.decided') &&
      message.data.executionId === id
    ) {
      void load();
    }
  });

  const cancel = async () => {
    setCancelling(true);
    try {
      await api(`/executions/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCancelling(false);
    }
  };

  if (error && !execution) return <ErrorBanner message={error} />;
  if (!execution) return <LoadingBlock />;

  const pendingApprovals = execution.approvals.filter((a) => a.status === 'pending');
  const decided = execution.approvals.filter((a) => a.status !== 'pending');
  const isActive = ACTIVE.includes(execution.status);
  const tools = execution.timeline.filter((e) => e.type === 'tool_result');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px] text-muted">
        Run <Mono>{execution.id}</Mono>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-[78ch]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={execution.status} />
            <AppBadge application={execution.application} />
            <span className="text-[14px] text-muted">
              {execution.agentName} · started {timeAgo(execution.startedAt)}
            </span>
          </div>
          <div className="overflow-hidden pb-1">
            <h1 className="enter-rise text-[clamp(24px,1.1vw+18px,32px)] leading-[1.15]">{execution.task ?? 'Untitled run'}</h1>
          </div>
        </div>
        {isActive && (
          <Button variant="secondary" loading={cancelling} onClick={() => void cancel()}>
            Cancel run
          </Button>
        )}
      </div>
      <ErrorBanner message={error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {pendingApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecided={() => void load()} />
          ))}

          {execution.result?.summary && (
            <Card title="Agent’s report">
              <p className="max-w-[72ch] whitespace-pre-wrap text-[16px] leading-[1.7] text-ink">{execution.result.summary}</p>
            </Card>
          )}
          {execution.error && (
            <div className="rounded-lg border border-bad-line bg-bad-soft p-5">
              <div className="text-label font-medium text-bad">Why the run failed</div>
              <p className="mt-1 text-[16px] text-ink">{execution.error}</p>
            </div>
          )}

          <Card
            title={
              <span className="flex items-center gap-2.5">
                Timeline
                {isActive && (
                  <span className="flex items-center gap-1.5 text-label font-medium text-action">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-action" /> live
                  </span>
                )}
              </span>
            }
            actions={<span className="tabular text-label text-muted">{execution.timeline.length} events</span>}
          >
            <Timeline events={execution.timeline} />
          </Card>
        </div>

        <aside className="space-y-5">
          <Card title="Run">
            <Dl
              rows={[
                ['Duration', formatDuration(execution.durationMs)],
                ['Model turns', execution.iterations],
                ['Tool calls', execution.toolCallCount],
                ['Tokens in', <span key="i" className="tabular">{execution.usage.inputTokens.toLocaleString()}</span>],
                ['Tokens out', <span key="o" className="tabular">{execution.usage.outputTokens.toLocaleString()}</span>],
                ['Started by', `${execution.trigger.type} · ${execution.trigger.source}`],
                ['Agent', <TextLink key="a" href={`/agents/${execution.agentId}`}>{execution.agentName ?? 'Agent'}</TextLink>],
                ...(execution.workflowId
                  ? ([['Workflow', <TextLink key="w" href={`/workflows/${execution.workflowId}`}>Open workflow</TextLink>]] as Array<[string, React.ReactNode]>)
                  : []),
              ]}
            />
          </Card>

          {tools.length > 0 && (
            <Card title="Tools used">
              <ul className="space-y-2">
                {tools.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <Mono className="truncate">{t.tool}</Mono>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === 'failure' ? 'bg-bad' : 'bg-ok'}`} aria-label={t.status === 'failure' ? 'failed' : 'ok'} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {decided.length > 0 && (
            <Card title="Decisions">
              <ul className="space-y-2.5">
                {decided.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Mono>{a.requestedAction.tool}</Mono>
                    <StatusBadge status={a.status} kind="approval" />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Trigger payload">
            <JsonBlock value={execution.trigger.payload} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
