'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AGENT_TEMPLATES, AgentTemplate, workflowDefinition } from '@/lib/agent-templates';
import type { Connection, ConnectionsResponse, ToolDescriptor } from '@/lib/types';
import { AgentForm, AgentFormValue, EMPTY_AGENT, formToBody } from '@/components/agent-form';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

const LABEL: Record<string, string> = { bachs: 'Bachs', github: 'GitHub', slack: 'Slack', services: 'Services' };

function fromTemplate(template: AgentTemplate, tools: ToolDescriptor[]): AgentFormValue {
  const permissions = new Set(['read:memory', 'write:memory']);
  for (const t of tools) if (template.agent.tools.includes(t.id)) t.requiredPermissions.forEach((p) => permissions.add(p));
  return {
    ...EMPTY_AGENT,
    name: template.agent.name,
    description: template.agent.description,
    systemPrompt: template.agent.systemPrompt,
    maxIterations: template.agent.maxIterations,
    tools: template.agent.tools,
    permissions: Array.from(permissions),
  };
}

export default function NewAgentPage() {
  const router = useRouter();
  const [tools, setTools] = useState<ToolDescriptor[] | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [chosen, setChosen] = useState<AgentTemplate | 'blank' | null>(null);
  const [withWorkflow, setWithWorkflow] = useState(true);

  useEffect(() => {
    void api<ToolDescriptor[]>('/tools').then(({ data }) => setTools(data)).catch(() => setTools([]));
    void api<ConnectionsResponse>('/connections').then(({ data }) => setConnections(data.connections)).catch(() => undefined);
  }, []);

  const connected = new Set(connections.filter((c) => c.connected).map((c) => c.provider));
  const template = chosen && chosen !== 'blank' ? chosen : null;

  if (!chosen) {
    return (
      <div className="max-w-5xl">
        <PageHeader
          eyebrow="Build"
          title="Create an agent"
          description="Start from a ready-made agent and change anything you like, or start from scratch."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {AGENT_TEMPLATES.map((t) => {
            const missing = t.needs.filter((n) => !connected.has(n));
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setChosen(t);
                  setWithWorkflow(Boolean(t.workflow));
                }}
                className="card-link flex flex-col gap-2 p-5 text-left"
              >
                <span className="text-[18px] font-medium text-ink">{t.name}</span>
                <span className="text-[15px] leading-relaxed text-ink-soft">{t.summary}</span>
                <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                  {t.needs.map((n) => (
                    <Badge key={n} tone={connected.has(n) ? 'ok' : 'neutral'}>
                      {LABEL[n]}{connected.has(n) ? ' ✓' : ''}
                    </Badge>
                  ))}
                  {t.workflow && <Badge tone="action">starts on its own</Badge>}
                  {missing.length > 0 && <span className="text-[13px] text-muted">connect {missing.map((m) => LABEL[m]).join(', ')} to use every tool</span>}
                </span>
              </button>
            );
          })}
          <button type="button" onClick={() => setChosen('blank')} className="card-link flex flex-col justify-center gap-2 border-dashed p-5 text-left">
            <span className="text-[18px] font-medium text-ink">Blank agent</span>
            <span className="text-[15px] text-ink-soft">Write your own instructions and pick the tools yourself.</span>
          </button>
        </div>
      </div>
    );
  }

  if (!tools) return null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow={template ? `Template: ${template.name}` : 'Build'}
        title={template ? `Set up ${template.name}` : 'Create an agent'}
        description={template ? 'Everything below is filled in. Change what you need, then create it.' : 'Describe the job, pick what the agent can do, and create it.'}
        actions={<Button variant="secondary" onClick={() => setChosen(null)}>Choose another template</Button>}
      />
      {template?.workflow && (
        <label className={clsx('card mb-5 flex cursor-pointer items-start gap-3 p-4', withWorkflow && 'border-action-line')}>
          <input type="checkbox" className="mt-1" checked={withWorkflow} onChange={(e) => setWithWorkflow(e.target.checked)} />
          <span>
            <span className="block text-[15px] font-medium text-ink">Also create the workflow “{template.workflow.name}”</span>
            <span className="text-[14px] text-ink-soft">{template.workflow.description} You can turn it off or edit it later.</span>
          </span>
        </label>
      )}
      <Card>
        <AgentForm
          key={template?.key ?? 'blank'}
          initial={template ? fromTemplate(template, tools) : EMPTY_AGENT}
          submitLabel="Create agent"
          onSubmit={async (value) => {
            const { data } = await api<{ id: string }>('/agents', { body: formToBody(value) });
            if (template?.workflow && withWorkflow) {
              const definition = workflowDefinition(template.workflow);
              const { data: wf } = await api<{ id: string }>('/workflows', {
                body: { name: template.workflow.name, description: template.workflow.description, agentId: data.id, ...definition },
              });
              router.push(`/workflows/${wf.id}`);
              return;
            }
            router.push(`/agents/${data.id}`);
          }}
        />
      </Card>
    </div>
  );
}
