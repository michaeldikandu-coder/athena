'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { TRIGGER_OPTIONS, workflowDefinition } from '@/lib/agent-templates';
import type { Agent } from '@/lib/types';
import { Button, ButtonLink, Card, EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

const EXAMPLE = {
  trigger: { type: 'event', config: { event: 'orders.delayed' } },
  steps: [
    { id: 'status', type: 'tool_call', config: { tool: 'get_system_status', input: {} } },
    {
      id: 'investigate',
      type: 'agent_task',
      config: {
        task: 'Order {{trigger.payload.orderId}} is delayed. System status: {{steps.status.output.summary}}. Find the cause and respond.',
      },
    },
  ],
};

const INTERVALS: Array<[number, string]> = [
  [15, 'every 15 minutes'],
  [60, 'every hour'],
  [360, 'every 6 hours'],
  [1440, 'every day'],
  [10080, 'every week'],
];

export default function NewWorkflowPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [mode, setMode] = useState<'simple' | 'json'>('simple');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [when, setWhen] = useState('manual');
  const [interval, setIntervalMinutes] = useState(60);
  const [task, setTask] = useState('');
  const [approvalFirst, setApprovalFirst] = useState(false);
  const [definition, setDefinition] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Agent[]>('/agents')
      .then(({ data }) => {
        setAgents(data);
        if (data[0]) setAgentId(data[0].id);
      })
      .catch((err) => setError(describeError(err)));
  }, []);

  const option = TRIGGER_OPTIONS.find((o) => o.value === when)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsed: { trigger: unknown; steps: unknown };
    if (mode === 'simple') {
      const choice = option.choice.kind === 'schedule' ? { kind: 'schedule' as const, intervalMinutes: interval } : option.choice;
      parsed = workflowDefinition({ name, description, trigger: choice, task, approvalFirst });
    } else {
      try {
        parsed = JSON.parse(definition);
      } catch {
        setError('Definition is not valid JSON');
        return;
      }
    }
    setBusy(true);
    try {
      const { data } = await api<{ id: string }>('/workflows', {
        body: { name, description, agentId, trigger: parsed.trigger, steps: parsed.steps },
      });
      router.push(`/workflows/${data.id}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  if (!agents) return <LoadingBlock />;
  if (agents.length === 0) {
    return (
      <div className="max-w-3xl">
        <PageHeader eyebrow="Build" title="Create a workflow" />
        <EmptyState title="Create an agent first" action={<ButtonLink href="/agents/new">Create an agent</ButtonLink>}>
          A workflow decides when an agent runs, so it needs an agent to start.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Build" title="Create a workflow" description="Choose when the agent should run and what it should do." />
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Editor">
        {(['simple', 'json'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={clsx('h-9 rounded-sm px-3 text-[14px] font-medium', mode === m ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
          >
            {m === 'simple' ? 'Simple' : 'Advanced (JSON)'}
          </button>
        ))}
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={error} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="wf-name">Name</label>
              <input id="wf-name" className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Review failed payments" />
            </div>
            <div>
              <label className="label" htmlFor="wf-agent">Agent</label>
              <select id="wf-agent" className="input" required value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="wf-desc">Description</label>
            <input id="wf-desc" className="input" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {mode === 'simple' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="wf-when">When</label>
                  <select id="wf-when" className="input" value={when} onChange={(e) => setWhen(e.target.value)}>
                    {TRIGGER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {option.choice.kind === 'schedule' && (
                  <div>
                    <label className="label" htmlFor="wf-interval">How often</label>
                    <select id="wf-interval" className="input" value={interval} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
                      {INTERVALS.map(([m, label]) => (
                        <option key={m} value={m}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="label" htmlFor="wf-task">What should the agent do?</label>
                <textarea
                  id="wf-task"
                  className="input min-h-[8rem]"
                  required
                  maxLength={5000}
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder={option.choice.kind === 'event' ? 'Investigate charge {{trigger.payload.data.charge_id}} and open a case.' : 'Check all services and post a summary.'}
                />
                <p className="mt-1.5 text-[13px] text-muted">
                  The event details are always passed to the agent.
                  {option.hint && <> You can also insert them in the text: <span className="mono">{option.hint}</span></>}
                  {option.choice.kind === 'webhook' && ' The signed webhook URL is shown after you save.'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={approvalFirst} onChange={(e) => setApprovalFirst(e.target.checked)} />
                Ask me before the agent starts
              </label>
            </>
          ) : (
            <div>
              <label className="label" htmlFor="wf-json">Definition (trigger and steps)</label>
              <textarea id="wf-json" className="input min-h-[22rem] font-mono text-label" value={definition} onChange={(e) => setDefinition(e.target.value)} spellCheck={false} />
              <div className="mt-2 space-y-1 text-label text-muted">
                <p>Triggers: <span className="font-mono">event</span> (config.event, supports *), <span className="font-mono">webhook</span> (signed URL shown after saving), <span className="font-mono">schedule</span> (config.intervalMinutes), <span className="font-mono">manual</span>. Optional config.conditions filter the payload.</p>
                <p>Steps: <span className="font-mono">tool_call</span> {'{tool, input}'}, <span className="font-mono">agent_task</span> {'{task}'}, <span className="font-mono">approval</span> {'{message}'}, <span className="font-mono">condition</span> {'{conditions, then, else}'}. Templates: <span className="font-mono">{'{{trigger.payload.x}}'}</span>, <span className="font-mono">{'{{steps.<id>.output.y}}'}</span>.</p>
              </div>
            </div>
          )}
          <Button type="submit" loading={busy} disabled={!agentId}>Create workflow</Button>
        </form>
      </Card>
    </div>
  );
}
