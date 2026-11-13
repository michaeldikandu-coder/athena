'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Execution, Workflow } from '@/lib/types';
import { ExecutionTable } from '@/components/execution-table';
import { AppBadge, Badge, Button, Card, ErrorBanner, JsonBlock, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState('{}');
  const [running, setRunning] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, e] = await Promise.all([
        api<Workflow>(`/workflows/${id}`),
        api<Execution[]>(`/executions?workflowId=${id}&limit=10`),
      ]);
      setWorkflow(w.data);
      setExecutions(e.data);
    } catch (err) {
      setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload || '{}');
    } catch {
      setError('Payload is not valid JSON');
      return;
    }
    setRunning(true);
    try {
      const { data } = await api<{ executionId: string }>(`/workflows/${id}/run`, { body: { payload: parsed } });
      router.push(`/executions/${data.executionId}`);
    } catch (err) {
      setError(describeError(err));
      setRunning(false);
    }
  };

  const toggle = async () => {
    if (!workflow) return;
    try {
      await api(`/workflows/${id}`, { method: 'PUT', body: { status: workflow.status === 'active' ? 'inactive' : 'active' } });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  };

  const remove = async () => {
    if (!workflow || !window.confirm(`Delete workflow "${workflow.name}"?`)) return;
    try {
      await api(`/workflows/${id}`, { method: 'DELETE' });
      router.push('/workflows');
    } catch (err) {
      setError(describeError(err));
    }
  };

  if (error && !workflow) return <ErrorBanner message={error} />;
  if (!workflow) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {workflow.name} <AppBadge application={workflow.application} /> <StatusBadge status={workflow.status} />
          </span>
        }
        description={workflow.description}
        actions={
          <>
            <Button variant="secondary" onClick={() => void toggle()}>{workflow.status === 'active' ? 'Disable' : 'Enable'}</Button>
            <Button variant="danger" onClick={() => void remove()}>Delete</Button>
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Trigger">
          <p className="mb-2 text-sm">
            <Badge tone="accent">{workflow.trigger.type}</Badge>
            {workflow.trigger.config.event && <span className="ml-2 font-mono text-sm">{workflow.trigger.config.event}</span>}
            {workflow.trigger.config.intervalMinutes && <span className="ml-2 text-sm">every {workflow.trigger.config.intervalMinutes} minutes</span>}
          </p>
          {workflow.trigger.config.conditions && (
            <>
              <div className="label mt-3">Only when</div>
              <ul className="space-y-1 font-mono text-xs text-ink-300">
                {workflow.trigger.config.conditions.map((c: { path: string; operator: string; value?: unknown }, i: number) => (
                  <li key={i}>{c.path} {c.operator} {c.value !== undefined ? JSON.stringify(c.value) : ''}</li>
                ))}
              </ul>
            </>
          )}
          {workflow.trigger.type === 'webhook' && workflow.trigger.config.event?.startsWith('bachs.') && (
            <p className="mt-3 text-xs text-ink-400">Receives events from <span className="font-mono">POST /api/webhooks/bachs</span>. Add a Bachs webhook endpoint there subscribed to <span className="font-mono">{workflow.trigger.config.event.slice(6)}</span>.</p>
          )}
          {workflow.trigger.type === 'webhook' && workflow.trigger.config.event?.startsWith('github.') && (
            <p className="mt-3 text-xs text-ink-400">Receives events from <span className="font-mono">POST /api/webhooks/github</span>. Add a repository webhook pointing there.</p>
          )}
          {workflow.webhook && (
            <div className="mt-3 space-y-2 text-xs">
              <div>
                <div className="label">Workflow webhook URL</div>
                <code className="block break-all rounded bg-ink-950 p-2 text-ink-300">{workflow.webhook.url}</code>
              </div>
              <div>
                <div className="label">Signing secret</div>
                <code className="block break-all rounded bg-ink-950 p-2 text-ink-300">
                  {showSecret ? workflow.webhook.secret : '•'.repeat(24)}
                </code>
                <button className="mt-1 text-ink-400 hover:text-ink-100" onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Reveal'}</button>
                <p className="mt-1 text-ink-400">
                  Send <span className="font-mono">X-Athena-Signature: sha256=&lt;HMAC-SHA256 of the raw body&gt;</span>.
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card title="Run manually">
          <label className="label">Trigger payload (JSON)</label>
          <textarea className="input mb-3 min-h-[8rem] font-mono text-xs" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
          <Button loading={running} disabled={workflow.status !== 'active'} onClick={() => void run()}>Run workflow</Button>
          {workflow.status !== 'active' && <p className="mt-2 text-xs text-ink-400">Enable the workflow to run it.</p>}
        </Card>
      </div>

      <Card title="Steps" className="mt-6">
        <ol className="space-y-3">
          {workflow.steps.map((s, i) => (
            <li key={s.id} className="rounded-md border border-ink-800 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="text-ink-400">{i + 1}.</span>
                <span className="font-mono">{s.id}</span>
                <Badge>{s.type}</Badge>
                {s.type === 'tool_call' && <span className="font-mono text-xs text-sky-300">{String(s.config.tool)}</span>}
              </div>
              {s.type === 'agent_task' ? (
                <p className="whitespace-pre-wrap text-sm text-ink-300">{String(s.config.task)}</p>
              ) : (
                <JsonBlock value={s.config} />
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Recent runs" className="mt-6">
        <ExecutionTable executions={executions} emptyText="This workflow has not run yet" />
      </Card>
    </div>
  );
}
