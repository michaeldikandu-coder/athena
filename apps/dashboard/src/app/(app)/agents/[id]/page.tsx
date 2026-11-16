'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { AgentDetail, Execution } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { AgentForm, agentToForm, formToBody } from '@/components/agent-form';
import { ExecutionTable } from '@/components/execution-table';
import { AppBadge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        api<AgentDetail>(`/agents/${id}`),
        api<Execution[]>(`/executions?agentId=${id}&limit=10`),
      ]);
      setAgent(a.data);
      setExecutions(e.data);
    } catch (err) {
      setError(describeError(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const { data } = await api<{ executionId: string }>(`/agents/${id}/run`, { body: { task } });
      router.push(`/executions/${data.executionId}`);
    } catch (err) {
      setError(describeError(err));
      setRunning(false);
    }
  };

  const toggleStatus = async () => {
    if (!agent) return;
    try {
      await api(`/agents/${id}`, { method: 'PUT', body: { status: agent.status === 'active' ? 'inactive' : 'active' } });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  };

  const remove = async () => {
    if (!agent || !window.confirm(`Delete ${agent.name}, its workflows, and its memory? This cannot be undone.`)) return;
    try {
      await api(`/agents/${id}`, { method: 'DELETE' });
      router.push('/agents');
    } catch (err) {
      setError(describeError(err));
    }
  };

  const clearMemory = async () => {
    if (!window.confirm('Delete everything this agent remembers?')) return;
    try {
      await api(`/agents/${id}/memory`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  };

  if (error && !agent) return <ErrorBanner message={error} />;
  if (!agent) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {agent.name} <AppBadge application={agent.application} /> <StatusBadge status={agent.status} />
          </span>
        }
        description={agent.description}
        actions={
          <>
            <Button variant="secondary" onClick={() => void toggleStatus()}>
              {agent.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(!editing)}>
              {editing ? 'Close editor' : 'Edit'}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>Delete</Button>
          </>
        }
      />
      <ErrorBanner message={error} />

      {editing ? (
        <Card title="Configuration">
          <AgentForm
            initial={agentToForm(agent)}
            submitLabel="Save changes"
            onSubmit={async (value) => {
              await api(`/agents/${id}`, { method: 'PUT', body: formToBody(value) });
              setEditing(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
              await load();
            }}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {saved && <p className="text-[15px] text-ok">Saved.</p>}
          <Card title="Run a task">
            <form onSubmit={run} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={
                  agent.application === 'moneyguard'
                    ? 'Investigate charge ch_...'
                    : agent.application === 'opsguard'
                      ? 'Check whether all services are healthy'
                      : 'Describe the task'
                }
                value={task}
                maxLength={10000}
                onChange={(e) => setTask(e.target.value)}
                disabled={agent.status !== 'active'}
              />
              <Button type="submit" loading={running} disabled={!task.trim() || agent.status !== 'active'}>
                Run
              </Button>
            </form>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Configuration">
              <dl className="space-y-3 text-[15px]">
                <div>
                  <dt className="label">Model</dt>
                  <dd>{agent.modelConfig.provider} · <span className="font-mono">{agent.modelConfig.model}</span> · max {agent.maxIterations} iterations</dd>
                </div>
                <div>
                  <dt className="label">Tools ({agent.tools.length})</dt>
                  <dd className="flex flex-wrap gap-1">
                    {agent.tools.map((t) => (
                      <span key={t} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">{t}</span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="label">Permissions</dt>
                  <dd className="flex flex-wrap gap-1">
                    {agent.permissions.map((p) => (
                      <span key={p} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">{p}</span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="label">System prompt</dt>
                  <dd className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-bg p-3 font-mono text-label text-ink-soft">{agent.systemPrompt}</dd>
                </div>
              </dl>
            </Card>

            <Card
              title={`Memory (${agent.memories.length})`}
              actions={agent.memories.length > 0 && <Button size="sm" variant="ghost" onClick={() => void clearMemory()}>Clear</Button>}
            >
              {agent.memories.length === 0 ? (
                <EmptyState title="Nothing remembered yet">Facts and decisions from executions appear here.</EmptyState>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-auto">
                  {agent.memories.map((m) => (
                    <li key={m.id} className="rounded-md bg-bg p-2 text-[15px]">
                      <div className="mb-0.5 text-[11px] text-muted">{m.type} · {timeAgo(m.createdAt)}</div>
                      <p className="text-ink-soft">{m.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title={`Recent executions (${agent.stats.executions} total)`}>
            <ExecutionTable executions={executions} />
          </Card>
        </div>
      )}
    </div>
  );
}
