'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent } from '@/lib/types';
import { Button, Card, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

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

export default function NewWorkflowPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsed: { trigger: unknown; steps: unknown };
    try {
      parsed = JSON.parse(definition);
    } catch {
      setError('Definition is not valid JSON');
      return;
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

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Build" title="Create a workflow" description="Write the trigger and steps as JSON. The definition is validated before it is saved." />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={error} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Agent</label>
              <select className="input" required value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Definition (trigger and steps)</label>
            <textarea className="input min-h-[22rem] font-mono text-label" value={definition} onChange={(e) => setDefinition(e.target.value)} spellCheck={false} />
            <div className="mt-2 space-y-1 text-label text-muted">
              <p>Triggers: <span className="font-mono">event</span> (config.event, supports *), <span className="font-mono">webhook</span> (signed URL shown after saving), <span className="font-mono">schedule</span> (config.intervalMinutes), <span className="font-mono">manual</span>. Optional config.conditions filter the payload.</p>
              <p>Steps: <span className="font-mono">tool_call</span> {'{tool, input}'}, <span className="font-mono">agent_task</span> {'{task}'}, <span className="font-mono">approval</span> {'{message}'}, <span className="font-mono">condition</span> {'{conditions, then, else}'}. Templates: <span className="font-mono">{'{{trigger.payload.x}}'}</span>, <span className="font-mono">{'{{steps.<id>.output.y}}'}</span>.</p>
            </div>
          </div>
          <Button type="submit" loading={busy} disabled={!agentId}>Create workflow</Button>
        </form>
      </Card>
    </div>
  );
}
