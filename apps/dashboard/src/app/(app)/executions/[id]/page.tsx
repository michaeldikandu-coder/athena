'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { ExecutionDetail, TimelineEvent } from '@/lib/types';
import { formatDuration, timeAgo } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { ApprovalCard } from '@/components/approval-card';
import { Timeline } from '@/components/timeline';
import {
  AppBadge,
  Button,
  Card,
  ErrorBanner,
  JsonBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  TextLink,
} from '@/components/ui';

const ACTIVE = ['pending', 'running', 'waiting_approval'];

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setExecution((await api<ExecutionDetail>(`/executions/${id}`)).data);
    } catch (err) {
      setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime((message) => {
    if (message.type === 'execution.event' && message.data.executionId === id) {
      const event = message.data as TimelineEvent;
      setExecution((prev) =>
        prev && !prev.timeline.some((e) => e.id === event.id) ? { ...prev, timeline: [...prev.timeline, event] } : prev
      );
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
  const isActive = ACTIVE.includes(execution.status);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {execution.agentName ?? 'Execution'} <StatusBadge status={execution.status} />
            <AppBadge application={execution.application} />
          </span>
        }
        description={execution.task}
        actions={
          isActive && (
            <Button variant="secondary" loading={cancelling} onClick={() => void cancel()}>
              Cancel
            </Button>
          )
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {pendingApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecided={() => void load()} />
          ))}

          {execution.result?.summary && (
            <Card title="Final report">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-100">{execution.result.summary}</p>
            </Card>
          )}
          {execution.error && (
            <Card title="Error">
              <p className="text-sm text-red-300">{execution.error}</p>
            </Card>
          )}

          <Card title={<span className="flex items-center gap-2">Timeline {isActive && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />}</span>}>
            <Timeline events={execution.timeline} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <Row label="Started">{timeAgo(execution.startedAt)}</Row>
              <Row label="Duration">{formatDuration(execution.durationMs)}</Row>
              <Row label="Iterations">{execution.iterations}</Row>
              <Row label="Tool calls">{execution.toolCallCount}</Row>
              <Row label="Tokens">
                {execution.usage.inputTokens.toLocaleString()} in · {execution.usage.outputTokens.toLocaleString()} out
              </Row>
              <Row label="Trigger">
                {execution.trigger.type} · {execution.trigger.source}
              </Row>
              <Row label="Agent">
                <TextLink href={`/agents/${execution.agentId}`}>{execution.agentName ?? execution.agentId}</TextLink>
              </Row>
              {execution.workflowId && (
                <Row label="Workflow">
                  <TextLink href={`/workflows/${execution.workflowId}`}>View</TextLink>
                </Row>
              )}
            </dl>
          </Card>
          <Card title="Trigger payload">
            <JsonBlock value={execution.trigger.payload} />
          </Card>
          {execution.approvals.length > pendingApprovals.length && (
            <Card title="Approval history">
              <ul className="space-y-2 text-sm">
                {execution.approvals
                  .filter((a) => a.status !== 'pending')
                  .map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{a.requestedAction.tool}</span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-right text-ink-100">{children}</dd>
    </div>
  );
}
