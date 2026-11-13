'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Agent, ToolDescriptor } from '@/lib/types';
import { Badge, Button, ErrorBanner } from './ui';

export interface AgentFormValue {
  name: string;
  description: string;
  systemPrompt: string;
  provider: 'anthropic' | 'groq';
  model: string;
  maxIterations: number;
  permissions: string[];
  tools: string[];
}

export function agentToForm(agent: Agent): AgentFormValue {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    provider: agent.modelConfig.provider,
    model: agent.modelConfig.model,
    maxIterations: agent.maxIterations,
    permissions: agent.permissions,
    tools: agent.tools,
  };
}

export const EMPTY_AGENT: AgentFormValue = {
  name: '',
  description: '',
  systemPrompt: 'You are a helpful operations agent. Investigate carefully and explain your findings.',
  provider: 'anthropic',
  model: '',
  maxIterations: 15,
  permissions: ['read:memory', 'write:memory'],
  tools: [],
};

export function AgentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: AgentFormValue;
  submitLabel: string;
  onSubmit: (value: AgentFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<AgentFormValue>(initial);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [newPermission, setNewPermission] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ToolDescriptor[]>('/tools')
      .then(({ data }) => setTools(data.filter((t) => t.category !== 'memory')))
      .catch((err) => setError(describeError(err)));
  }, []);

  const set = <K extends keyof AgentFormValue>(key: K, v: AgentFormValue[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  // Permissions required by selected tools that the agent does not hold yet
  const missing = useMemo(() => {
    const required = new Set(tools.filter((t) => value.tools.includes(t.id)).flatMap((t) => t.requiredPermissions));
    return Array.from(required).filter((p) => !value.permissions.includes(p));
  }, [tools, value.tools, value.permissions]);

  const toggleTool = (id: string) =>
    set('tools', value.tools.includes(id) ? value.tools.filter((t) => t !== id) : [...value.tools, id]);

  const addPermission = (p: string) => {
    const trimmed = p.trim();
    if (trimmed && !value.permissions.includes(trimmed)) set('permissions', [...value.permissions, trimmed]);
    setNewPermission('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBanner message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" required maxLength={100} value={value.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" required maxLength={500} value={value.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">System prompt</label>
        <textarea
          className="input min-h-[12rem] font-mono text-xs"
          required
          minLength={10}
          maxLength={20000}
          value={value.systemPrompt}
          onChange={(e) => set('systemPrompt', e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label">Provider</label>
          <select className="input" value={value.provider} onChange={(e) => set('provider', e.target.value as 'anthropic' | 'groq')}>
            <option value="anthropic">Anthropic Claude</option>
            <option value="groq">Groq</option>
          </select>
        </div>
        <div>
          <label className="label">Model</label>
          <input className="input" placeholder="Server default" maxLength={100} value={value.model} onChange={(e) => set('model', e.target.value)} />
        </div>
        <div>
          <label className="label">Max iterations</label>
          <input className="input" type="number" min={1} max={50} value={value.maxIterations} onChange={(e) => set('maxIterations', Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className="label">Tools</label>
        <div className="grid gap-2 md:grid-cols-2">
          {tools.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-ink-800 p-2 hover:border-ink-700">
              <input type="checkbox" className="mt-1" checked={value.tools.includes(t.id)} onChange={() => toggleTool(t.id)} />
              <span>
                <span className="font-mono text-xs text-ink-100">{t.id}</span>{' '}
                <Badge tone={t.permissionLevel}>{t.permissionLevel}</Badge>
                {t.requiresApproval && <Badge tone="medium" className="ml-1">approval</Badge>}
                <span className="block text-xs text-ink-400">{t.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Permissions</label>
        <div className="mb-2 flex flex-wrap gap-1">
          {value.permissions.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => set('permissions', value.permissions.filter((x) => x !== p))}
              className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-300 hover:bg-red-500/20 hover:text-red-300"
              title="Remove"
            >
              {p} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input max-w-xs font-mono text-xs"
            placeholder="read:transactions"
            value={newPermission}
            onChange={(e) => setNewPermission(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPermission(newPermission);
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={() => addPermission(newPermission)}>Add</Button>
        </div>
        {missing.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            Selected tools need permissions this agent does not have:{' '}
            {missing.map((p) => (
              <button type="button" key={p} onClick={() => addPermission(p)} className="mr-1 font-mono underline">
                + {p}
              </button>
            ))}
            <span className="block text-amber-300/80">Without them, calls to those tools are denied at runtime.</span>
          </div>
        )}
      </div>

      <Button type="submit" loading={busy}>{submitLabel}</Button>
    </form>
  );
}

export function formToBody(value: AgentFormValue) {
  return {
    name: value.name,
    description: value.description,
    systemPrompt: value.systemPrompt,
    modelConfig: { provider: value.provider, model: value.model.trim() || undefined },
    maxIterations: value.maxIterations,
    permissions: value.permissions,
    tools: value.tools,
  };
}
